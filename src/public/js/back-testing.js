/* Back Testing page (one page for everything).

   1. LIST   : every saved back test, with search and pages.
   2. NEW    : the "New back test" button opens a popup with the form. Running it saves the test and opens its result.
   3. RESULT : the "View" button of a row (or a test that was just run) opens the result. "Back to the list" returns.

   Server routes
   - GET  backTestHistory         : the saved back tests (list).
   - GET  backTestResult?name=    : one saved back test (summary, chart data and trades).
   - GET  backTestDatasets        : CSV files that can be used.
   - GET  strategyValues          : the saved strategy values (shown in the form; an empty field uses them).
   - POST runBackTest             : run and save a new back test.

   The result itself (cards, charts, trades) is drawn by back-testing-view.js (BTView). */
(function () {

    /* Variable declarations. */
    const HISTORY_URL = "/api/v1/trading/backTestHistory";
    const RESULT_URL = "/api/v1/trading/backTestResult?name=";
    const DATASETS_URL = "/api/v1/trading/backTestDatasets";
    const RUN_URL = "/api/v1/trading/runBackTest";
    const STRATEGY_VALUES_URL = "/api/v1/trading/strategyValues";
    const PAGE_SIZE = 10;

    const listView = document.getElementById("btListView");
    const resultView = document.getElementById("btResultView");
    const resultBox = document.getElementById("btResult");
    const errorBox = document.getElementById("btError");

    const modal = document.getElementById("btModal");
    const form = document.getElementById("btForm");
    const statusText = document.getElementById("btStatus");
    const runButton = document.getElementById("btRun");

    let savedRuns = [];        /* Every saved back test, newest first. */
    let shownRuns = [];        /* After the search. */
    let currentPage = 1;
    let resultIsMounted = false;
    let datasetsAreLoaded = false;

    /* ---------- Small helpers ---------- */

    function escapeHtml(text) {
        const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
        return String(text).replace(/[&<>"]/g, function (character) { return replacements[character]; });
    };

    function formatMoney(value) {
        return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    function getValue(id) {
        return document.getElementById(id).value;
    };

    /* ---------- Switching between the list and the result ---------- */

    function showList() {
        listView.hidden = false;
        resultView.hidden = true;
        errorBox.hidden = true;
    };

    function showResult(result) {
        listView.hidden = true;
        resultView.hidden = false;
        errorBox.hidden = true;
        resultBox.hidden = false;      /* Visible before the charts are drawn, so they get their size. */

        if (!resultIsMounted) {
            BTView.mount(resultBox);
            resultIsMounted = true;
        };
        BTView.render(result);
        window.scrollTo(0, 0);
    };

    document.getElementById("btBack").addEventListener("click", showList);

    /* ---------- List ---------- */

    async function loadList() {
        const response = await window.apiFetch(HISTORY_URL);
        savedRuns = response.ok ? (response.data.runs || []) : [];
        applySearch(false);
    };

    function applySearch(goToFirstPage) {
        const searchText = document.getElementById("btSearch").value.trim().toLowerCase();

        shownRuns = savedRuns.filter(function (run) {
            const searchableText = (run.name + " " + run.dataset).toLowerCase();
            return !searchText || searchableText.indexOf(searchText) !== -1;
        });

        if (goToFirstPage !== false) currentPage = 1;
        drawList();
    };

    function buildListRow(run, number) {
        const summary = run.summary;
        const config = run.config;
        const profit = summary.netProfit;
        const profitFactor = summary.profitFactor === null ? "n/a" : summary.profitFactor.toFixed(2);

        return "<tr>" +
            "<td>" + number + "</td>" +
            '<td><span class="back-testing-name">' + escapeHtml(run.name) + "</span></td>" +
            "<td>" + escapeHtml(run.dataset) + "</td>" +
            "<td>" + run.from.slice(0, 10) + " to " + run.to.slice(0, 10) +
            '<span class="back-testing-sub">' + run.candleCount.toLocaleString("en-US") + " candles</span></td>" +
            "<td>ST " + (config.superTrend.period || config.superTrend.atrPeriod) + " / " + config.superTrend.multiplier +
            '<span class="back-testing-sub">HT ' + config.halfTrend.amplitude + " &middot; ADX " + config.adx.period + " / " + config.adx.threshold + "</span></td>" +
            '<td class="back-testing-num">' + summary.totalTrades + "</td>" +
            '<td class="back-testing-num">' + summary.winRate.toFixed(1) + "%</td>" +
            '<td class="back-testing-num">' + profitFactor + "</td>" +
            '<td class="back-testing-num">' + formatMoney(summary.maxDrawdown) + "</td>" +
            '<td class="back-testing-num ' + (profit >= 0 ? "back-testing-pos" : "back-testing-neg") + '">' +
            (profit >= 0 ? "+" : "-") + formatMoney(Math.abs(profit)) + "</td>" +
            "<td>" + new Date(run.createdAt).toLocaleString() + "</td>" +
            '<td><button type="button" class="back-testing-view-button" data-folder="' + escapeHtml(run.folder) + '">View</button></td>' +
            "</tr>";
    };

    function drawList() {
        const totalPages = Math.max(1, Math.ceil(shownRuns.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;

        const firstIndex = (currentPage - 1) * PAGE_SIZE;
        const runsOfThisPage = shownRuns.slice(firstIndex, firstIndex + PAGE_SIZE);

        document.getElementById("btListBody").innerHTML = runsOfThisPage.map(function (run, position) {
            return buildListRow(run, firstIndex + position + 1);
        }).join("");

        document.getElementById("btEmpty").hidden = shownRuns.length > 0;
        document.getElementById("btCount").textContent = shownRuns.length + " of " + savedRuns.length + " back tests";
        document.getElementById("btPageInfo").textContent = "Page " + currentPage + " of " + totalPages;
        document.getElementById("btPrev").disabled = currentPage <= 1;
        document.getElementById("btNext").disabled = currentPage >= totalPages;
    };

    async function openSavedRun(folder, button) {
        button.disabled = true;
        button.textContent = "Loading...";

        const response = await window.apiFetch(RESULT_URL + encodeURIComponent(folder));
        if (response.ok) {
            showResult(response.data);
        } else {
            errorBox.hidden = false;
            errorBox.textContent = response.data.message || "Could not open this back test";
        };

        button.disabled = false;
        button.textContent = "View";
    };

    document.getElementById("btListBody").addEventListener("click", function (event) {
        const button = event.target.closest(".back-testing-view-button");
        if (button) openSavedRun(button.dataset.folder, button);
    });
    document.getElementById("btSearch").addEventListener("input", function () { applySearch(true); });
    document.getElementById("btPrev").addEventListener("click", function () { currentPage--; drawList(); });
    document.getElementById("btNext").addEventListener("click", function () { currentPage++; drawList(); });

    /* ---------- New back test : the popup ---------- */

    async function loadDatasets() {
        const select = document.getElementById("fDataset");
        const response = await window.apiFetch(DATASETS_URL);

        if (!response.ok) {
            select.innerHTML = '<option value="">Could not load the datasets</option>';
            return;
        };

        const datasets = response.data.datasets || [];
        if (datasets.length === 0) {
            select.innerHTML = '<option value="">No CSV files found in uploads/datasets</option>';
            return;
        };

        const options = datasets.map(function (dataset) {
            return '<option value="' + escapeHtml(dataset.file) + '">' + escapeHtml(dataset.file) + " (" + dataset.size_mb + " MB)</option>";
        });
        select.innerHTML = '<option value="">Select a dataset</option>' + options.join("");
        datasetsAreLoaded = true;
    };

    /* The saved strategy values are shown in grey inside the empty fields : an empty field uses them. */
    async function showSavedValuesInForm() {
        const response = await window.apiFetch(STRATEGY_VALUES_URL, { quiet: true });
        if (!response.ok) return;

        const values = response.data.values;
        document.getElementById("fStPeriod").placeholder = values.superTrend.period;
        document.getElementById("fStMult").placeholder = values.superTrend.multiplier;
        document.getElementById("fHtAmp").placeholder = values.halfTrend.amplitude;
        document.getElementById("fAdxPeriod").placeholder = values.adx.period;
        document.getElementById("fAdxMin").placeholder = values.adx.threshold;
    };

    function setStatus(text, kind) {
        statusText.textContent = text;
        statusText.className = "back-testing-status" + (kind ? " back-testing-status-" + kind : "");
    };

    function openModal() {
        setStatus("", "");
        modal.hidden = false;
        if (!datasetsAreLoaded) loadDatasets();
        showSavedValuesInForm();
    };

    function closeModal() {
        modal.hidden = true;
    };

    document.getElementById("btNewButton").addEventListener("click", openModal);
    document.getElementById("btCloseButton").addEventListener("click", closeModal);
    document.getElementById("btCancelButton").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !runButton.disabled) closeModal();
    });

    /* Marks the fields that are not valid and shows the browser's message for the first one. */
    function formIsValid() {
        const fields = Array.from(form.querySelectorAll("input, select"));
        fields.forEach(function (field) { field.classList.remove("back-testing-invalid"); });

        const invalidFields = fields.filter(function (field) { return !field.checkValidity(); });
        if (invalidFields.length === 0) return true;

        invalidFields.forEach(function (field) { field.classList.add("back-testing-invalid"); });
        invalidFields[0].reportValidity();
        return false;
    };

    /* What the server needs to run the back test. */
    function readForm() {
        return {
            name: getValue("fName").trim(),
            dataset: getValue("fDataset"),
            from: getValue("fFrom"),
            to: getValue("fTo"),
            superTrend: { period: getValue("fStPeriod"), multiplier: getValue("fStMult") },
            halfTrend: { amplitude: getValue("fHtAmp") },
            adx: { period: getValue("fAdxPeriod"), threshold: getValue("fAdxMin") },
            trade: {
                initialBalance: getValue("fBalance"),
                lots: getValue("fLots"),
                contractSize: getValue("fContract"),
                spread: getValue("fSpread"),
                commission: getValue("fCommission"),
                stopLoss: getValue("fSl"),
                takeProfit: getValue("fTp")
            }
        };
    };

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!formIsValid()) return;

        runButton.disabled = true;
        runButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Running...';
        setStatus("Running the back test, please wait...", "");

        const response = await window.apiFetch(RUN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(readForm())
        });

        runButton.disabled = false;
        runButton.innerHTML = '<i class="fa-solid fa-play"></i>Run back test';

        if (!response.ok) {
            setStatus(response.data.message || "The back test failed", "error");
            return;
        };

        /* Saved : close the popup, show the result and add the test to the list. */
        closeModal();
        showResult(response.data);
        loadList();
    });

    /* ---------- Start ---------- */

    loadList();
})();
