/* Plugins. */
const path = require('path');

/* Helpers. */
const { PAGES } = require('../helpers/paths');

const PAGE_NAMES = ['dashboard', 'live-trade', 'live-trade-history', 'strategy-values', 'back-testing', 'news'];

const sendHtml = (res, fileName) => res.sendFile(path.join(PAGES, fileName), (error) => {
    if (error && !res.headersSent) res.status(404).json({ status: 404, message: 'Page not found.' });
});

module.exports = {
    /* GET /login */
    getLoginPage: (req, res) => sendHtml(res, 'login.html'),

    /* GET / : the frame (side menu + top bar) that shows the pages. */
    getWrapper: (req, res) => sendHtml(res, 'wrapper.html'),

    /* GET /pages/:name */
    getPage: (req, res) => {
        const isKnownPage = PAGE_NAMES.includes(req.params.name);
        return sendHtml(res, isKnownPage ? `${req.params.name}.html` : 'page-not-found.html');
    }
};
