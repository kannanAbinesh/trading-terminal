/* Live Trade page, part 2 : the indicator lines of the Trade Panel.

   INDICATORS
     The popup turns the SuperTrend and HalfTrend lines on or off and lets the user type their values.
     An empty field uses the saved Strategy Value (the value live trading uses).
     The lines are calculated by the server from the live candles (GET liveIndicators) and refreshed every few seconds.
     What was typed is remembered in this browser.

   Needs live-trade.js to run first (it creates window.LiveChart). */
(function () {

    /* Variables. */
    const INDICATORS_URL = "/api/v1/trading/liveIndicators";
    const STRATEGY_VALUES_URL = "/api/v1/trading/strategyValues";
    const REFRESH_INDICATORS_MS = 4000;
    const SAVED_SETTINGS_KEY = "liveTradeIndicators";

    const lines = IndicatorLines.create(window.LiveChart.chart);
    const timeZoneShift = window.LiveChart.timeZoneShift;

    const button = document.getElementById("indicatorsButton");
    const popup = document.getElementById("indicatorsPopup");
    const statusText = document.getElementById("indicatorsStatus");

    /* Every popup field by name : the check boxes and the value inputs. */
    const fields = {
        superTrendEnabled: document.getElementById("superTrendEnabled"),
        superTrendPeriod: document.getElementById("superTrendPeriod"),
        superTrendMultiplier: document.getElementById("superTrendMultiplier"),
        halfTrendEnabled: document.getElementById("halfTrendEnabled"),
        halfTrendAmplitude: document.getElementById("halfTrendAmplitude")
    };
    const valueFieldNames = ["superTrendPeriod", "superTrendMultiplier", "halfTrendAmplitude"];

    let refreshTimer = null;

    /* ---------- Remembered settings (this browser only) ---------- */

    function saveSettings() {
        const settings = {};
        Object.keys(fields).forEach(function (name) {
            settings[name] = fields[name].type === "checkbox" ? fields[name].checked : fields[name].value;
        });
        try { localStorage.setItem(SAVED_SETTINGS_KEY, JSON.stringify(settings)); } catch (error) { };
    };

    function loadSettings() {
        let settings = {};
        try { settings = JSON.parse(localStorage.getItem(SAVED_SETTINGS_KEY)) || {}; } catch (error) { };

        Object.keys(fields).forEach(function (name) {
            if (settings[name] === undefined) return;
            if (fields[name].type === "checkbox") fields[name].checked = Boolean(settings[name]);
            else fields[name].value = settings[name];
        });
    };

    /* ---------- Saved Strategy Values : shown as grey placeholders ---------- */

    async function showStrategyValuesAsPlaceholders() {
        const answer = await window.apiFetch(STRATEGY_VALUES_URL, { quiet: true });
        if (!answer.ok) return;

        const values = answer.data.values;
        fields.superTrendPeriod.placeholder = values.superTrend.period;
        fields.superTrendMultiplier.placeholder = values.superTrend.multiplier;
        fields.halfTrendAmplitude.placeholder = values.halfTrend.amplitude;
    };

    /* ---------- Lines ---------- */

    /* The address of liveIndicators with the typed values (an empty field is not sent, so the server uses the Strategy Value). */
    function buildIndicatorsUrl() {
        const query = new URLSearchParams();
        valueFieldNames.forEach(function (name) {
            if (fields[name].value.trim() !== "") query.set(name, fields[name].value.trim());
        });
        return INDICATORS_URL + "?" + query.toString();
    };

    function anyIndicatorIsEnabled() {
        return fields.superTrendEnabled.checked || fields.halfTrendEnabled.checked;
    };

    /* Gets the lines from the server and draws them. Returns an error text, or "" when everything is fine. */
    async function refreshLines() {
        if (!anyIndicatorIsEnabled()) return "";

        let answer;
        try {
            const response = await fetch(buildIndicatorsUrl());
            answer = await response.json();
            if (!response.ok) return answer.message || "The lines could not be calculated.";
        } catch (error) { return "Could not reach the server."; }

        if (answer.waiting) return "";   /* No candles from MT5 yet. */

        lines.setData({ superTrend: answer.superTrend, halfTrend: answer.halfTrend }, timeZoneShift);
        return "";
    };

    function showEnabledLines() {
        lines.setVisible("superTrend", fields.superTrendEnabled.checked);
        lines.setVisible("halfTrend", fields.halfTrendEnabled.checked);
    };

    /* The lines follow the live candles, so they are refreshed while at least one is enabled. */
    function restartRefreshing() {
        clearInterval(refreshTimer);
        refreshTimer = null;
        if (anyIndicatorIsEnabled()) refreshTimer = setInterval(refreshLines, REFRESH_INDICATORS_MS);
    };

    async function applySettings() {
        statusText.textContent = "";
        statusText.className = "live-trade-popup-status";

        const errorText = await refreshLines();
        if (errorText) {
            statusText.textContent = errorText;
            statusText.classList.add("live-trade-popup-status-error");
            return;
        };

        showEnabledLines();
        saveSettings();
        restartRefreshing();
        if (anyIndicatorIsEnabled()) {
            statusText.textContent = "Lines updated.";
        };
    };

    function resetToStrategyValues() {
        valueFieldNames.forEach(function (name) { fields[name].value = ""; });
        applySettings();
    };

    /* ---------- Popup ---------- */

    function togglePopup(show) {
        popup.hidden = !show;
        button.classList.toggle("live-trade-indicators-button-open", show);
        if (show) showStrategyValuesAsPlaceholders();
    };

    button.addEventListener("click", function () { togglePopup(popup.hidden); });
    document.getElementById("indicatorsClose").addEventListener("click", function () { togglePopup(false); });
    document.getElementById("indicatorsApply").addEventListener("click", applySettings);
    document.getElementById("indicatorsReset").addEventListener("click", resetToStrategyValues);

    /* A check box takes effect at once. */
    fields.superTrendEnabled.addEventListener("change", applySettings);
    fields.halfTrendEnabled.addEventListener("change", applySettings);

    /* ---------- Start ---------- */

    loadSettings();
    showEnabledLines();
    refreshLines().then(restartRefreshing);

})();