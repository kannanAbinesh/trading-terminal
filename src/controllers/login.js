/* Helpers. */
const { findUser, startSession, endSession } = require('../helpers/session');

module.exports = {
    /* POST /login { email, password } : checks the user on the server and starts the session. */
    login: async (req, res) => {
        try {

            const { email, password } = req.body || {};
            if (!email || !password) return res.status(400).json({ status: 400, message: 'Please enter your email and password.' });

            const user = await findUser(email, password);
            if (!user) return res.status(400).json({ status: 400, message: 'Please enter valid credentials.' });

            startSession(res, user);
            return res.status(200).json({ status: 200, user });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in login : ${error.message}` }) };
    },

    /* GET /logout : ends the session and opens the login page. */
    logout: async (req, res) => {
        endSession(res);
        return res.redirect('/login');
    },

    /* GET /api/v1/trading/me : the logged in user (shown in the top bar). */
    me: async (req, res) => res.status(200).json({ status: 200, user: req.user })
};
