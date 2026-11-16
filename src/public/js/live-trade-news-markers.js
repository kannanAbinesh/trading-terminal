/* Live Trade page : news events drawn on the chart as small circles (like TradingView).

   - Only US news is drawn (the currencies of config.js newsCurrencies). One circle at the time of each news event, just above the time scale. The circle shows the country flag,
     its ring is red / orange / blue-grey for high / medium / low importance (grey for bank holidays).
   - Events that are too close to each other are joined into one circle with a number.
   - Click a circle to open the news card : event name, country, importance, actual / forecast / previous
     and the time the bot stops trading (only for the currencies in config.js newsCurrencies, USD). Click anywhere else (or press Esc) to close it.

   Data : GET weeklyNEWS (the weekly files MT5 sends), GET newsStatus (minutes before / after the news).
   Needs live-trade.js to run first (it creates window.LiveChart). */
(function () {

    /* Variables. */
    const WEEKLY_NEWS_URL = "/api/v1/trading/weeklyNEWS";
    const NEWS_STATUS_URL = "/api/v1/trading/newsStatus";
    const COUNTRIES_URL = "/public/data/countriesDetails.json";
    const REFRESH_NEWS_MS = 5 * 60 * 1000;
    const JOIN_DISTANCE_PX = 20;               /* Circles closer than this are joined. */
    const DEFAULT_MINUTES = 15;
    const DEFAULT_STOP_CURRENCIES = ["USD"];

    const CURRENCY_TO_COUNTRY_CODE = {
        USD: "us", EUR: "eu", GBP: "gb", JPY: "jp", AUD: "au", CAD: "ca", CHF: "ch", NZD: "nz",
        CNY: "cn", INR: "in", SEK: "se", NOK: "no", DKK: "dk", PLN: "pl", TRY: "tr", ZAR: "za",
        MXN: "mx", BRL: "br", KRW: "kr", SGD: "sg", HKD: "hk", RUB: "ru"
    };
    const IMPORTANCE_ORDER = { none: 0, low: 1, medium: 2, high: 3 };
    const IMPORTANCE_COLORS = { none: "#cbd5e1", low: "#64748b", medium: "#f59e0b", high: "#e5383b" };

    const chart = window.LiveChart.chart;
    const timeZoneShift = window.LiveChart.timeZoneShift;
    const layer = document.getElementById("newsLayer");

    const flagByCode = new Map();
    const flagByName = new Map();
    let newsEvents = [];                       /* Every loaded event, oldest first. */
    let minutesBefore = DEFAULT_MINUTES;
    let minutesAfter = DEFAULT_MINUTES;
    let stopCurrencies = DEFAULT_STOP_CURRENCIES;   /* Only the news of these currencies stops the bot. */
    let openGroupKey = null;                   /* The circle whose card is open. */
    let drawIsScheduled = false;

    /* ---------- Small helpers ---------- */

    function escapeHtml(value) {
        const htmlEscapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) { return htmlEscapes[character]; });
    };

    function flagOf(newsEvent) {
        const entry = flagByCode.get(CURRENCY_TO_COUNTRY_CODE[newsEvent.currency]) || flagByName.get(String(newsEvent.country || "").toLowerCase());
        return entry ? entry.flag : "";
    };

    function importanceOf(newsEvent) {
        return IMPORTANCE_ORDER[newsEvent.importance] === undefined ? "none" : newsEvent.importance;
    };

    function formatClock(seconds) {
        return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    };

    function formatDay(seconds) {
        const date = new Date(seconds * 1000);
        return date.getDate() + " " + date.toLocaleDateString("en-GB", { month: "short" }) + " '" + String(date.getFullYear()).slice(2);
    };

    function formatNumber(value) {
        return value === null || value === undefined ? "—" : String(value);
    };

    /* The Monday (local time, YYYY-MM-DD) of the week that holds this date. The weekly files are named by it. */
    function mondayKey(date) {
        const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        return monday.toLocaleDateString("en-CA");
    };

    /* ---------- Where a time is on the chart ---------- */

    /* The place of a time in "candle numbers" (a fraction between two candles for a time inside a candle).
       Times after the last candle continue with the same candle length, so upcoming news is drawn too. */
    function toLogicalIndex(utcSeconds) {
        const candles = window.LiveChart.getChartData();
        if (candles.length === 0) return null;

        const time = utcSeconds + timeZoneShift;
        const lastIndex = candles.length - 1;
        const candleLength = candles.length > 1 ? candles[lastIndex].time - candles[lastIndex - 1].time : 900;

        if (time >= candles[lastIndex].time) return lastIndex + (time - candles[lastIndex].time) / candleLength;
        if (time < candles[0].time) return null;

        /* Binary search : the last candle that opened at or before this time. */
        let low = 0;
        let high = lastIndex;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (candles[middle].time <= time) low = middle; else high = middle - 1;
        };
        const nextTime = candles[low + 1].time;
        return low + Math.min((time - candles[low].time) / (nextTime - candles[low].time), 0.999);
    };

    /* ---------- Circles ---------- */

    /* Events with their x position, joined when they are close. Returns [{ key, x, events, importance }]. */
    function buildGroups() {
        const timeScale = chart.timeScale();
        const visibleWidth = timeScale.width();
        const placed = [];

        newsEvents.forEach(function (newsEvent) {
            const index = toLogicalIndex(Number(newsEvent.time));
            if (index === null) return;

            const x = timeScale.logicalToCoordinate(index);
            if (x === null || x < 0 || x > visibleWidth) return;
            placed.push({ x: x, event: newsEvent });
        });
        placed.sort(function (first, second) { return first.x - second.x; });

        const groups = [];
        placed.forEach(function (item) {
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && item.x - lastGroup.lastX < JOIN_DISTANCE_PX) {
                lastGroup.events.push(item.event);
                lastGroup.lastX = item.x;
                return;
            };
            groups.push({ x: item.x, lastX: item.x, events: [item.event] });
        });

        groups.forEach(function (group) {
            group.x = (group.x + group.lastX) / 2;
            group.events.sort(function (first, second) { return IMPORTANCE_ORDER[importanceOf(second)] - IMPORTANCE_ORDER[importanceOf(first)] || Number(first.time) - Number(second.time); });   /* Most important first. */
            group.importance = group.events.reduce(function (best, newsEvent) {
                return IMPORTANCE_ORDER[importanceOf(newsEvent)] > IMPORTANCE_ORDER[best] ? importanceOf(newsEvent) : best;
            }, "none");
            group.key = group.events.map(function (newsEvent) { return newsEvent.id || newsEvent.time + newsEvent.event; }).join("|");
        });
        return groups;
    };

    /* The most important event of the group shows its flag on the circle. */
    function leadEventOf(group) {
        return group.events.reduce(function (best, newsEvent) {
            return IMPORTANCE_ORDER[importanceOf(newsEvent)] > IMPORTANCE_ORDER[importanceOf(best)] ? newsEvent : best;
        }, group.events[0]);
    };

    function drawCircles() {
        drawIsScheduled = false;
        const groups = buildGroups();
        let html = "";

        groups.forEach(function (group) {
            const lead = leadEventOf(group);
            const flagUrl = flagOf(lead);
            const isOpen = group.key === openGroupKey;

            html += '<button type="button" class="live-trade-news-circle' + (isOpen ? " live-trade-news-circle-open" : "") + '"' +
                ' style="left:' + group.x.toFixed(1) + 'px;border-color:' + IMPORTANCE_COLORS[group.importance] + '"' +
                ' data-key="' + escapeHtml(group.key) + '" title="' + escapeHtml(lead.event) + '">' +
                (flagUrl ? '<img src="' + escapeHtml(flagUrl) + '" alt="" onerror="this.style.display=\'none\'">' : "<i>!</i>") +
                (group.events.length > 1 ? '<b class="live-trade-news-count">' + group.events.length + "</b>" : "") +
                "</button>";
        });

        layer.querySelectorAll(".live-trade-news-circle").forEach(function (circle) { circle.remove(); });
        layer.insertAdjacentHTML("beforeend", html);
        layer.currentGroups = groups;

        /* The open card follows its circle (or closes when the circle has left the chart). */
        if (openGroupKey) {
            const openGroup = groups.find(function (group) { return group.key === openGroupKey; });
            if (openGroup) placeCard(openGroup); else closeCard();
        };
    };

    /* Redraw once per screen refresh, however many chart events come. */
    function scheduleDraw() {
        if (drawIsScheduled) return;
        drawIsScheduled = true;
        requestAnimationFrame(drawCircles);
    };

    /* ---------- Card ---------- */

    function importanceBars(importance) {
        const filled = IMPORTANCE_ORDER[importance];
        let bars = "";
        for (let number = 1; number <= 3; number++) {
            bars += '<span class="live-trade-news-bar' + (number <= filled ? " live-trade-news-bar-on" : "") + '" style="' + (number <= filled ? "background:" + IMPORTANCE_COLORS[importance] : "") + '"></span>';
        }
        return '<span class="live-trade-news-bars" title="' + importance + ' importance">' + bars + "</span>";
    };

    function cardHtml(group) {
        let html = '<div class="live-trade-news-card-title">Economic events</div>';

        group.events.forEach(function (newsEvent) {
            const importance = importanceOf(newsEvent);
            const flagUrl = flagOf(newsEvent);
            const stopsFrom = Number(newsEvent.time) - minutesBefore * 60;
            const stopsUntil = Number(newsEvent.time) + minutesAfter * 60;
            const stopsTheBot = importance !== "none" && stopCurrencies.indexOf(newsEvent.currency) !== -1;

            html += '<div class="live-trade-news-item">' +
                '<div class="live-trade-news-item-head">' +
                '<span>' + formatDay(Number(newsEvent.time)) + ' &middot; ' + formatClock(Number(newsEvent.time)) + "</span>" +
                importanceBars(importance) +
                "</div>" +
                '<div class="live-trade-news-item-name">' +
                (flagUrl ? '<img src="' + escapeHtml(flagUrl) + '" alt="" onerror="this.style.display=\'none\'">' : "") +
                "<b>" + escapeHtml(newsEvent.event) + "</b></div>" +
                '<div class="live-trade-news-item-country">' + escapeHtml(newsEvent.country || "") + " &middot; " + escapeHtml(newsEvent.currency || "") +
                " &middot; <span style=\"color:" + IMPORTANCE_COLORS[importance] + '">' + (importance === "none" ? "Holiday" : importance.charAt(0).toUpperCase() + importance.slice(1) + " impact") + "</span></div>" +
                '<div class="live-trade-news-numbers">' +
                "<div><span>Actual</span><b>" + escapeHtml(formatNumber(newsEvent.actual)) + "</b></div>" +
                "<div><span>Forecast</span><b>" + escapeHtml(formatNumber(newsEvent.forecast)) + "</b></div>" +
                "<div><span>Previous</span><b>" + escapeHtml(formatNumber(newsEvent.previous)) + "</b></div>" +
                "</div>" +
                (stopsTheBot ? '<div class="live-trade-news-stop">Bot stops trading ' + formatClock(stopsFrom) + " - " + formatClock(stopsUntil) + "</div>" : "") +
                "</div>";
        });
        return html;
    };

    function placeCard(group) {
        const card = document.getElementById("newsCard");
        const line = document.getElementById("newsLine");
        const layerWidth = layer.clientWidth;

        card.hidden = false;
        card.style.borderLeftColor = IMPORTANCE_COLORS[group.importance];
        card.style.left = Math.max(8, Math.min(group.x - 40, layerWidth - card.offsetWidth - 70)) + "px";

        line.hidden = false;
        line.style.left = group.x + "px";
    };

    function openCard(group) {
        openGroupKey = group.key;
        document.getElementById("newsCard").innerHTML = cardHtml(group);
        placeCard(group);
        drawCircles();
    };

    function closeCard() {
        openGroupKey = null;
        document.getElementById("newsCard").hidden = true;
        document.getElementById("newsLine").hidden = true;
        layer.querySelectorAll(".live-trade-news-circle-open").forEach(function (circle) { circle.classList.remove("live-trade-news-circle-open"); });
    };

    /* ---------- Events from the page ---------- */

    layer.addEventListener("click", function (event) {
        const circle = event.target.closest(".live-trade-news-circle");
        if (!circle) return;

        event.stopPropagation();
        const group = (layer.currentGroups || []).find(function (item) { return item.key === circle.dataset.key; });
        if (!group) return;
        if (group.key === openGroupKey) closeCard(); else openCard(group);
    });

    document.addEventListener("click", function (event) {
        if (!event.target.closest("#newsCard") && !event.target.closest(".live-trade-news-circle")) closeCard();
    });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeCard(); });

    /* The circles follow the candles when the chart moves, zooms, is resized or gets new candles. */
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleDraw);
    chart.timeScale().subscribeSizeChange(scheduleDraw);
    window.addEventListener("resize", scheduleDraw);
    setInterval(scheduleDraw, 5000);

    /* ---------- Loading ---------- */

    async function loadFlags() {
        const answer = await window.apiFetch(COUNTRIES_URL, { quiet: true });
        if (!answer.ok) return;

        (answer.data || []).forEach(function (country) {
            flagByCode.set(String(country.code).toLowerCase(), country);
            flagByName.set(String(country.country).toLowerCase(), country);
        });
    };

    async function loadNewsMinutes() {
        const answer = await window.apiFetch(NEWS_STATUS_URL, { quiet: true });
        if (!answer.ok) return;

        minutesBefore = answer.data.minutesBefore || DEFAULT_MINUTES;
        minutesAfter = answer.data.minutesAfter || DEFAULT_MINUTES;
        stopCurrencies = answer.data.currencies || DEFAULT_STOP_CURRENCIES;
    };

    /* The last, this and the next week, so the chart is covered whatever the candle length is. */
    async function loadNews() {
        const today = new Date();
        const weekKeys = [-7, 0, 7].map(function (offsetDays) {
            return mondayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays));
        });

        const answer = await window.apiFetch(WEEKLY_NEWS_URL + "?weeks=" + weekKeys.join(","), { quiet: true });
        if (!answer.ok) return;

        const events = [];
        weekKeys.forEach(function (key) { (answer.data.weeks[key] || []).forEach(function (newsEvent) { events.push(newsEvent); }); });
        events.sort(function (first, second) { return Number(first.time) - Number(second.time); });

        /* Only the US news (config.js newsCurrencies) is drawn : it is the news that moves gold. */
        newsEvents = events.filter(function (newsEvent) { return stopCurrencies.indexOf(newsEvent.currency) !== -1; });
        scheduleDraw();
    };

    async function start() {
        await Promise.all([loadFlags(), loadNewsMinutes()]);
        await loadNews();
        setInterval(loadNews, REFRESH_NEWS_MS);
    };

    start();
})();