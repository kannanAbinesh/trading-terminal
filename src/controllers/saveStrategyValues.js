/* Helpers. */
const { saveStrategyValues: saveValues } = require('../helpers/strategyValues');

module.exports = {
    /* POST /api/v1/trading/strategyValues : saves the values edited in the Strategy Values page.
       Body : { superTrend: { period, multiplier }, halfTrend: { amplitude }, adx: { period, threshold } } */
    saveStrategyValues: async (req, res) => {
        try {

            const values = await saveValues(req.body);
            return res.status(200).json({ status: 200, message: 'Strategy values saved. The live signal uses them from the next candle.', values });

        } catch (error) { return res.status(400).json({ status: 400, message: error.message }) };
    }
};
