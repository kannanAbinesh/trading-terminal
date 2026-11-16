/* Small helpers for numbers, names and CSV files. */
const path = require('path');
const fs = require('fs').promises;

const writeQueues = new Map();   /* File path -> the last write on it. Writes to one file wait for each other. */

/* A number, or NaN for empty / true / false / text. (Number("") would give 0, which is wrong for a missing value.) */
const toNumber = (value) => {
    const isMissing = value === null || value === undefined || value === '' || typeof value === 'boolean';
    return isMissing ? NaN : Number(value);
};

/* UTC seconds -> "2026-11-13T09:15:00.000Z". */
const isoOf = (seconds) => new Date(seconds * 1000).toISOString();

/* Text that is safe to use in a file name. */
const safeName = (text) => String(text).replace(/[^A-Za-z0-9._-]/g, '_');

const round = (value, decimals = 2) => Number(Number(value).toFixed(decimals));

const exists = async (target) => {
    try { await fs.access(target); return true; } catch (error) { return false; };
};

/* One value as a CSV cell (quotes are added only when needed). */
const csvCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    const needsQuotes = /[",\n\r]/.test(text);
    return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
};

/* CSV text -> rows of cells. Handles "quoted, cells" and "" inside quotes. */
const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let cell = '';
    let insideQuotes = false;

    for (let position = 0; position < text.length; position++) {
        const character = text[position];

        if (insideQuotes) {
            if (character === '"' && text[position + 1] === '"') { cell += '"'; position++; }
            else if (character === '"') insideQuotes = false;
            else cell += character;
            continue;
        };

        if (character === '"') insideQuotes = true;
        else if (character === ',') { row.push(cell); cell = ''; }
        else if (character === '\n' || character === '\r') {
            if (character === '\r' && text[position + 1] === '\n') position++;   /* Windows line end. */
            row.push(cell);
            cell = '';
            const isEmptyLine = row.length === 1 && row[0] === '';
            if (!isEmptyLine) rows.push(row);
            row = [];
        } else cell += character;
    };

    if (cell !== '' || row.length) { row.push(cell); rows.push(row); };
    return rows;
};

/* A CSV file as a list of { columnName: value }. A missing file gives an empty list. */
const readCsvObjects = async (file) => {
    let text = '';
    try { text = await fs.readFile(file, 'utf8'); } catch (error) { return []; }

    const rows = parseCsv(text);
    const columnNames = rows.shift() || [];
    return rows.map((row) => Object.fromEntries(columnNames.map((name, index) => [name, row[index]])));
};

/* Adds lines at the end of a CSV file (the folder and the header line are created when needed). */
const appendLines = (file, header, lines) => {
    if (!lines.length) return Promise.resolve();

    const previousWrite = writeQueues.get(file) || Promise.resolve();
    const thisWrite = previousWrite.then(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        const headerText = (await exists(file)) ? '' : header + '\n';
        await fs.appendFile(file, headerText + lines.join('\n') + '\n', 'utf8');
    }).catch((error) => console.error(`[CSV] ${path.basename(file)} : ${error.message}`));

    writeQueues.set(file, thisWrite);
    return thisWrite;
};

/* The first column of the last line of a CSV file (0 for a new file). */
const readLastTime = async (file) => {
    try {
        const handle = await fs.open(file, 'r');
        const { size } = await handle.stat();
        const length = Math.min(size, 2048);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, size - length);
        await handle.close();

        const lines = buffer.toString('utf8').split('\n').map((line) => line.trim()).filter(Boolean);
        const time = Number((lines[lines.length - 1] || '').split(',')[0]);
        return Number.isFinite(time) ? time : 0;
    } catch (error) { return 0; };
};

module.exports = { toNumber, isoOf, safeName, round, exists, csvCell, readCsvObjects, appendLines, readLastTime };
