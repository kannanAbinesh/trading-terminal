/* Helpers. */
const { isValidFolderName, isFinished, readRun } = require('../helpers/backTestRuns');
const { superTrend } = require('../helpers/superTrend');
const { halfTrend } = require('../helpers/halfTrend');
const { round } = require('../helpers/csv');

/* Back tests saved by an older version have no indicator lines and call the SuperTrend period "atrPeriod".
   The lines are calculated again from the saved candles, so those runs can also show them. */
const addMissingIndicatorLines = (run) => {
    const savedSuperTrend = run.meta.config.superTrend;
    if (savedSuperTrend.period === undefined) savedSuperTrend.period = savedSuperTrend.atrPeriod;
    delete savedSuperTrend.atrPeriod;

    if (run.chart.superTrend && run.chart.halfTrend) return run;

    const candles = run.chart.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
    if (candles.length <= savedSuperTrend.period) return run;

    const toRows = (indicator) => candles.map((candle, index) => [candle.time, round(indicator.line[index], 3), indicator.trend[index]]);
    run.chart.superTrend = toRows(superTrend(candles, savedSuperTrend));
    run.chart.halfTrend = toRows(halfTrend(candles, run.meta.config.halfTrend));
    return run;
};

module.exports = {
    /* GET /api/v1/trading/backTestResult?name=<folder> : one saved back test with its trades and graphs. */
    backTestResult: async (req, res) => {
        try {

            const folder = req.query.name;
            if (!isValidFolderName(folder)) return res.status(400).json({ status: 400, message: 'Invalid back test name' });
            if (!(await isFinished(folder))) return res.status(404).json({ status: 404, message: 'Back test not found' });

            const run = addMissingIndicatorLines(await readRun(folder));
            return res.status(200).json(run);

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the back test : ${error.message}` }) };
    }
};
