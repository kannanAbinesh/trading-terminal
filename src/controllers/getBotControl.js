/* Helpers. */
const { botControl } = require('../helpers/botControl');

module.exports = {
    /* GET /api/v1/trading/botControl : the manual controls (the EA and the Live Trade page read it). */
    getBotControl: async (req, res) => res.status(200).json({ status: 200, ...botControl })
};
