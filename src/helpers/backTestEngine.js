/* Back test engine : goes through the candles one by one and uses the SAME trading rule as the live signal (strategy.js).

   Timing (no look-ahead, same as the live EA)
     A candle closes -> the indicators are read on it -> the order is filled at the OPEN of the next candle.
   Prices
     The datasets are BID prices. A BUY opens at the ask (open + spread) and closes at the bid. A SELL opens at the bid and closes at the ask.
   Profit
     direction * (exit - entry) * lots * contractSize - commission * lots
   Stop loss / take profit (optional, a price distance) are checked inside every candle. When both are touched, the stop loss wins. */
const { computeIndicators, decideTarget } = require('./strategy');
const { round } = require('./csv');

const BUY = 1;
const SELL = -1;

/* candles : warm-up candles + the candles to test (oldest first). The first trade can happen at index `firstTradeIndex` or later. */
const runBackTest = (candles, firstTradeIndex, config) => {

    const { lots, contractSize, spread, commission, stopLoss, takeProfit } = config.trade;

    const indicators = computeIndicators(candles, config);
    const superTrendTrend = indicators.superTrend.trend;
    const halfTrendTrend = indicators.halfTrend.trend;
    const adxValue = indicators.adx.adx;

    const total = candles.length;
    const startIndex = Math.max(firstTradeIndex, indicators.firstValidIndex + 1);
    if (total < startIndex + 2) throw new Error(`Not enough candles (${total}) for the indicators to settle. Choose a longer range.`);

    let balance = config.trade.initialBalance;
    let openTrade = null;       /* { direction, entryPrice, entryTime, stopPrice, targetPrice } */
    let wantedDirection = null; /* Decided on the previous close : 1, -1 or 0 (no trade). null = nothing decided. */
    const trades = [];
    const equity = [];

    const closeTrade = (time, price, reason) => {
        const move = openTrade.direction === BUY ? price - openTrade.entryPrice : openTrade.entryPrice - price;
        const profit = move * lots * contractSize - commission * lots;
        balance += profit;

        trades.push({
            no: trades.length + 1,
            type: openTrade.direction === BUY ? 'BUY' : 'SELL',
            lots,
            entry_time: openTrade.entryTime,
            entry_price: round(openTrade.entryPrice, 3),
            exit_time: time,
            exit_price: round(price, 3),
            pnl: round(profit, 2),
            exit_reason: reason,
            balance_after: round(balance, 2)
        });
        openTrade = null;
    };

    const openNewTrade = (direction, candle) => {
        const entryPrice = direction === BUY ? candle.open + spread : candle.open;
        openTrade = {
            direction,
            entryPrice,
            entryTime: candle.time,
            stopPrice: stopLoss > 0 ? entryPrice - direction * stopLoss : null,
            targetPrice: takeProfit > 0 ? entryPrice + direction * takeProfit : null
        };
    };

    for (let index = startIndex; index < total; index++) {
        const candle = candles[index];

        /* 1. The order decided on the previous close is filled at this candle's open. */
        if (wantedDirection !== null) {
            const currentDirection = openTrade ? openTrade.direction : 0;

            if (wantedDirection !== currentDirection) {
                if (openTrade) {
                    const closePrice = openTrade.direction === BUY ? candle.open : candle.open + spread;
                    closeTrade(candle.time, closePrice, 'SIGNAL');
                };
                if (wantedDirection !== 0) openNewTrade(wantedDirection, candle);
            };
            wantedDirection = null;
        };

        /* 2. Stop loss / take profit inside this candle. */
        if (openTrade) {
            const isBuy = openTrade.direction === BUY;
            const worstPrice = isBuy ? candle.low : candle.high + spread;
            const bestPrice = isBuy ? candle.high : candle.low + spread;

            const stopHit = openTrade.stopPrice !== null && (isBuy ? worstPrice <= openTrade.stopPrice : worstPrice >= openTrade.stopPrice);
            const targetHit = openTrade.targetPrice !== null && (isBuy ? bestPrice >= openTrade.targetPrice : bestPrice <= openTrade.targetPrice);

            if (stopHit) closeTrade(candle.time, openTrade.stopPrice, 'SL');
            else if (targetHit) closeTrade(candle.time, openTrade.targetPrice, 'TP');
        };

        /* 3. Equity at the close of this candle : balance + the profit of the open trade. */
        let floatingProfit = 0;
        if (openTrade) {
            const isBuy = openTrade.direction === BUY;
            const move = isBuy ? candle.close - openTrade.entryPrice : openTrade.entryPrice - (candle.close + spread);
            floatingProfit = move * lots * contractSize;
        };
        equity.push([candle.time, round(balance + floatingProfit, 2)]);

        /* 4. Read the signal on this close (it is filled on the next open). */
        const isLastCandle = index === total - 1;
        if (!isLastCandle) {
            wantedDirection = decideTarget({
                currentPosition: openTrade ? openTrade.direction : 0,
                superTrendTrend: superTrendTrend[index],
                halfTrendTrend: halfTrendTrend[index],
                adxValue: adxValue[index],
                adxThreshold: config.adx.threshold
            }).target;
        };
    };

    /* A trade still open at the end of the data is closed at the last close. */
    if (openTrade) {
        const lastCandle = candles[total - 1];
        const closePrice = openTrade.direction === BUY ? lastCandle.close : lastCandle.close + spread;
        closeTrade(lastCandle.time, closePrice, 'END');
        equity[equity.length - 1][1] = round(balance, 2);
    };

    return { trades, equity, indicators, startIndex };
};

module.exports = { runBackTest };
