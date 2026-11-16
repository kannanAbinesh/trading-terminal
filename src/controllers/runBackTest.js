/* Helpers. */
const { readBackTestRequest } = require('../helpers/backTestForm');
const { readDataset } = require('../helpers/backTestDataset');
const { runBackTest: runStrategyOnCandles } = require('../helpers/backTestEngine');
const { summarizeTrades } = require('../helpers/backTestSummary');
const { folderNameOf, isFinished, saveRun } = require('../helpers/backTestRuns');
const { isoOf, round } = require('../helpers/csv');

/* Variables. */
const MAX_CANDLES = 60000;      /* Candles tested and drawn per run. A longer range uses its newest 60000 candles. */
const WARMUP_CANDLES = 500;     /* Candles read before the start date, so the indicators are settled when trading starts. */
const MIN_CANDLES = 100;

/* A number for the graph file : rounded, or null when the indicator has no value yet. */
const roundOrNull = (value) => Number.isFinite(value) ? round(value, 2) : null;

/* The data of the result graphs, for the tested candles only. */
const buildChartData = (testedCandles, startIndex, indicators, equity) => {
    const { superTrend, halfTrend, adx } = indicators;

    /* Row formats : candle [time, open, high, low, close], indicator line [time, value, trend], adx [time, adx, +DI, -DI]. */
    return {
        candles: testedCandles.map((candle) => [candle.time, round(candle.open, 3), round(candle.high, 3), round(candle.low, 3), round(candle.close, 3)]),
        superTrend: testedCandles.map((candle, index) => [candle.time, round(superTrend.line[startIndex + index], 3), superTrend.trend[startIndex + index]]),
        halfTrend: testedCandles.map((candle, index) => [candle.time, round(halfTrend.line[startIndex + index], 3), halfTrend.trend[startIndex + index]]),
        adx: testedCandles.map((candle, index) => [candle.time, roundOrNull(adx.adx[startIndex + index]), roundOrNull(adx.plusDI[startIndex + index]), roundOrNull(adx.minusDI[startIndex + index])]),
        equity
    };
};

module.exports = {
    /* POST /api/v1/trading/runBackTest : runs the strategy on a dataset, saves the run in uploads/backTesting and returns the result. */
    runBackTest: async (req, res) => {
        try {

            /* Validate the form. */
            let request;
            try { request = await readBackTestRequest(req.body); } catch (error) { return res.status(400).json({ status: 400, message: error.message }); }
            const { name, dataset, from, to, config } = request;

            /* The name is the folder name, so it must be new. */
            const folder = folderNameOf(name);
            if (await isFinished(folder)) return res.status(409).json({ status: 409, message: `A back test named "${name}" already exists. Choose another name.` });

            /* Read the dataset : the date range plus the warm-up candles before it. */
            const data = await readDataset(dataset, {
                fromSeconds: from ? Date.parse(`${from}T00:00:00Z`) / 1000 : null,
                toSeconds: to ? Date.parse(`${to}T00:00:00Z`) / 1000 + 86399 : null,
                warmupCandles: WARMUP_CANDLES,
                maxCandles: MAX_CANDLES
            });

            const availableCandles = data.candles.length - data.startIndex;
            if (availableCandles < MIN_CANDLES) {
                return res.status(400).json({ status: 400, message: `Only ${Math.max(0, availableCandles)} candles found in this range (need at least ${MIN_CANDLES})` });
            };

            const note = data.truncated
                ? `This range has more than ${MAX_CANDLES} candles, so the newest ${MAX_CANDLES} candles were tested (from ${isoOf(data.candles[data.startIndex].time).slice(0, 10)}). Choose a shorter range to test an older period.`
                : '';

            /* Run the strategy. */
            const { trades, equity, indicators, startIndex } = runStrategyOnCandles(data.candles, data.startIndex, config);
            const summary = summarizeTrades(trades, equity, config.trade.initialBalance);

            const testedCandles = data.candles.slice(startIndex);
            const chart = buildChartData(testedCandles, startIndex, indicators, equity);
            const meta = {
                name,
                folder,
                createdAt: new Date().toISOString(),
                dataset,
                from: isoOf(testedCandles[0].time),
                to: isoOf(testedCandles[testedCandles.length - 1].time),
                candleCount: testedCandles.length,
                note,
                config,
                summary
            };

            await saveRun(folder, { meta, trades, chart });   /* Fails with EEXIST when two runs use the same name at the same moment. */

            return res.status(200).json({ status: 200, meta, trades, chart });

        } catch (error) {
            if (error && error.code === 'EEXIST') return res.status(409).json({ status: 409, message: 'A back test with this name already exists. Choose another name.' });
            return res.status(400).json({ status: 400, message: error.message || `Something went wrong in the back test : ${error}` });
        };
    }
};
