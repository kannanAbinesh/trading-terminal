/* Plugins. */
const express = require('express');

/* Controllers. */
const { login, logout } = require('../controllers/login');
const { getLoginPage, getWrapper, getPage } = require('../controllers/getPage');

const pageRoutes = express.Router();

pageRoutes.get('/login', getLoginPage);
pageRoutes.post('/login', login);
pageRoutes.get('/logout', logout);
pageRoutes.get('/', getWrapper);
pageRoutes.get('/pages/:name', getPage);

module.exports = pageRoutes;
