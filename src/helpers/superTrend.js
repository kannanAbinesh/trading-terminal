/* SuperTrend indicator.
   Input  : candles (oldest first), ATR period and multiplier.
   Output : { trend, line }
              trend[i] =  1 (bull) | -1 (bear) | 0 (not ready yet)
              line[i]  = the SuperTrend line (below the price when bull, above it when bear). NaN while not ready. */
const superTrend = (candles, { period, multiplier }) => {

    if (candles.length < period + 1) throw new Error(`SuperTrend needs at least ${period + 1} candles.`);

    const total = candles.length;
    const trend = new Int8Array(total);
    const line = new Float64Array(total).fill(NaN);
    const finalUpper = new Float64Array(total).fill(NaN);
    const finalLower = new Float64Array(total).fill(NaN);

    let atr = NaN;
    let rangeSum = 0;   /* Sum of the first `period` true ranges (the first ATR is their average). */

    for (let index = 0; index < total; index++) {
        const { high, low, close } = candles[index];
        const previousClose = index > 0 ? candles[index - 1].close : close;

        /* True range of this candle. */
        const trueRange = index === 0
            ? high - low
            : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));

        /* ATR with Wilder smoothing. Not ready until `period` candles were seen. */
        if (index < period - 1) {
            rangeSum += trueRange;
            continue;
        };
        if (index === period - 1) {
            rangeSum += trueRange;
            atr = rangeSum / period;
        } else {
            atr = ((atr * (period - 1)) + trueRange) / period;
        };

        const middle = (high + low) / 2;
        const basicUpper = middle + multiplier * atr;
        const basicLower = middle - multiplier * atr;

        /* First ready candle : the bands are the basic bands and the trend starts as bull. */
        if (index === period - 1) {
            finalUpper[index] = basicUpper;
            finalLower[index] = basicLower;
            trend[index] = 1;
            line[index] = basicLower;
            continue;
        };

        /* The bands only move in the direction of the trend. */
        const previousUpper = finalUpper[index - 1];
        const previousLower = finalLower[index - 1];
        finalLower[index] = previousClose > previousLower ? Math.max(basicLower, previousLower) : basicLower;
        finalUpper[index] = previousClose < previousUpper ? Math.min(basicUpper, previousUpper) : basicUpper;

        /* The trend changes when the close goes beyond the opposite band. */
        const previousTrend = trend[index - 1];
        if (previousTrend === -1 && close > previousUpper) trend[index] = 1;
        else if (previousTrend === 1 && close < previousLower) trend[index] = -1;
        else trend[index] = previousTrend;

        line[index] = trend[index] === 1 ? finalLower[index] : finalUpper[index];
    };

    return { trend, line };
};

module.exports = { superTrend };
