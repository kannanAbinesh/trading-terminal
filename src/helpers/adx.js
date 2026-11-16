/* ADX indicator (Average Directional Index, Wilder smoothing).
   Input  : candles (oldest first) and the period.
   Output : { adx, plusDI, minusDI } as lists (NaN until there is enough history).
   Needs at least 2 x period candles. */
const adx = (candles, { period }) => {

    if (candles.length < period * 2) throw new Error(`ADX needs at least ${period * 2} candles.`);

    const total = candles.length;
    const trueRange = new Float64Array(total);
    const plusMove = new Float64Array(total);
    const minusMove = new Float64Array(total);
    const plusDI = new Float64Array(total).fill(NaN);
    const minusDI = new Float64Array(total).fill(NaN);
    const dx = new Float64Array(total).fill(NaN);
    const adxValue = new Float64Array(total).fill(NaN);

    /* True range, +DM and -DM of every candle (the first candle has no previous candle). */
    trueRange[0] = candles[0].high - candles[0].low;
    for (let index = 1; index < total; index++) {
        const { high, low } = candles[index];
        const previous = candles[index - 1];

        const upMove = high - previous.high;
        const downMove = previous.low - low;
        plusMove[index] = upMove > downMove && upMove > 0 ? upMove : 0;
        minusMove[index] = downMove > upMove && downMove > 0 ? downMove : 0;

        trueRange[index] = Math.max(high - low, Math.abs(high - previous.close), Math.abs(low - previous.close));
    };

    /* Wilder smoothing, then +DI, -DI and DX (they start at candle number `period`). */
    let smoothTrueRange = 0;
    let smoothPlusMove = 0;
    let smoothMinusMove = 0;

    for (let index = 1; index < total; index++) {
        if (index <= period) {
            smoothTrueRange += trueRange[index];
            smoothPlusMove += plusMove[index];
            smoothMinusMove += minusMove[index];
            if (index < period) continue;
        } else {
            smoothTrueRange = smoothTrueRange - (smoothTrueRange / period) + trueRange[index];
            smoothPlusMove = smoothPlusMove - (smoothPlusMove / period) + plusMove[index];
            smoothMinusMove = smoothMinusMove - (smoothMinusMove / period) + minusMove[index];
        };

        if (smoothTrueRange === 0) {
            plusDI[index] = 0;
            minusDI[index] = 0;
            dx[index] = 0;
            continue;
        };

        plusDI[index] = (smoothPlusMove / smoothTrueRange) * 100;
        minusDI[index] = (smoothMinusMove / smoothTrueRange) * 100;

        const diSum = plusDI[index] + minusDI[index];
        dx[index] = diSum === 0 ? 0 : (Math.abs(plusDI[index] - minusDI[index]) / diSum) * 100;
    };

    /* ADX : the first value is the average of the first `period` DX values, then Wilder smoothing. */
    const firstAdxIndex = (period * 2) - 1;
    let dxSum = 0;
    for (let index = period; index <= firstAdxIndex; index++) dxSum += dx[index];
    adxValue[firstAdxIndex] = dxSum / period;

    for (let index = firstAdxIndex + 1; index < total; index++) {
        adxValue[index] = ((adxValue[index - 1] * (period - 1)) + dx[index]) / period;
    };

    return { adx: adxValue, plusDI, minusDI };
};

module.exports = { adx };
