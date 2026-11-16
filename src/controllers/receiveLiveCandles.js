/* Helpers. */
const { toNumber, safeName } = require('../helpers/csv');
const live = require('../helpers/liveStore');
const { saveClosedCandles, saveTicks, normalizeAccount, saveAccount } = require('../helpers/liveStorage');

const normalizeCandle = (item) => {
    if (!item || typeof item !== 'object') return null;
    const candle = {
        time: Math.floor(toNumber(item.time)),
        open: toNumber(item.open), high: toNumber(item.high), low: toNumber(item.low), close: toNumber(item.close),
        volume: Number.isFinite(toNumber(item.volume)) ? toNumber(item.volume) : 0
    };
    return [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ? candle : null;
};

module.exports = {
    /* POST /api/v1/trading/liveCandles (called by the MT5 EA every second, no cookie).
       Body : { symbol, timeframe, digits, bid, ask, history, position, account, candles[], ticks[] } */
    receiveLiveCandles: async (req, res) => {
        try {

            /* Variables. */
            const { symbol, timeframe, digits, bid, ask, history, position, account, candles, ticks } = req.body || {};

            /* Validate the request. */
            if (!symbol || !timeframe) return res.status(400).json({ status: 400, message: 'symbol and timeframe are required' });
            if (!Array.isArray(candles) || !candles.length) return res.status(400).json({ status: 400, message: 'candles array is required' });

            const incoming = candles.map(normalizeCandle).filter(Boolean).sort((first, second) => first.time - second.time);
            if (!incoming.length) return res.status(400).json({ status: 400, message: 'No valid candles received' });

            /* Update the store of this chart. History replaces the list, a live push only updates the newest candles. */
            const { key, store } = live.getStore(safeName(symbol), safeName(timeframe));
            if (history === true) store.candles = [];
            incoming.forEach((candle) => live.upsertCandle(store.candles, candle));
            if (store.candles.length > live.MAX_CANDLES) store.candles.splice(0, store.candles.length - live.MAX_CANDLES);

            store.digits = Number.isFinite(Number(digits)) ? Number(digits) : store.digits;
            store.bid = Number.isFinite(Number(bid)) ? Number(bid) : store.bid;
            store.ask = Number.isFinite(Number(ask)) ? Number(ask) : store.ask;
            store.position = position && position.type ? position : { type: 'NONE' };
            store.updated_at = Date.now();
            live.setActiveKey(key);

            /* Account balance / equity sent by the EA. */
            const newAccount = normalizeAccount(account);
            if (newAccount) { live.setAccount(newAccount); saveAccount(newAccount); }

            /* Save to CSV (closed candles and ticks). A failed write never stops the live chart. */
            saveClosedCandles(store).catch((error) => console.error(`[LIVE CSV] candles : ${error.message}`));
            saveTicks(symbol, ticks);

            /* Push to the open pages. */
            live.broadcastLive(key, history === true ? null : {
                candles: incoming, bid: store.bid, ask: store.ask, position: store.position, account: live.getAccount(), updated_at: store.updated_at
            });

            /* Tell the EA to send the history again if this server does not have enough candles (for example after a restart). */
            return res.status(200).json({ status: 200, need_history: store.candles.length < live.MIN_CANDLES });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in receiving the live candles : ${error}` }) };
    }
};
