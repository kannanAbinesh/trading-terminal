/* Reads a price CSV from uploads/datasets.

   Accepted files : "Date;Open;High;Low;Close;Volume" (2024.01.02 10:00), Dukascopy, MT5 exports (<DATE> <TIME> ...), ISO dates,
   epoch seconds or milliseconds, with or without a header, separated by ; , or tab. Candle times are treated as UTC.

   Big files (the 1 minute file has millions of lines) are read line by line : only the requested range
   and the warm-up candles before it stay in memory. */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { DATASETS } = require('./paths');

const cleanHeaderName = (text) => String(text).replace(/["<>]/g, '').trim().toLowerCase();

/* Text like "2024.01.02 10:00" -> UTC seconds. Returns NaN when the text is not a time. */
const parseTime = (rawText) => {

    /* Fast path for the common "2024.01.02 10:00" / "2024-01-02 10:00:00" (millions of lines). */
    const looksLikeYearFirstDate = rawText.length >= 16 && rawText.charCodeAt(4) < 48 && rawText.charCodeAt(7) < 48;
    if (looksLikeYearFirstDate) {
        const year = +rawText.slice(0, 4);
        const month = +rawText.slice(5, 7);
        const day = +rawText.slice(8, 10);
        const hour = +rawText.slice(11, 13);
        const minute = +rawText.slice(14, 16);
        if (year > 0 && month > 0 && day > 0 && hour >= 0 && minute >= 0) return Date.UTC(year, month - 1, day, hour, minute) / 1000;
    };

    const text = String(rawText).replace(/"/g, '').trim();
    if (!text) return NaN;

    /* Epoch seconds or milliseconds. */
    if (/^\d+(\.\d+)?$/.test(text)) {
        const number = Number(text);
        return number > 1e11 ? Math.floor(number / 1000) : Math.floor(number);
    };

    /* 2024.01.02 10:00 | 2024-01-02T10:00:00 */
    let match = text.match(/^(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) return Date.UTC(+match[1], +match[2] - 1, +match[3], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0)) / 1000;

    /* 01.01.2020 00:00:00.000 */
    match = text.match(/^(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) return Date.UTC(+match[3], +match[2] - 1, +match[1], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0)) / 1000;

    return NaN;
};

/* Which column holds what, from the header names. */
const findColumns = (headerNames) => {
    const find = (acceptedNames) => headerNames.findIndex((name) => acceptedNames.includes(name));

    const open = find(['open']);
    const high = find(['high']);
    const low = find(['low']);
    const close = find(['close']);
    if ([open, high, low, close].some((index) => index < 0)) throw new Error('The CSV needs open, high, low and close columns');

    const dateTime = find(['gmt time', 'local time', 'datetime', 'date time', 'timestamp', 'time utc', 'time (utc)']);
    const date = find(['date']);
    const time = find(['time']);

    if (dateTime >= 0) return { time: dateTime, open, high, low, close };
    if (date >= 0 && time >= 0) return { date, time, open, high, low, close };   /* MT5 export : separate date and time columns. */
    if (time >= 0) return { time, open, high, low, close };
    if (date >= 0) return { time: date, open, high, low, close };
    return { time: 0, open, high, low, close };
};

const toNumber = (cell) => Number(String(cell).replace(/"/g, ''));

/* options : { fromSeconds, toSeconds, warmupCandles, maxCandles }
   Returns { candles, startIndex, truncated }
     candles    : [{ time, open, high, low, close }] oldest first (the warm-up candles + the range)
     startIndex : index of the first candle inside the range (the ones before it are only for the indicators to settle)
     truncated  : true when the range had more than maxCandles (the newest maxCandles are kept) */
const readDataset = async (fileName, { fromSeconds = null, toSeconds = null, warmupCandles = 0, maxCandles = Infinity } = {}) => {

    const lines = readline.createInterface({ input: fs.createReadStream(path.join(DATASETS, fileName)), crlfDelay: Infinity });
    const rangeStart = fromSeconds === null ? -Infinity : fromSeconds;

    let candles = [];
    let delimiter = null;
    let columns = null;
    let isSorted = true;
    let previousTime = -Infinity;
    let candlesBeforeRange = 0;
    let candlesInRange = 0;

    try {
        for await (const line of lines) {
            if (!line.trim()) continue;
            if (!delimiter) delimiter = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
            const cells = line.split(delimiter);

            /* First line : a header (find the columns) or already data (time,open,high,low,close). */
            if (!columns) {
                const headerNames = cells.map(cleanHeaderName);
                if (headerNames.includes('open') && headerNames.includes('close')) {
                    columns = findColumns(headerNames);
                    continue;
                };
                columns = { time: 0, open: 1, high: 2, low: 3, close: 4 };
            };

            const timeText = columns.date !== undefined ? `${cells[columns.date]} ${cells[columns.time]}` : cells[columns.time];
            const candle = {
                time: parseTime(timeText),
                open: toNumber(cells[columns.open]),
                high: toNumber(cells[columns.high]),
                low: toNumber(cells[columns.low]),
                close: toNumber(cells[columns.close])
            };
            if (!Object.values(candle).every(Number.isFinite)) continue;

            if (candle.time <= previousTime) isSorted = false;
            previousTime = candle.time;

            /* A sorted file : nothing after the end date matters. */
            if (isSorted && toSeconds !== null && candle.time > toSeconds) break;

            candles.push(candle);

            if (candle.time < rangeStart) {
                /* Warm-up area : only the newest `warmupCandles` are needed. They are cut now and then, not on every line (that would be slow). */
                candlesBeforeRange++;
                if (candlesBeforeRange > warmupCandles * 2 + 100) {
                    candles.splice(0, candlesBeforeRange - warmupCandles);
                    candlesBeforeRange = warmupCandles;
                };
            } else {
                candlesInRange++;
                if (candles.length > (maxCandles + warmupCandles) * 2) {
                    /* The range is longer than needed : drop the oldest candles. */
                    candles.splice(0, candles.length - (maxCandles + warmupCandles));
                    candlesBeforeRange = warmupCandles;
                };
            };
        };
    } finally { lines.close(); }

    /* Not in time order (or duplicates) : sort and remove the duplicates. */
    if (!isSorted) {
        candles.sort((first, second) => first.time - second.time);
        candles = candles.filter((candle, index) => index === 0 || candle.time !== candles[index - 1].time);
        if (toSeconds !== null) candles = candles.filter((candle) => candle.time <= toSeconds);
    };

    /* Where the range starts, cut to the newest maxCandles. */
    let startIndex = candles.findIndex((candle) => candle.time >= rangeStart);
    if (startIndex < 0) startIndex = candles.length;

    const totalInRange = isSorted ? candlesInRange : candles.length - startIndex;
    const truncated = totalInRange > maxCandles;
    if (candles.length - startIndex > maxCandles) startIndex = candles.length - maxCandles;

    /* Drop the warm-up candles that are not needed. */
    const unneeded = Math.max(0, startIndex - warmupCandles);
    if (unneeded) {
        candles = candles.slice(unneeded);
        startIndex -= unneeded;
    };

    return { candles, startIndex, truncated };
};

module.exports = { readDataset };
