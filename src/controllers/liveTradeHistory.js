/* Helpers. */
const { readTrades } = require('../helpers/liveStorage');

module.exports = {
    liveTradeHistory: async (req, res) => {
        try {

            return res.status(200).json({ status: 200, trades: await readTrades() });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the live trades : ${error.message}` }) };
    }
};
