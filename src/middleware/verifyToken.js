/* Helpers. */
const { getSessionUser } = require('../helpers/session');

/* Open to everybody : the login, and the paths MT5 calls (the EA has no login). */
const OPEN_PATHS = [
    '/login',
    '/api/v1/trading/collectWeeklyNEWS',
    '/api/v1/trading/generateSignal',
    '/api/v1/trading/newsStatus',
    '/api/v1/trading/botControl',
    '/api/v1/trading/liveCandles',
    '/api/v1/trading/liveTrades'
];

module.exports = {
    /* For the trade controls (Close trade, Trading ON / OFF) : only the developer login may use them. */
    requireDeveloper: (req, res, next) => {
        if (req.user && req.user.role === 'developer') return next();
        return res.status(403).json({ status: 403, message: 'Only the developer login can use the trade controls.' });
    },

    verifyToken: (req, res, next) => {
        const fullPath = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
        if (OPEN_PATHS.includes(fullPath)) return next();

        const user = getSessionUser(req);
        if (user) { req.user = user; return next(); };

        /* An API call gets a JSON 401 (the page shows it in a toast); a page goes to the login. */
        if (fullPath.startsWith('/api/')) return res.status(401).json({ status: 401, message: 'Please log in again.' });
        return res.redirect('/login');
    }
};