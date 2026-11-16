/* The trading rule. The live signal and the back test both use this file, so they always agree.

   RULE
     SuperTrend and HalfTrend point the same way        -> hold a trade in that direction.
     They point different ways                          -> no trade (an open trade is closed).
     A NEW trade also needs ADX >= the minimum ADX.     An open trade is never closed because of ADX. */
const { superTrend } = require('./superTrend');
const { halfTrend } = require('./halfTrend');
const { adx } = require('./adx');

/* Runs the three indicators on the candles (oldest first). `values` = the strategy values.
   `firstValidIndex` is the first candle where all three indicators have a value. */
const computeIndicators = (candles, values) => {
    return {
        superTrend: superTrend(candles, values.superTrend),
        halfTrend: halfTrend(candles, values.halfTrend),
        adx: adx(candles, values.adx),
        firstValidIndex: Math.max(values.superTrend.period, values.adx.period * 2 - 1)
    };
};

/* Decides the wanted position for the candle that just closed.
     currentPosition : 1 = buy, -1 = sell, 0 = no trade
     returns         : { target: 1 | -1 | 0, reason } */
const decideTarget = ({ currentPosition, superTrendTrend, halfTrendTrend, adxValue, adxThreshold }) => {

    const trendsAgree = superTrendTrend !== 0 && superTrendTrend === halfTrendTrend;
    if (!trendsAgree) return { target: 0, reason: 'trend_disagree' };

    const direction = superTrendTrend;   /* 1 = both bull, -1 = both bear. */

    if (currentPosition === direction) return { target: direction, reason: 'hold' };

    const adxIsStrongEnough = Number.isFinite(adxValue) && adxValue >= adxThreshold;
    if (adxIsStrongEnough) return { target: direction, reason: 'entry' };

    return { target: 0, reason: 'adx_low' };
};

module.exports = { computeIndicators, decideTarget };
