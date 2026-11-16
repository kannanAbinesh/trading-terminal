/* Helpers. */
const { botControl, setTradingEnabled } = require('../helpers/botControl');

module.exports = {
    /* POST /api/v1/trading/startTrading : trading is ON, new trades are allowed again. */
    startTrading: async (req, res) => {
        setTradingEnabled(true);
        return res.status(200).json({ status: 200, message: 'Trading is ON. New trades are allowed.', ...botControl });
    }
};
