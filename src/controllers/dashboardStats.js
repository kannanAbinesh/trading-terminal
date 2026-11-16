/* Helpers. */
const live = require('../helpers/liveStore');
const { readTrades, loadAccount, buildStats } = require('../helpers/liveStorage');

module.exports = {
    /* GET /api/v1/trading/dashboardStats : account balance (from MT5), trade totals and the equity curve. */
    dashboardStats: async (req, res) => {
        try {

            const account = live.getAccount() || await loadAccount();
            const store = live.getActiveStore();
            const stats = buildStats(await readTrades(), account);

            return res.status(200).json({
                status: 200,
                account,
                connected: Boolean(store && Date.now() - store.updated_at < 15000),   /* MT5 sent something in the last 15 seconds. */
                position: store ? store.position : { type: 'NONE' },
                ...stats
            });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the dashboard : ${error.message}` }) };
    }
};
