/* Helpers. */
const live = require('../helpers/liveStore');
const { readStrategyValues, mergeStrategyValues } = require('../helpers/strategyValues');
const { superTrend } = require('../helpers/superTrend');
const { halfTrend } = require('../helpers/halfTrend');
const { round } = require('../helpers/csv');

/* [{ time, value, trend }] for the chart. The first candles (before the indicator is ready) are left out. */
const toChartPoints = (candles, indicator, firstIndex) => {
    const points = [];
    for (let index = firstIndex; index < candles.length; index++) {
        points.push({ time: candles[index].time, value: round(indicator.line[index], 3), trend: indicator.trend[index] });
    };
    return points;
};

module.exports = {
    /* GET /api/v1/trading/liveIndicators : the SuperTrend and HalfTrend lines of the live candles, for the Live Trade chart.
       Optional query (from the indicator popup) : superTrendPeriod, superTrendMultiplier, halfTrendAmplitude.
       A value that is not sent (or is empty) uses the saved strategy value. */
    liveIndicators: async (req, res) => {
        try {

            const store = live.getActiveStore();
            if (!store) return res.status(200).json({ status: 200, waiting: true });

            /* Values : what the popup sent, then the saved strategy values for everything else. */
            const typedValues = {
                superTrend: { period: req.query.superTrendPeriod, multiplier: req.query.superTrendMultiplier },
                halfTrend: { amplitude: req.query.halfTrendAmplitude }
            };
            let values;
            try { values = mergeStrategyValues(typedValues, await readStrategyValues()); } catch (error) { return res.status(400).json({ status: 400, message: error.message }); }

            /* Only the two trend lines are drawn (ADX is not needed here). */
            const candles = store.candles;
            const firstIndex = values.superTrend.period;
            if (candles.length < firstIndex + 2) return res.status(200).json({ status: 200, waiting: true });

            return res.status(200).json({
                status: 200,
                values: { superTrend: values.superTrend, halfTrend: values.halfTrend },
                superTrend: toChartPoints(candles, superTrend(candles, values.superTrend), firstIndex),
                halfTrend: toChartPoints(candles, halfTrend(candles, values.halfTrend), firstIndex)
            });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in calculating the live indicators : ${error.message}` }) };
    }
};
