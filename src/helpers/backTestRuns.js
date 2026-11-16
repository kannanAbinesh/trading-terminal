/* Saved back tests : one folder per test in uploads/backTesting/<name>/
     meta.json    the settings and the summary (written LAST : a folder without it is not a finished test and is ignored)
     trades.csv   every trade
     chart.json   candles, SuperTrend, HalfTrend, ADX and equity for the graphs */
const path = require('path');
const fs = require('fs').promises;

const { BACK_TEST_RUNS } = require('./paths');
const { isoOf, exists } = require('./csv');

const TRADE_HEADER = 'no,type,lots,entry_time,entry_datetime,entry_price,exit_time,exit_datetime,exit_price,pnl,exit_reason,balance_after';

const isValidFolderName = (text) => /^[A-Za-z0-9_-]{1,60}$/.test(String(text || ''));
const folderNameOf = (testName) => testName.replace(/ +/g, '_');
const folderPathOf = (folderName) => path.join(BACK_TEST_RUNS, folderName);

/* A test is finished only when its meta.json exists. */
const isFinished = (folderName) => exists(path.join(folderPathOf(folderName), 'meta.json'));

const tradeToCsvLine = (trade) => [
    trade.no, trade.type, trade.lots,
    trade.entry_time, isoOf(trade.entry_time), trade.entry_price,
    trade.exit_time, isoOf(trade.exit_time), trade.exit_price,
    trade.pnl, trade.exit_reason, trade.balance_after
].join(',');

/* Creates the folder and writes the three files. Fails with EEXIST when the name is already used. */
const saveRun = async (folderName, { meta, trades, chart }) => {
    const folderPath = folderPathOf(folderName);
    const tradesCsv = [TRADE_HEADER, ...trades.map(tradeToCsvLine)].join('\n') + '\n';

    await fs.mkdir(BACK_TEST_RUNS, { recursive: true });

    /* A folder that is not finished is the leftover of a failed run : remove it so the name can be used again. */
    if (await exists(folderPath) && !(await isFinished(folderName))) await fs.rm(folderPath, { recursive: true, force: true });

    await fs.mkdir(folderPath);
    await fs.writeFile(path.join(folderPath, 'trades.csv'), tradesCsv, 'utf8');
    await fs.writeFile(path.join(folderPath, 'chart.json'), JSON.stringify(chart), 'utf8');
    await fs.writeFile(path.join(folderPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
};

const readTradesCsv = async (folderPath) => {
    const csv = await fs.readFile(path.join(folderPath, 'trades.csv'), 'utf8');

    return csv.split('\n').slice(1).filter((line) => line.trim()).map((line) => {
        const cells = line.split(',');
        return {
            no: Number(cells[0]),
            type: cells[1],
            lots: Number(cells[2]),
            entry_time: Number(cells[3]),
            entry_price: Number(cells[5]),
            exit_time: Number(cells[6]),
            exit_price: Number(cells[8]),
            pnl: Number(cells[9]),
            exit_reason: cells[10],
            balance_after: Number(cells[11])
        };
    });
};

/* One saved test with its trades and graph data. */
const readRun = async (folderName) => {
    const folderPath = folderPathOf(folderName);
    const meta = JSON.parse(await fs.readFile(path.join(folderPath, 'meta.json'), 'utf8'));
    const chart = JSON.parse(await fs.readFile(path.join(folderPath, 'chart.json'), 'utf8'));
    const trades = await readTradesCsv(folderPath);

    return { status: 200, meta, trades, chart };
};

/* The meta.json of every finished test, newest first. */
const listRuns = async () => {
    await fs.mkdir(BACK_TEST_RUNS, { recursive: true });

    const folders = (await fs.readdir(BACK_TEST_RUNS, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    const runs = [];

    for (const folder of folders) {
        try {
            runs.push(JSON.parse(await fs.readFile(path.join(BACK_TEST_RUNS, folder.name, 'meta.json'), 'utf8')));
        } catch (error) { /* Not a finished test. */ };
    };

    return runs.sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
};

module.exports = { isValidFolderName, folderNameOf, saveRun, isFinished, readRun, listRuns };
