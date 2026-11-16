/* Floating live trade (bottom right of every page) and the "trade closed" messages.

   How it works
   - It listens to the same live stream as the Live Trade page. MT5 sends the open position with every tick.
   - While a trade is open the card is shown. The x makes it a small round icon, clicking the icon opens the card again.
   - When no trade is open (or MT5 stops sending) both the card and the icon are hidden. */
(function () {

    /* Variable declarations. */
    const stream_URL = "/api/v1/trading/liveStream";
    const STALE_AFTER_MS = 20000;                          /* No message from MT5 for this long : the data is old, hide the trade. */
    const MINIMISED_KEY = "wrapper-trade-minimised";       /* Remembers the small icon while this tab is open. */

    const widget = document.getElementById("wrapper-trade-widget");
    const bubble = document.getElementById("wrapper-trade-bubble");
    const bubbleDot = document.getElementById("wrapper-trade-bubble-dot");

    const fields = {
        side: document.getElementById("wrapper-trade-side"),
        symbol: document.getElementById("wrapper-trade-symbol"),
        pnl: document.getElementById("wrapper-trade-pnl"),
        lots: document.getElementById("wrapper-trade-lots"),
        entry: document.getElementById("wrapper-trade-entry"),
        now: document.getElementById("wrapper-trade-now"),
        since: document.getElementById("wrapper-trade-since")
    };

    /* What the last message from MT5 told us. */
    let symbol = "XAUUSD";
    let digits = 2;
    let bid = null;
    let ask = null;
    let position = null;
    let lastMessageAt = 0;

    /* ---------- Small helpers ---------- */

    /* sessionStorage can be blocked in some browsers, so every access is protected. */
    function isMinimised() {
        try { return sessionStorage.getItem(MINIMISED_KEY) === "yes"; } catch (error) { return false; };
    };

    function setMinimised(value) {
        try { sessionStorage.setItem(MINIMISED_KEY, value ? "yes" : "no"); } catch (error) { };
        draw();
    };

    function formatPrice(value) {
        if (value === null || value === undefined || isNaN(value)) return "-";
        return Number(value).toFixed(digits);
    };

    function hasOpenTrade() {
        const isOpenType = position && (position.type === "BUY" || position.type === "SELL");
        const isFresh = Date.now() - lastMessageAt < STALE_AFTER_MS;
        return Boolean(isOpenType && isFresh);
    };

    /* ---------- Drawing ---------- */

    function draw() {
        /* No open trade : nothing is shown. */
        if (!hasOpenTrade()) {
            widget.hidden = true;
            bubble.hidden = true;
            return;
        };

        const isBuy = position.type === "BUY";
        const profit = Number(position.profit) || 0;
        const minimised = isMinimised();

        /* Small round icon. */
        bubble.hidden = !minimised;
        bubble.className = "wrapper-trade-bubble " + (isBuy ? "wrapper-trade-bubble-buy" : "wrapper-trade-bubble-sell");
        bubbleDot.className = "wrapper-trade-bubble-dot" + (profit < 0 ? " wrapper-trade-bubble-dot-loss" : "");
        bubble.title = position.type + " " + (profit >= 0 ? "+" : "") + profit.toFixed(2) + " - click to open";

        /* Card. */
        widget.hidden = minimised;
        if (minimised) return;

        widget.className = "wrapper-trade-widget " + (isBuy ? "wrapper-trade-widget-buy" : "wrapper-trade-widget-sell");
        fields.side.textContent = position.type;
        fields.symbol.textContent = symbol;
        fields.pnl.textContent = (profit >= 0 ? "+" : "") + profit.toFixed(2);
        fields.pnl.className = "wrapper-trade-widget-pnl " + (profit >= 0 ? "wrapper-trade-widget-profit" : "wrapper-trade-widget-loss");
        fields.lots.textContent = Number(position.lots).toFixed(2);
        fields.entry.textContent = formatPrice(position.open_price);
        fields.now.textContent = formatPrice(isBuy ? bid : ask);     /* A BUY is closed at the bid, a SELL at the ask. */
        fields.since.textContent = "Opened " + new Date(Number(position.open_time) * 1000).toLocaleString();
    };

    /* ---------- Messages from the server ---------- */

    function readLiveMessage(message) {
        if (!message) return;

        symbol = message.symbol || symbol;
        if (Number.isFinite(Number(message.digits))) digits = Number(message.digits);
        if (message.bid !== undefined && message.bid !== null) bid = message.bid;
        if (message.ask !== undefined && message.ask !== null) ask = message.ask;

        position = message.position || null;
        lastMessageAt = Date.now();
        draw();
    };

    /* A trade was closed in MT5 : tell the user (green for a profit, red for a loss). */
    function showClosedTrade(message) {
        const trade = message.last;
        if (!trade) return;

        const pnl = Number(trade.pnl) || 0;
        let text = trade.symbol + " " + trade.type + " closed : " + (pnl >= 0 ? "+" : "") + pnl.toFixed(2);
        if (message.count > 1) text += " (and " + (message.count - 1) + " more)";

        window.Toaster.show(pnl >= 0 ? "success" : "error", text, { title: "Trade closed" });
    };

    /* ---------- Buttons ---------- */

    function openLiveTradePage() {
        if (window.wrapperOpenPage) window.wrapperOpenPage("live-trade");
    };

    const body = document.getElementById("wrapper-trade-body");
    body.addEventListener("click", openLiveTradePage);
    body.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openLiveTradePage();
        };
    });

    document.getElementById("wrapper-trade-minimise").addEventListener("click", function () { setMinimised(true); });
    bubble.addEventListener("click", function () { setMinimised(false); });

    /* ---------- Start ---------- */

    const stream = new EventSource(stream_URL);
    stream.addEventListener("snapshot", function (event) { readLiveMessage(JSON.parse(event.data)); });
    stream.addEventListener("tick", function (event) { readLiveMessage(JSON.parse(event.data)); });
    stream.addEventListener("trades", function (event) { showClosedTrade(JSON.parse(event.data)); });

    setInterval(draw, 2000);   /* Hides the trade when MT5 stops sending. */
})();
