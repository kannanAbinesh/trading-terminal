/* HalfTrend indicator (the standard "HalfTrend" of everget / Alex Orekhov on TradingView).
   Input  : candles (oldest first) and the amplitude.
   Output : { trend, line }
              trend[i] = 1 (bull) | -1 (bear)
              line[i]  = the HalfTrend line

   Rule (same as the TradingView source) :
     highest high / lowest low and the average high / low of the last `amplitude` candles are used.
     The trend turns DOWN when the average high is below the highest "low" seen and the close is below the previous low.
     The trend turns UP   when the average low is above the lowest "high" seen and the close is above the previous high. */
const halfTrend = (candles, { amplitude }) => {

    if (candles.length < Math.max(amplitude, 2)) throw new Error('Not enough candles for HalfTrend.');

    const total = candles.length;
    const trend = new Int8Array(total);
    const line = new Float64Array(total).fill(NaN);

    /* State carried from candle to candle. */
    let isDown = false;
    let lookingForUp = true;     /* In the TradingView source this is "nextTrend" (0 = looking for an up turn). */
    let highestLow = candles[0].low;
    let lowestHigh = candles[0].high;
    let upLine = NaN;
    let downLine = NaN;

    for (let index = 0; index < total; index++) {
        const { close } = candles[index];
        const previousHigh = index > 0 ? candles[index - 1].high : candles[index].high;
        const previousLow = index > 0 ? candles[index - 1].low : candles[index].low;

        /* Highest high, lowest low and the averages of the last `amplitude` candles. */
        const windowStart = Math.max(0, index - amplitude + 1);
        let highestHigh = -Infinity;
        let lowestLow = Infinity;
        let highSum = 0;
        let lowSum = 0;
        for (let windowIndex = windowStart; windowIndex <= index; windowIndex++) {
            const candle = candles[windowIndex];
            if (candle.high > highestHigh) highestHigh = candle.high;
            if (candle.low < lowestLow) lowestLow = candle.low;
            highSum += candle.high;
            lowSum += candle.low;
        };
        const windowSize = index - windowStart + 1;
        const averageHigh = highSum / windowSize;
        const averageLow = lowSum / windowSize;

        /* Did the trend turn on this candle ? */
        const wasDown = isDown;
        if (!lookingForUp) {
            highestLow = Math.max(lowestLow, highestLow);
            if (averageHigh < highestLow && close < previousLow) {
                isDown = true;
                lookingForUp = true;
                lowestHigh = highestHigh;
            };
        } else {
            lowestHigh = Math.min(highestHigh, lowestHigh);
            if (averageLow > lowestHigh && close > previousHigh) {
                isDown = false;
                lookingForUp = false;
                highestLow = lowestLow;
            };
        };

        /* The line. When the trend turns, the new line continues from the old opposite line. */
        if (!isDown) {
            if (index > 0 && wasDown) upLine = downLine;
            else upLine = Number.isNaN(upLine) ? highestLow : Math.max(highestLow, upLine);
            line[index] = upLine;
        } else {
            if (index > 0 && !wasDown) downLine = upLine;
            else downLine = Number.isNaN(downLine) ? lowestHigh : Math.min(lowestHigh, downLine);
            line[index] = downLine;
        };

        trend[index] = isDown ? -1 : 1;
    };

    return { trend, line };
};

module.exports = { halfTrend };
