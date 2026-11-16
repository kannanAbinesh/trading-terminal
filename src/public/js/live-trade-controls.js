/* Live Trade page : the two manual controls of the bot, inside the Trade Panel.
   Only the developer login sees them (the server also refuses everybody else).

   CLOSE TRADE     Exits the open trade now (the EA closes it within a few seconds). Trading stays ON.
                   The same trend is not entered again, the bot waits for a new trend.

   TRADING ON/OFF  While OFF no new trade is opened. An open trade is not touched.

   Server routes : GET me, GET botControl, POST closeTrade, POST startTrading, POST stopTrading. */
(function () {

    /* Variables. */
    const ME_URL = "/api/v1/trading/me";
    const BOT_CONTROL_URL = "/api/v1/trading/botControl";
    const CLOSE_TRADE_URL = "/api/v1/trading/closeTrade";
    const START_TRADING_URL = "/api/v1/trading/startTrading";
    const STOP_TRADING_URL = "/api/v1/trading/stopTrading";
    const REFRESH_MS = 5000;

    const controlsBox = document.getElementById("tradeControls");
    const closeButton = document.getElementById("closeTradeButton");
    const switchButton = document.getElementById("tradingSwitchButton");

    let tradingEnabled = true;
    let waitingForNewTrend = false;

    /* ---------- Drawing ---------- */

    function drawSwitch() {
        switchButton.querySelector("span").textContent = tradingEnabled ? "Trading ON" : "Trading OFF";
        switchButton.classList.toggle("live-trade-switch-button-off", !tradingEnabled);
    };

    function drawCloseButton() {
        closeButton.title = waitingForNewTrend
            ? "The last trade was closed by hand. The bot is waiting for a new trend."
            : "Exit the open trade now. Trading stays ON, the bot waits for a new trend.";
    };

    /* ---------- Server ---------- */

    async function refreshState() {
        const answer = await window.apiFetch(BOT_CONTROL_URL, { quiet: true });
        if (!answer.ok) return;

        tradingEnabled = answer.data.tradingEnabled;
        waitingForNewTrend = answer.data.closedDirection !== 0;
        drawSwitch();
        drawCloseButton();
    };

    /* ---------- Buttons ---------- */

    switchButton.addEventListener("click", async function () {
        switchButton.disabled = true;
        const answer = await window.apiFetch(tradingEnabled ? STOP_TRADING_URL : START_TRADING_URL, { method: "POST" });
        switchButton.disabled = false;
        if (answer.ok) refreshState();
    });

    /* One click closes the trade. */
    closeButton.addEventListener("click", async function () {
        closeButton.disabled = true;
        const answer = await window.apiFetch(CLOSE_TRADE_URL, { method: "POST" });
        closeButton.disabled = false;
        if (answer.ok) refreshState();
    });

    /* ---------- Start : show the controls to the developer only ---------- */

    async function start() {
        const me = await window.apiFetch(ME_URL, { quiet: true });
        const isDeveloper = me.ok && me.data.user && me.data.user.role === "developer";
        if (!isDeveloper) return;

        controlsBox.hidden = false;
        refreshState();
        setInterval(refreshState, REFRESH_MS);
    };

    start();
})();