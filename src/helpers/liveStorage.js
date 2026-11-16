/* Saves the live data sent by MT5 as files, and reads it back.
     candles  -> uploads/liveData/candles/<symbol>_<timeframe>.csv   (closed candles only)
     ticks    -> uploads/liveData/ticks/<symbol>_<day>.csv            (one file per UTC day)
     trades   -> uploads/liveTrades/live_trades.csv                   (every ticket once)
     account  -> uploads/liveData/account.json                        (so the Dashboard works after a restart) */
const path = require('path');
const fs = require('fs').promises;

const { toNumber, isoOf, safeName, round, csvCell, readCsvObjects, appendLines, readLastTime } = require('./csv');
const { LIVE_CANDLES, LIVE_TICKS, LIVE_TRADES_FILE, LIVE_ACCOUNT_FILE } = require('./paths');

const CANDLE_HEADER = 'time,datetime_utc,open,high,low,close,volume';
const TICK_HEADER = 'time_msc,datetime_utc,bid,ask';
const TRADE_HEADER = 'ticket,symbol,type,lots,entry_time,entry_datetime,entry_price,exit_time,exit_datetime,exit_price,profit,swap,commission,pnl,exit_reason,comment';
const ACCOUNT_SAVE_INTERVAL_MS = 10000;   /* The account file is written at most once in 10 seconds. */

const lastSavedCandleTime = new Map();    /* CSV file -> time of the newest closed candle already saved. */
const lastSavedTickTime = new Map();      /* Symbol -> time (ms) of the newest tick already saved. */
let savedTickets = null;                  /* Tickets already in the trades CSV (read once). */
let lastAccountSaveAt = 0;

/* A number, or the fallback when the value is missing or not a number. */
const numberOr = (value, fallback) => Number.isFinite(toNumber(value)) ? toNumber(value) : fallback;

/* ---------- Candles : every candle except the newest one (it is still forming) is closed ---------- */

const saveClosedCandles = async (store) => {
    const file = path.join(LIVE_CANDLES, `${safeName(store.symbol)}_${safeName(store.timeframe)}.csv`);

    if (!lastSavedCandleTime.has(file)) lastSavedCandleTime.set(file, await readLastTime(file));
    const lastSavedTime = lastSavedCandleTime.get(file);

    const candles = store.candles;
    const newestClosedIndex = candles.length - 2;
    const lines = [];

    /* Walk back from the newest closed candle until one that was already saved. */
    for (let index = newestClosedIndex; index >= 0; index--) {
        const candle = candles[index];
        if (candle.time <= lastSavedTime) break;

        const line = [candle.time, isoOf(candle.time), candle.open, candle.high, candle.low, candle.close, candle.volume].join(',');
        lines.unshift(line);
    };

    if (lines.length === 0) return;

    lastSavedCandleTime.set(file, candles[newestClosedIndex].time);
    appendLines(file, CANDLE_HEADER, lines);
};

/* ---------- Ticks : one file per UTC day. Each tick from the EA is { t: time in ms, b: bid, a: ask } ---------- */

const saveTicks = (symbol, rawTicks) => {
    if (!Array.isArray(rawTicks) || rawTicks.length === 0) return;

    let lastSavedTime = lastSavedTickTime.get(symbol) || 0;
    const linesByDay = new Map();

    const ticks = rawTicks
        .map((tick) => ({ time: Math.floor(toNumber(tick.t)), bid: toNumber(tick.b), ask: toNumber(tick.a) }))
        .filter((tick) => Number.isFinite(tick.time) && Number.isFinite(tick.bid) && Number.isFinite(tick.ask))
        .sort((first, second) => first.time - second.time);

    ticks.forEach((tick) => {
        if (tick.time <= lastSavedTime) return;   /* Already saved (the EA sends a tick again after a failed call). */
        lastSavedTime = tick.time;

        const isoTime = new Date(tick.time).toISOString();
        const day = isoTime.slice(0, 10);
        if (!linesByDay.has(day)) linesByDay.set(day, []);
        linesByDay.get(day).push(`${tick.time},${isoTime},${tick.bid},${tick.ask}`);
    });

    lastSavedTickTime.set(symbol, lastSavedTime);
    linesByDay.forEach((lines, day) => {
        appendLines(path.join(LIVE_TICKS, `${safeName(symbol)}_${day}.csv`), TICK_HEADER, lines);
    });
};

/* ---------- Closed trades (every ticket is saved once) ---------- */

/* Saves the trades that are new and returns them. */
const saveTrades = async (symbol, trades) => {
    if (!savedTickets) {
        savedTickets = new Set();
        const savedRows = await readCsvObjects(LIVE_TRADES_FILE);
        savedRows.forEach((row) => { if (row.ticket) savedTickets.add(row.ticket); });
    };

    const newTrades = [];
    const lines = [];

    trades.forEach((trade) => {
        const ticket = String((trade && trade.ticket) || '').trim();
        const entryTime = Math.floor(toNumber(trade && trade.entry_time));
        const exitTime = Math.floor(toNumber(trade && trade.exit_time));
        const entryPrice = toNumber(trade && trade.entry_price);
        const exitPrice = toNumber(trade && trade.exit_price);

        if (!ticket || savedTickets.has(ticket)) return;
        if (![entryTime, exitTime, entryPrice, exitPrice].every(Number.isFinite)) return;

        const profit = numberOr(trade.profit, 0);
        const swap = numberOr(trade.swap, 0);
        const commission = numberOr(trade.commission, 0);
        const pnl = round(profit + swap + commission, 2);
        const type = String(trade.type || '').toUpperCase();
        const tradeSymbol = trade.symbol || symbol || '';
        savedTickets.add(ticket);

        const columns = [
            ticket, tradeSymbol, type, numberOr(trade.lots, 0),
            entryTime, isoOf(entryTime), entryPrice,
            exitTime, isoOf(exitTime), exitPrice,
            profit, swap, commission, pnl, trade.exit_reason || '', trade.comment || ''
        ];
        lines.push(columns.map(csvCell).join(','));
        newTrades.push({ ticket, symbol: tradeSymbol, type, pnl });
    });

    await appendLines(LIVE_TRADES_FILE, TRADE_HEADER, lines);
    return newTrades;
};

/* Every saved trade with numbers as numbers, oldest exit first. */
const readTrades = async () => {
    const rows = await readCsvObjects(LIVE_TRADES_FILE);

    const trades = rows.map((row) => ({
        ticket: row.ticket,
        symbol: row.symbol,
        type: row.type,
        lots: Number(row.lots),
        entry_time: Number(row.entry_time),
        entry_price: Number(row.entry_price),
        exit_time: Number(row.exit_time),
        exit_price: Number(row.exit_price),
        profit: Number(row.profit),
        swap: Number(row.swap),
        commission: Number(row.commission),
        pnl: Number(row.pnl),
        exit_reason: row.exit_reason,
        comment: row.comment
    }));

    return trades
        .filter((trade) => Number.isFinite(trade.entry_time) && Number.isFinite(trade.exit_time))
        .sort((first, second) => first.exit_time - second.exit_time);
};

/* ---------- MT5 account ---------- */

/* The account sent by the EA, cleaned up. Returns null when it has no balance and no equity. */
const normalizeAccount = (rawAccount) => {
    if (!rawAccount || typeof rawAccount !== 'object') return null;

    const balance = toNumber(rawAccount.balance);
    const equity = toNumber(rawAccount.equity);
    if (!Number.isFinite(balance) && !Number.isFinite(equity)) return null;

    return {
        login: rawAccount.login !== undefined ? String(rawAccount.login) : '',
        name: rawAccount.name ? String(rawAccount.name) : '',
        server: rawAccount.server ? String(rawAccount.server) : '',
        currency: rawAccount.currency ? String(rawAccount.currency) : 'USD',
        leverage: numberOr(rawAccount.leverage, null),
        balance: Number.isFinite(balance) ? balance : equity,
        equity: Number.isFinite(equity) ? equity : balance,
        margin: numberOr(rawAccount.margin, 0),
        free_margin: numberOr(rawAccount.free_margin, null),
        updated_at: Date.now()
    };
};

const saveAccount = (account) => {
    if (Date.now() - lastAccountSaveAt < ACCOUNT_SAVE_INTERVAL_MS) return;
    lastAccountSaveAt = Date.now();

    fs.mkdir(path.dirname(LIVE_ACCOUNT_FILE), { recursive: true })
        .then(() => fs.writeFile(LIVE_ACCOUNT_FILE, JSON.stringify(account), 'utf8'))
        .catch((error) => console.error(`[LIVE ACCOUNT] ${error.message}`));
};

const loadAccount = async () => {
    try { return JSON.parse(await fs.readFile(LIVE_ACCOUNT_FILE, 'utf8')); } catch (error) { return null; };
};

/* ---------- Dashboard numbers ---------- */

const sumOf = (trades) => trades.reduce((total, trade) => total + trade.pnl, 0);

const buildStats = (trades, account) => {
    const winningTrades = trades.filter((trade) => trade.pnl > 0);
    const losingTrades = trades.filter((trade) => trade.pnl < 0);
    const netProfit = sumOf(trades);

    /* Equity curve : the balance after each closed trade. The start balance is the account balance minus all the trade results. */
    const startBalance = account ? account.balance - netProfit : 0;
    let runningBalance = startBalance;
    const curve = trades.map((trade) => {
        runningBalance += trade.pnl;
        return { time: trade.exit_time, value: round(runningBalance, 2) };
    });

    return {
        totals: {
            trades: trades.length,
            profitTrades: winningTrades.length,
            lossTrades: losingTrades.length,
            winRate: trades.length ? round(winningTrades.length / trades.length * 100, 1) : 0,
            netProfit: round(netProfit, 2),
            grossProfit: round(sumOf(winningTrades), 2),
            grossLoss: round(sumOf(losingTrades), 2)
        },
        startBalance: account ? round(startBalance, 2) : null,
        curve
    };
};

module.exports = { saveClosedCandles, saveTicks, saveTrades, readTrades, normalizeAccount, saveAccount, loadAccount, buildStats };
