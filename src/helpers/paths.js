/* Plugins. */
const path = require('path');

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const DATA = path.join(__dirname, '..', 'data');
const PUBLIC = path.join(__dirname, '..', 'public');

module.exports = {
    UPLOADS,
    PUBLIC,
    PAGES: path.join(PUBLIC, 'html'),

    /* Settings files (never sent to the browser as plain files). */
    USER_DETAILS_FILE: path.join(DATA, 'userDetails.json'),

    /* Settings the browser can read. */
    STRATEGY_VALUES_FILE: path.join(PUBLIC, 'data', 'strategyValues.json'),

    /* Files in /uploads. */
    DATASETS: path.join(UPLOADS, 'datasets'),
    BACK_TEST_RUNS: path.join(UPLOADS, 'backTesting'),
    LIVE_CANDLES: path.join(UPLOADS, 'liveData', 'candles'),
    LIVE_TICKS: path.join(UPLOADS, 'liveData', 'ticks'),
    LIVE_ACCOUNT_FILE: path.join(UPLOADS, 'liveData', 'account.json'),
    LIVE_TRADES_FILE: path.join(UPLOADS, 'liveTrades', 'live_trades.csv'),
    WEEKLY_NEWS: path.join(UPLOADS, 'weeklyNEWS'),
    BOT_CONTROL_FILE: path.join(UPLOADS, 'botControl.json')
};
