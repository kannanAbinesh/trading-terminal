/* Helpers. */
const { botControl, setTradingEnabled } = require('../helpers/botControl');

module.exports = {
    /* POST /api/v1/trading/stopTrading : trading is OFF, no NEW trade is opened. An open trade is not touched (use closeTrade for that). */
    stopTrading: async (req, res) => {
        setTradingEnabled(false);
        return res.status(200).json({ status: 200, message: 'Trading is OFF. No new trade will be opened.', ...botControl });
    }
};
