/* Plugins. */
const express = require('express');

/* Controllers (one per file). */
const { getStrategyValues } = require('../controllers/getStrategyValues');
const { saveStrategyValues } = require('../controllers/saveStrategyValues');
const { newsStatus } = require('../controllers/newsStatus');
const { liveIndicators } = require('../controllers/liveIndicators');
const { me } = require('../controllers/login');
const { collectWeeklyNEWS } = require('../controllers/collectWeeklyNEWS');
const { generateSignal } = require('../controllers/generateSignal');
const { startTrading } = require('../controllers/startTrading');
const { stopTrading } = require('../controllers/stopTrading');
const { requireDeveloper } = require('../middleware/verifyToken');
const { closeTrade } = require('../controllers/closeTrade');
const { getBotControl } = require('../controllers/getBotControl');
const { receiveLiveCandles } = require('../controllers/receiveLiveCandles');
const { receiveLiveTrades } = require('../controllers/receiveLiveTrades');
const { liveStream } = require('../controllers/liveStream');
const { liveTradeHistory } = require('../controllers/liveTradeHistory');
const { dashboardStats } = require('../controllers/dashboardStats');
const { getWeeklyNEWS } = require('../controllers/getWeeklyNEWS');
const { backTestDatasets } = require('../controllers/backTestDatasets');
const { runBackTest } = require('../controllers/runBackTest');
const { backTestHistory } = require('../controllers/backTestHistory');
const { backTestResult } = require('../controllers/backTestResult');

/* Variables. */
const tradingRoutes = express.Router();

/* Called by MT5 (no login cookie : these paths are in the skip list of verifyToken). */
tradingRoutes.post('/collectWeeklyNEWS', collectWeeklyNEWS);
tradingRoutes.post('/generateSignal', generateSignal);
tradingRoutes.get('/newsStatus', newsStatus);
tradingRoutes.post('/liveCandles', receiveLiveCandles);
tradingRoutes.post('/liveTrades', receiveLiveTrades);

/* Called by the browser (login needed). */
tradingRoutes.get('/me', me);
tradingRoutes.get('/strategyValues', getStrategyValues);
tradingRoutes.post('/strategyValues', saveStrategyValues);
tradingRoutes.post('/startTrading', requireDeveloper, startTrading);
tradingRoutes.post('/stopTrading', requireDeveloper, stopTrading);
tradingRoutes.post('/closeTrade', requireDeveloper, closeTrade);
tradingRoutes.get('/botControl', getBotControl);

tradingRoutes.get('/liveStream', liveStream);
tradingRoutes.get('/liveIndicators', liveIndicators);
tradingRoutes.get('/liveTradeHistory', liveTradeHistory);
tradingRoutes.get('/dashboardStats', dashboardStats);
tradingRoutes.get('/weeklyNEWS', getWeeklyNEWS);

tradingRoutes.get('/backTestDatasets', backTestDatasets);
tradingRoutes.post('/runBackTest', runBackTest);
tradingRoutes.get('/backTestHistory', backTestHistory);
tradingRoutes.get('/backTestResult', backTestResult);

module.exports = tradingRoutes;