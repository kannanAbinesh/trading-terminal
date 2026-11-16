/* Helpers. */
const { readStrategyValues } = require('../helpers/strategyValues');

module.exports = {
    /* GET /api/v1/trading/strategyValues : the saved SuperTrend, HalfTrend and ADX values. */
    getStrategyValues: async (req, res) => {
        try {

            return res.status(200).json({ status: 200, values: await readStrategyValues() });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the strategy values : ${error.message}` }) };
    }
};
