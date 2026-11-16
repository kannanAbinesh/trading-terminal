/* Live Trade History : every closed trade saved from MT5 (start, end, price, P&L), with a filter popup and pages.

   Data : GET /api/v1/trading/liveTradeHistory. The table reloads by itself when a trade closes.
   Filters : the filter button opens a popup (same as the News page). Apply / Clear close it again. */
(function () {

    /* Variable declarations. */
    const HISTORY_URL = "/api/v1/trading/liveTradeHistory";
    const stream_URL = "/api/v1/trading/liveStream";
    const PAGE_SIZE = 15;
    const SECONDS_IN_A_DAY = 86400;

    const filterWrap = document.getElementById("histFilterWrap");
    const filterButton = document.getElementById("histFilterBtn");
    const filterBadge = document.getElementById("histFilterBadge");

    const filterInputs = {
        from: document.getElementById("fFrom"),
        to: document.getElementById("fTo"),
        type: document.getElementById("fType"),
        result: document.getElementById("fResult")
    };

    const tableBody = document.getElementById("histBody");
    const emptyMessage = document.getElementById("histEmpty");
    const previousButton = document.getElementById("pPrev");
    const nextButton = document.getElementById("pNext");

    let allTrades = [];        /* Every trade, newest first. */
    let shownTrades = [];      /* The trades left after the filters. */
    let currentPage = 1;

    /* ---------- Small helpers ---------- */

    function padTwo(number) {
        return String(number).padStart(2, "0");
    };

    /* Times are saved in UTC and shown in the local time of the browser. */
    function formatTime(seconds) {
        const date = new Date(seconds * 1000);
        const day = date.getFullYear() + "-" + padTwo(date.getMonth() + 1) + "-" + padTwo(date.getDate());
        const time = padTwo(date.getHours()) + ":" + padTwo(date.getMinutes()) + ":" + padTwo(date.getSeconds());
        return day + " " + time;
    };

    function formatDuration(seconds) {
        if (seconds < 60) return seconds + "s";

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + "m " + (seconds % 60) + "s";

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + "h " + (minutes % 60) + "m";

        return Math.floor(hours / 24) + "d " + (hours % 24) + "h";
    };

    /* "2026-11-10" -> seconds at the start of that day (local time). */
    function startOfDay(dateText) {
        return dateText ? new Date(dateText + "T00:00:00").getTime() / 1000 : null;
    };

    /* Trade values come from MT5, so they are escaped before they go into the table. */
    function escapeHtml(text) {
        const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
        return String(text).replace(/[&<>"]/g, function (character) { return replacements[character]; });
    };

    /* ---------- Loading ---------- */

    async function loadTrades(quiet) {
        const result = await window.apiFetch(HISTORY_URL, { quiet: quiet });
        if (!result.ok) return;

        allTrades = (result.data.trades || []).slice();
        allTrades.sort(function (first, second) { return second.exit_time - first.exit_time; });
        applyFilters(false);
    };

    /* ---------- Filters ---------- */

    function tradePassesFilters(trade, fromSeconds, toSeconds) {
        if (fromSeconds !== null && trade.entry_time < fromSeconds) return false;
        if (toSeconds !== null && trade.entry_time >= toSeconds) return false;
        if (filterInputs.type.value && trade.type !== filterInputs.type.value) return false;
        if (filterInputs.result.value === "PROFIT" && !(trade.pnl >= 0)) return false;
        if (filterInputs.result.value === "LOSS" && !(trade.pnl < 0)) return false;
        return true;
    };

    function anyFilterIsOn() {
        return Boolean(filterInputs.from.value || filterInputs.to.value || filterInputs.type.value || filterInputs.result.value);
    };

    function applyFilters(goToFirstPage) {
        const fromSeconds = startOfDay(filterInputs.from.value);
        const toSeconds = filterInputs.to.value ? startOfDay(filterInputs.to.value) + SECONDS_IN_A_DAY : null;

        shownTrades = allTrades.filter(function (trade) { return tradePassesFilters(trade, fromSeconds, toSeconds); });
        if (goToFirstPage !== false) currentPage = 1;

        filterBadge.style.display = anyFilterIsOn() ? "block" : "none";
        draw();
    };

    /* ---------- Drawing ---------- */

    function drawSummary() {
        const profitTrades = shownTrades.filter(function (trade) { return trade.pnl >= 0; }).length;
        const lossTrades = shownTrades.length - profitTrades;

        let netProfit = shownTrades.reduce(function (sum, trade) { return sum + trade.pnl; }, 0);
        netProfit = Math.round(netProfit * 100) / 100 || 0;

        document.getElementById("sumTotal").textContent = shownTrades.length;
        document.getElementById("sumRate").textContent = shownTrades.length ? (profitTrades / shownTrades.length * 100).toFixed(1) + "%" : "0%";
        document.getElementById("sumWL").textContent = profitTrades + " / " + lossTrades;

        const netElement = document.getElementById("sumPnl");
        netElement.textContent = (netProfit >= 0 ? "+" : "") + netProfit.toFixed(2);
        netElement.className = netProfit >= 0 ? "live-trade-history-profit" : "live-trade-history-loss";
    };

    function buildRow(trade, number) {
        const isBuy = trade.type === "BUY";
        const isProfit = trade.pnl >= 0;

        const trendClass = isBuy ? "live-trade-history-trend-up" : "live-trade-history-trend-down";
        const trendText = isBuy ? "&#9650; Uptrend" : "&#9660; Downtrend";
        const typeClass = isBuy ? "live-trade-history-badge-buy" : "live-trade-history-badge-sell";
        const pnlClass = isProfit ? "live-trade-history-profit" : "live-trade-history-loss";
        const resultClass = isProfit ? "live-trade-history-badge-profit" : "live-trade-history-badge-loss";
        const duration = formatDuration(Math.max(0, trade.exit_time - trade.entry_time));

        return "<tr>" +
            "<td>" + number + "</td>" +
            "<td>" + escapeHtml(trade.ticket) + "</td>" +
            '<td class="' + trendClass + '">' + trendText + "</td>" +
            '<td><span class="live-trade-history-badge ' + typeClass + '">' + escapeHtml(trade.type) + "</span></td>" +
            '<td class="live-trade-history-num">' + trade.lots.toFixed(2) + "</td>" +
            "<td>" + formatTime(trade.entry_time) + "</td>" +
            '<td class="live-trade-history-num">' + trade.entry_price.toFixed(2) + "</td>" +
            "<td>" + formatTime(trade.exit_time) + "</td>" +
            '<td class="live-trade-history-num">' + trade.exit_price.toFixed(2) + "</td>" +
            "<td>" + duration + "</td>" +
            "<td>" + escapeHtml(trade.exit_reason || "-") + "</td>" +
            '<td class="live-trade-history-num ' + pnlClass + '">' + (isProfit ? "+" : "") + trade.pnl.toFixed(2) + "</td>" +
            '<td><span class="live-trade-history-badge ' + resultClass + '">' + (isProfit ? "Profit" : "Loss") + "</span></td>" +
            "</tr>";
    };

    function draw() {
        drawSummary();

        const totalPages = Math.max(1, Math.ceil(shownTrades.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;

        const firstIndex = (currentPage - 1) * PAGE_SIZE;
        const tradesOfThisPage = shownTrades.slice(firstIndex, firstIndex + PAGE_SIZE);

        tableBody.innerHTML = tradesOfThisPage.map(function (trade, position) {
            return buildRow(trade, firstIndex + position + 1);
        }).join("");

        emptyMessage.style.display = shownTrades.length ? "none" : "block";
        document.getElementById("histCount").textContent = shownTrades.length + " of " + allTrades.length + " trades";
        document.getElementById("pageInfo").textContent = "Page " + currentPage + " of " + totalPages;
        previousButton.disabled = currentPage <= 1;
        nextButton.disabled = currentPage >= totalPages;
    };

    /* ---------- Filter popup (open, close, apply, clear) ---------- */

    function openFilter() {
        filterWrap.classList.add("live-trade-history-open");
        filterButton.setAttribute("aria-expanded", "true");
    };

    function closeFilter() {
        filterWrap.classList.remove("live-trade-history-open");
        filterButton.setAttribute("aria-expanded", "false");
    };

    filterButton.addEventListener("click", function (event) {
        event.stopPropagation();
        if (filterWrap.classList.contains("live-trade-history-open")) closeFilter(); else openFilter();
    });

    /* Clicking outside the popup, or pressing Esc, closes it. */
    document.addEventListener("click", function (event) {
        if (!filterWrap.contains(event.target)) closeFilter();
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeFilter();
    });

    document.getElementById("fApply").addEventListener("click", function () {
        closeFilter();
        applyFilters(true);
    });

    document.getElementById("fClear").addEventListener("click", function () {
        filterInputs.from.value = "";
        filterInputs.to.value = "";
        filterInputs.type.value = "";
        filterInputs.result.value = "";
        closeFilter();
        applyFilters(true);
    });

    /* ---------- Pages ---------- */

    previousButton.addEventListener("click", function () { currentPage--; draw(); });
    nextButton.addEventListener("click", function () { currentPage++; draw(); });

    /* ---------- Start ---------- */

    /* A trade closed in MT5 : reload the table (the wrapper already shows the "trade closed" message). */
    const stream = new EventSource(stream_URL);
    stream.addEventListener("trades", function () { loadTrades(true); });

    loadTrades(false);
})();
