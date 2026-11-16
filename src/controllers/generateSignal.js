/* Helpers. */
const { computeIndicators, decideTarget } = require('../helpers/strategy');
const { readStrategyValues } = require('../helpers/strategyValues');
const { getNewsStatus } = require('../helpers/newsBlackout');
const { botControl, clearClosedDirection } = require('../helpers/botControl');
const { environment } = require('../../config');

/* Variables. */
const MIN_CANDLES = 300;   /* The indicators smooth over history, so they need this many closed candles to be trusted. */

/* "BUY" | "SELL" | anything else  ->  1 | -1 | 0 */
const positionToNumber = (position) => {
    const text = String(position || '').trim().toUpperCase();
    if (text === 'BUY') return 1;
    if (text === 'SELL') return -1;
    return 0;
};

/* 1 | -1 | 0  ->  "BUY" | "SELL" | "FLAT" */
const numberToTarget = (number) => {
    if (number === 1) return 'BUY';
    if (number === -1) return 'SELL';
    return 'FLAT';
};

/* Turns the candles sent by the EA into numbers, oldest first. Throws an Error when a candle is not valid. */
const readCandles = (rawCandles) => {
    if (!Array.isArray(rawCandles) || rawCandles.length === 0) throw new Error('Please send the required data (candles array).');

    const candles = rawCandles.map((candle) => ({
        time: Number(candle.time),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
    }));

    const allValid = candles.every((candle) => Object.values(candle).every(Number.isFinite));
    if (!allValid) throw new Error('Every candle needs a numeric time, open, high, low and close.');

    return candles.sort((first, second) => first.time - second.time);
};

module.exports = {
    /* POST /api/v1/trading/generateSignal (called by the MT5 EA on every new candle, no login cookie).
       Body     : { symbol, timeframe, position: "BUY" | "SELL" | "NONE", candles: [{ time, open, high, low, close, volume }] }
       Answer   : target_position = BUY | SELL | FLAT. The EA makes its position equal to it (FLAT = close everything).

       The target is FLAT when
         - SuperTrend and HalfTrend disagree, or ADX is too low for a new trade (trend rule),
         - it is the 30 minute window around a news event (news rule, every open trade is closed),
         - trading was stopped by hand (only new trades are blocked). */
    generateSignal: async (req, res) => {
        try {

            /* Validate the request. */
            let candles;
            try { candles = readCandles(req.body?.candles); } catch (error) { return res.status(400).json({ status: 400, message: error.message }); }

            if (candles.length < MIN_CANDLES) {
                return res.status(400).json({ status: 400, message: `Please send at least ${MIN_CANDLES} closed candles (1000 recommended). Received ${candles.length}.` });
            };

            /* Indicators on the saved strategy values. */
            const values = await readStrategyValues();
            const indicators = computeIndicators(candles, values);

            const last = candles.length - 1;
            const superTrendTrend = indicators.superTrend.trend[last];
            const halfTrendTrend = indicators.halfTrend.trend[last];
            const adxValue = indicators.adx.adx[last];
            const currentPosition = positionToNumber(req.body.position);

            /* Rule 1 : the trend rule. */
            let decision = decideTarget({ currentPosition, superTrendTrend, halfTrendTrend, adxValue, adxThreshold: values.adx.threshold });

            /* Rule 2 : the trade was closed by hand. The same trend is not entered again, the bot waits for a new trend.
               The wait ends when SuperTrend and HalfTrend stop pointing the closed way. */
            const closedDirection = botControl.closedDirection;
            if (closedDirection !== 0) {
                const sameTrendContinues = superTrendTrend === closedDirection && halfTrendTrend === closedDirection;
                if (sameTrendContinues) decision = { target: 0, reason: 'manual_close_waiting_new_trend' };
                else clearClosedDirection();
            };

            /* Rule 3 : trading is OFF. Only a NEW trade is blocked. */
            const wantsNewTrade = decision.target !== 0 && decision.target !== currentPosition;
            if (!botControl.tradingEnabled && wantsNewTrade) decision = { target: 0, reason: 'trading_stopped' };

            /* Rule 4 : news. Always wins : the open trade is closed and no trade is opened. */
            const news = await getNewsStatus();
            if (news.blackout) decision = { target: 0, reason: 'news_blackout' };

            const response = {
                status: 200,
                symbol: req.body.symbol || null,
                timeframe: req.body.timeframe || null,
                candle_time: candles[last].time,

                st_bull: superTrendTrend === 1,
                ht_bull: halfTrendTrend === 1,
                st_flipped: superTrendTrend !== indicators.superTrend.trend[last - 1],
                ht_flipped: halfTrendTrend !== indicators.halfTrend.trend[last - 1],

                adx: Number.isFinite(adxValue) ? Number(adxValue.toFixed(2)) : null,
                adx_min: values.adx.threshold,
                adx_ok: Number.isFinite(adxValue) && adxValue >= values.adx.threshold,

                trading_enabled: botControl.tradingEnabled,
                news_blackout: news.blackout,
                news_event: news.event ? `${news.event.currency} ${news.event.name}` : null,

                current_position: numberToTarget(currentPosition),
                target_position: numberToTarget(decision.target),
                reason: decision.reason
            };

            if (environment === 'DEVELOPMENT') {
                console.log(`[signal] ${response.symbol || ''} ${response.timeframe || ''} ST=${response.st_bull ? 'BULL' : 'BEAR'} HT=${response.ht_bull ? 'BULL' : 'BEAR'} ADX=${response.adx} -> ${response.target_position} (${response.reason})`);
            };

            return res.status(200).json(response);

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in signal generation : ${error.message}` }) };
    }
};
