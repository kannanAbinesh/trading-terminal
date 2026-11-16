# XAUUSD bot : SuperTrend + HalfTrend + ADX

**Trend rule:** SuperTrend and HalfTrend point the same way -> hold a trade in that direction. One of them changes -> close / do not trade.
ADX is the filter: a new trade only opens when ADX >= the minimum (an open trade is never closed by ADX).

**News rule:** from 15 minutes before until 15 minutes after a scheduled news event (the events the EA sends from the MT5 calendar)
nothing is opened and every open trade is closed, profit or loss. If another event starts inside the window, the window continues until 15 minutes after it.
The minutes are set in `config.js`. Bank holidays (importance "none") are ignored.

**One source of strategy values:** `src/public/data/strategyValues.json`, edited in the *Strategy Values* page.
The live signal, the Back Testing form and the Live Trade indicator lines all start from it.

## Run
```
npm install
npm run start-dev        # http://localhost:3000   (start-prod for production)
```
Login users are in `src/data/userDetails.json` (read only by the server). Change `COOKIE_SECRET` in `.env`.

## Folder map
```
server.js                  Express app
config.js, .env            port, environment, cookie secret, news minutes
src/routes/                trading.js (API) and pages.js (login + pages)
src/middleware/            verifyToken.js (login check; lists the paths MT5 may call without login)
src/controllers/           ONE controller per file, named after what it does
src/helpers/               every other piece of server logic (one level, no sub folders)
    superTrend.js halfTrend.js adx.js        the indicators
    strategy.js                              the trading rule (live signal + back test)
    strategyValues.js                        read / check / save the strategy values
    newsBlackout.js                          the news window
    botControl.js                            Trading ON/OFF and Close trade (saved in uploads/botControl.json)
    backTest*.js                             dataset reader, engine, summary, saved runs, form check
    liveStore.js, liveStorage.js             live data in memory / in CSV files
    session.js                               login session (signed cookie)
    csv.js, numberField.js, paths.js         small helpers
src/public/html|style|js   pages. Every CSS class starts with the name of its page (login-, wrapper-, dashboard-, ...)
src/public/data/           strategyValues.json, sideMenu.json, countriesDetails.json
src/data/userDetails.json  users (never sent to the browser)
uploads/                   datasets, backTesting, liveData, liveTrades, weeklyNEWS
docs/                      api-docs.yaml (Swagger, development only) and metaBot.mq5 (the EA, v2.70)
```

## Manual controls (Live Trade page)
* **Close trade** (click twice) : the EA exits the open trade within a few seconds. Trading stays ON, and the same trend is not entered again; the bot waits until SuperTrend and HalfTrend stop agreeing, then trades the next trend.
* **Trading ON / OFF** : while OFF, no new trade is opened. An open trade is not touched (use Close trade for that).

## Charts
* **Live Trade** : the *Indicators* button opens a popup. Tick SuperTrend / HalfTrend and type their values; an empty field uses the saved Strategy Value (shown in grey).
* **Back Testing** : tick SuperTrend / HalfTrend above the trade chart. Older saved runs get their lines calculated when opened.

## MT5
1. MT5: Tools > Options > Expert Advisors > Allow WebRequest, add your server URL (for example `http://192.168.50.136:3000`).
2. Copy `docs/metaBot.mq5` to `MQL5/Experts`, compile, attach to an XAUUSD chart (any timeframe).
3. The EA sends: signal request (every new candle), live candle + position + account (every second),
   closed trades (every `InpTradeSyncSeconds`) and the weekly news. Every `InpControlCheckSeconds` (3) it asks `newsStatus` and `botControl`:
   it closes the open trade when the news window starts or when Close trade is pressed, and opens nothing while Trading is OFF.
   Paths MT5 calls without login: `collectWeeklyNEWS`, `generateSignal`, `newsStatus`, `botControl`, `liveCandles`, `liveTrades` (listed in `src/middleware/verifyToken.js`).

## Data files (all in `uploads/`)
| Folder | Written by | Used by |
|---|---|---|
| `datasets/` | you (copy the CSV price files here) | Back Testing |
| `backTesting/<name>/` | Back Testing page (New back test button) | Back Testing page (saved list) |
| `liveData/candles`, `liveData/ticks` | `liveCandles` | history of the live chart |
| `liveData/account.json` | `liveCandles` | Dashboard after a restart |
| `liveTrades/live_trades.csv` | `liveTrades` | Live Trade History, chart markers, Dashboard |
| `weeklyNEWS/` | `collectWeeklyNEWS` | News page, news rule |
