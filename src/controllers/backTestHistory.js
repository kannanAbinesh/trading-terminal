/* Helpers. */
const { listRuns } = require('../helpers/backTestRuns');

module.exports = {
    /* GET /api/v1/trading/backTestHistory : every saved back test (summary only), newest first. */
    backTestHistory: async (req, res) => {
        try {

            return res.status(200).json({ status: 200, runs: await listRuns() });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the back test history : ${error.message}` }) };
    }
};
