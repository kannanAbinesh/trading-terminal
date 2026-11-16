/* Checks the "New back test" form and turns it into the settings the engine needs.
   Throws an Error with a readable message when something is not valid (the page shows it in a toast).

   A strategy value that is left empty uses the saved strategy value (Strategy Values page). */
const path = require('path');

const { DATASETS } = require('./paths');
const { exists } = require('./csv');
const { readNumber } = require('./numberField');
const { readStrategyValues, mergeStrategyValues } = require('./strategyValues');

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/* The name becomes the folder name of the saved test. */
const readName = (body) => {
    const name = String(body.name || '').trim();
    if (!/^[A-Za-z0-9 _-]{1,60}$/.test(name)) throw new Error('Name is required (letters, numbers, space, - and _ only, max 60 characters)');
    return name;
};

/* The dataset must be a CSV file that exists in uploads/datasets. */
const readDataset = async (body) => {
    const dataset = String(body.dataset || '');
    const isPlainCsvName = dataset && path.basename(dataset) === dataset && dataset.toLowerCase().endsWith('.csv');

    if (!isPlainCsvName || !(await exists(path.join(DATASETS, dataset)))) {
        throw new Error('Select a dataset from the list (CSV files in uploads/datasets)');
    };
    return dataset;
};

const readDates = (body) => {
    const from = body.from ? String(body.from) : '';
    const to = body.to ? String(body.to) : '';

    if ((from && !DATE_FORMAT.test(from)) || (to && !DATE_FORMAT.test(to))) throw new Error('Dates must be in YYYY-MM-DD format');
    if (from && to && from > to) throw new Error('From date must be before the To date');
    return { from, to };
};

/* Account and cost settings. Empty = the default shown in the form. */
const readTradeSettings = (trade = {}) => ({
    initialBalance: readNumber({ label: 'Initial balance', value: trade.initialBalance, min: 100, max: 1e9, fallback: 10000 }),
    lots: readNumber({ label: 'Lot size', value: trade.lots, min: 0.01, max: 1000, fallback: 0.02 }),
    contractSize: readNumber({ label: 'Contract size', value: trade.contractSize, min: 1, max: 1e6, fallback: 100 }),
    spread: readNumber({ label: 'Spread', value: trade.spread, min: 0, max: 100, fallback: 0.3 }),
    commission: readNumber({ label: 'Commission per lot', value: trade.commission, min: 0, max: 1000, fallback: 0 }),
    stopLoss: readNumber({ label: 'Stop loss', value: trade.stopLoss, min: 0, max: 1e5, fallback: 0 }),
    takeProfit: readNumber({ label: 'Take profit', value: trade.takeProfit, min: 0, max: 1e5, fallback: 0 })
});

const readBackTestRequest = async (body = {}) => {
    const name = readName(body);
    const dataset = await readDataset(body);
    const { from, to } = readDates(body);

    const strategy = mergeStrategyValues(body, await readStrategyValues());
    const config = { ...strategy, trade: readTradeSettings(body.trade) };

    return { name, dataset, from, to, config };
};

module.exports = { readBackTestRequest };
