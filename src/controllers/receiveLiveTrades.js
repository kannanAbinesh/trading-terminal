/* Helpers. */
const live = require('../helpers/liveStore');
const { saveTrades } = require('../helpers/liveStorage');

module.exports = {
    /* POST /api/v1/trading/liveTrades (called by the MT5 EA with the closed trades, no cookie).
       Body : { symbol, trades: [{ ticket, symbol, type, lots, entry_time, entry_price, exit_time, exit_price, profit, swap, commission, exit_reason, comment }] }
       Each trade is saved once (by ticket) in uploads/liveTrades/live_trades.csv. */
    receiveLiveTrades: async (req, res) => {
        try {

            /* Variables. */
            const { symbol, trades } = req.body || {};

            /* Validate the request. */
            if (!Array.isArray(trades)) return res.status(400).json({ status: 400, message: 'trades array is required' });

            const saved = await saveTrades(symbol, trades);

            /* Tell the open pages that a trade was closed (they reload the trades, the widget shows a message). */
            if (saved.length) live.broadcastEvent('trades', { count: saved.length, last: saved[saved.length - 1] });

            return res.status(200).json({ status: 200, received: trades.length, saved: saved.length });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in saving the live trades : ${error}` }) };
    }
};
