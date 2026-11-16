/* The login session : a signed, httpOnly cookie (the browser cannot read it or forge it). */
const fs = require('fs').promises;
const { USER_DETAILS_FILE } = require('./paths');

const SESSION_COOKIE = 'session';
const SESSION_DAYS = 3;

const COOKIE_OPTIONS = {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/'
};

/* The user that matches the email and password, or null. */
const findUser = async (email, password) => {
    const users = JSON.parse(await fs.readFile(USER_DETAILS_FILE, 'utf8'));
    const user = users.find((candidate) => candidate.email === email && candidate.password === password);
    return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
};

/* The logged in user of this request (read from the signed cookie), or null. */
const getSessionUser = (request) => {
    const cookieText = request.signedCookies && request.signedCookies[SESSION_COOKIE];
    if (!cookieText) return null;
    try { return JSON.parse(cookieText); } catch (error) { return null; };
};

const startSession = (response, user) => response.cookie(SESSION_COOKIE, JSON.stringify(user), COOKIE_OPTIONS);
const endSession = (response) => response.clearCookie(SESSION_COOKIE, { path: '/' });

module.exports = { findUser, getSessionUser, startSession, endSession };
