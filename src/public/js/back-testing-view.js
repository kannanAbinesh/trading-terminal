/* Back test result view : summary numbers, trade chart, ADX chart, equity chart and the trades table.

   Used by the Back Testing page (needs the Lightweight Charts and indicator-lines scripts loaded first).

   BTView.mount(containerElement);    // once : builds the markup inside the container
   BTView.render(result);             // result = { meta, trades, chart } from the API */
(function () {

    /* Variable declarations. */
    const COLOR_UP = "#089981";
    const COLOR_DOWN = "#e5383b";
    const COLOR_WIN = "#16a34a";
    const COLOR_LOSS = "#dc2626";
    const PAGE_SIZE = 15;
    const VISIBLE_CANDLES = 250;     /* Candles shown when a result opens. */
    const MAX_LINES = 200;           /* Newest trades that get a dotted entry -> exit line. */
    const MAX_TEXT_MARKERS = 150;    /* Above this many trades the markers have no text. */

    /* The markup of the result. data-role marks the parts the script needs. */
    const TEMPLATE = `
        <div class="back-testing-run-title" data-role="title"></div>
        <div class="back-testing-note" data-role="note" hidden></div>

        <section class="back-testing-stats" data-role="stats"></section>

        <section class="back-testing-block">
            <div class="back-testing-block-head">
                <h3>Trade chart</h3>
                <div class="back-testing-toggles">
                    <label class="back-testing-toggle">
                        <input type="checkbox" data-role="showSuperTrend">
                        <b class="back-testing-key back-testing-key-supertrend"></b>SuperTrend
                    </label>
                    <label class="back-testing-toggle">
                        <input type="checkbox" data-role="showHalfTrend">
                        <b class="back-testing-key back-testing-key-halftrend"></b>HalfTrend
                    </label>
                    <button type="button" class="back-testing-link" data-role="fit">Show all</button>
                </div>
            </div>
            <div class="back-testing-legend" data-role="legend"></div>
            <div class="back-testing-chart back-testing-chart-main" data-role="chart"></div>
        </section>

        <section class="back-testing-block">
            <div class="back-testing-block-head">
                <h3>ADX</h3>
                <span class="back-testing-hint">
                    <b class="back-testing-key back-testing-key-adx"></b>ADX
                    <b class="back-testing-key back-testing-key-plus"></b>+DI
                    <b class="back-testing-key back-testing-key-minus"></b>-DI
                </span>
            </div>
            <div class="back-testing-chart back-testing-chart-adx" data-role="adx"></div>
        </section>

        <section class="back-testing-block">
            <div class="back-testing-block-head">
                <h3>Equity</h3>
                <span class="back-testing-hint">Balance + open profit / loss</span>
            </div>
            <div class="back-testing-chart back-testing-chart-equity" data-role="equity"></div>
        </section>

        <section class="back-testing-block">
            <div class="back-testing-block-head">
                <h3>Trades</h3>
                <span class="back-testing-hint" data-role="count"></span>
            </div>
            <div class="back-testing-scroll">
                <table class="back-testing-table">
                    <thead>
                        <tr>
                            <th>#</th><th>Trend</th><th>Type</th><th class="back-testing-num">Lots</th>
                            <th>Started (UTC)</th><th class="back-testing-num">Entry price</th>
                            <th>Ended (UTC)</th><th class="back-testing-num">Exit price</th>
                            <th>Duration</th><th>Closed by</th><th class="back-testing-num">P&amp;L</th>
                            <th>Result</th><th class="back-testing-num">Balance</th>
                        </tr>
                    </thead>
                    <tbody data-role="tbody"></tbody>
                </table>
                <div class="back-testing-empty" data-role="empty" hidden>No trades were taken with these values.</div>
            </div>
            <div class="back-testing-pager">
                <span data-role="pageInfo"></span>
                <button type="button" data-role="prev">Previous</button>
                <button type="button" data-role="next">Next</button>
            </div>
        </section>`;

    const ROLE_NAMES = ["title", "note", "stats", "fit", "showSuperTrend", "showHalfTrend", "legend", "chart", "adx", "equity", "count", "tbody", "empty", "pageInfo", "prev", "next"];

    let elements = null;     /* The parts of the mounted markup. */
    let charts = null;       /* The charts and their series (created on the first render, when the container is visible). */

    const state = {
        trades: [],
        page: 1,
        indexByTime: new Map()    /* candle time -> position of the candle, used to jump to a trade. */
    };

    /* ---------- Small helpers ---------- */

    function escapeHtml(text) {
        const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
        return String(text).replace(/[&<>"]/g, function (character) { return replacements[character]; });
    };

    function formatMoney(value) {
        return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    function formatSigned(value) {
        return (value >= 0 ? "+" : "-") + formatMoney(Math.abs(value));
    };

    function formatTime(seconds) {
        return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
    };

    function formatDuration(seconds) {
        if (seconds < 60) return seconds + "s";

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + "m";

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + "h " + (minutes % 60) + "m";

        return Math.floor(hours / 24) + "d " + (hours % 24) + "h";
    };

    function findPart(name) {
        return elements.root.querySelector('[data-role="' + name + '"]');
    };

    /* ---------- Charts ---------- */

    function createOneChart(container) {
        return LightweightCharts.createChart(container, {
            autoSize: true,
            layout: {
                background: {
                    type: "solid",
                    color: "#ffffff"
                },
                textColor: "#4b5b5c",
                fontFamily: "Lexend, Segoe UI, sans-serif"
            },
            grid: {
                vertLines: {
                    color: "#eef4f4"
                },
                horzLines: {
                    color: "#eef4f4"
                }
            },
            rightPriceScale: {
                borderColor: "#dbe7e7",
                minimumWidth: 72
            },
            timeScale: {
                borderColor: "#dbe7e7",
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 4
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    color: "#9db3b3",
                    labelBackgroundColor: "#077a7d"
                },
                horzLine: {
                    color: "#9db3b3",
                    labelBackgroundColor: "#077a7d"
                }
            }
        });
    };

    /* The three charts show the same candles, so zooming or scrolling one moves the other two. */
    function linkChartsTogether(chartList) {
        let isSyncing = false;

        chartList.forEach(function (sourceChart) {
            sourceChart.timeScale().subscribeVisibleLogicalRangeChange(function (range) {
                if (isSyncing || !range) return;

                isSyncing = true;
                chartList.forEach(function (otherChart) {
                    if (otherChart !== sourceChart) otherChart.timeScale().setVisibleLogicalRange(range);
                });
                isSyncing = false;
            });
        });
    };

    function createCharts() {
        if (charts) return;

        const mainChart = createOneChart(elements.chart);
        const candleSeries = mainChart.addCandlestickSeries({
            upColor: COLOR_UP,
            downColor: COLOR_DOWN,
            borderUpColor: COLOR_UP,
            borderDownColor: COLOR_DOWN,
            wickUpColor: COLOR_UP,
            wickDownColor: COLOR_DOWN
        });

        const adxChart = createOneChart(elements.adx);
        const adxLine = adxChart.addLineSeries({ color: "#1f3a3b", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
        const plusLine = adxChart.addLineSeries({ color: COLOR_UP, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        const minusLine = adxChart.addLineSeries({ color: COLOR_DOWN, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

        const equityChart = createOneChart(elements.equity);
        const equityLine = equityChart.addAreaSeries({
            lineColor: "#077a7d",
            topColor: "rgba(7, 122, 125, 0.25)",
            bottomColor: "rgba(7, 122, 125, 0.02)",
            lineWidth: 2,
            priceLineVisible: false
        });

        charts = {
            mainChart: mainChart,
            candleSeries: candleSeries,
            adxLine: adxLine,
            plusLine: plusLine,
            minusLine: minusLine,
            equityLine: equityLine,
            indicatorLines: IndicatorLines.create(mainChart),   /* SuperTrend and HalfTrend. */
            tradeLines: [],          /* Dotted line of every trade. */
            thresholdLine: null,     /* ADX minimum. */
            startBalanceLine: null,
            lastCandle: null
        };

        linkChartsTogether([mainChart, adxChart, equityChart]);

        /* O / H / L / C of the candle under the mouse. */
        mainChart.subscribeCrosshairMove(function (param) {
            const candleUnderMouse = param.seriesData && param.seriesData.get(candleSeries);
            drawLegend(candleUnderMouse || charts.lastCandle);
        });

        elements.fit.addEventListener("click", function () { mainChart.timeScale().fitContent(); });

        /* Check boxes : show or hide the indicator lines. */
        elements.showSuperTrend.addEventListener("change", function () {
            charts.indicatorLines.setVisible("superTrend", elements.showSuperTrend.checked);
        });
        elements.showHalfTrend.addEventListener("change", function () {
            charts.indicatorLines.setVisible("halfTrend", elements.showHalfTrend.checked);
        });
    };

    function drawLegend(candle) {
        if (!candle) {
            elements.legend.innerHTML = "";
            return;
        };

        const colorClass = candle.close >= candle.open ? "back-testing-up" : "back-testing-down";
        const letters = [["O", "open"], ["H", "high"], ["L", "low"], ["C", "close"]];

        elements.legend.innerHTML = letters.map(function (letter) {
            return "<span>" + letter[0] + ' <b class="' + colorClass + '">' + Number(candle[letter[1]]).toFixed(2) + "</b></span>";
        }).join("");
    };

    /* ---------- Trades on the chart : entry arrow, result circle and a dotted line between them ---------- */

    function drawTradesOnChart(trades) {
        charts.tradeLines.forEach(function (line) { charts.mainChart.removeSeries(line); });
        charts.tradeLines = [];

        const showText = trades.length <= MAX_TEXT_MARKERS;
        const markers = [];

        trades.forEach(function (trade) {
            const isBuy = trade.type === "BUY";
            const isWin = trade.pnl >= 0;
            const resultText = (isWin ? "+" : "") + trade.pnl.toFixed(2);

            markers.push({
                time: trade.entry_time,
                position: isBuy ? "belowBar" : "aboveBar",
                color: isBuy ? COLOR_UP : COLOR_DOWN,
                shape: isBuy ? "arrowUp" : "arrowDown",
                text: showText ? trade.type : ""
            });
            markers.push({
                time: trade.exit_time,
                position: isBuy ? "aboveBar" : "belowBar",
                color: isWin ? COLOR_WIN : COLOR_LOSS,
                shape: "circle",
                text: showText ? resultText : ""
            });
        });

        markers.sort(function (first, second) { return first.time - second.time; });
        charts.candleSeries.setMarkers(markers);

        trades.slice(-MAX_LINES).forEach(function (trade) {
            if (trade.entry_time >= trade.exit_time) return;

            const line = charts.mainChart.addLineSeries({
                color: trade.type === "BUY" ? COLOR_UP : COLOR_DOWN,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false
            });
            line.setData([
                { time: trade.entry_time, value: trade.entry_price },
                { time: trade.exit_time, value: trade.exit_price }
            ]);
            charts.tradeLines.push(line);
        });
    };

    /* Click on a table row : the charts jump to that trade. */
    function showTradeOnChart(trade) {
        const entryIndex = state.indexByTime.get(trade.entry_time);
        const exitIndex = state.indexByTime.get(trade.exit_time);
        if (entryIndex === undefined) return;

        const lastIndex = exitIndex === undefined ? entryIndex : exitIndex;
        charts.mainChart.timeScale().setVisibleLogicalRange({ from: entryIndex - 30, to: lastIndex + 30 });
        elements.chart.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    /* ---------- Summary ---------- */

    function drawSummary(meta) {
        const summary = meta.summary;
        const profitClass = summary.netProfit >= 0 ? "back-testing-pos" : "back-testing-neg";
        const returnClass = summary.returnPct >= 0 ? "back-testing-pos" : "back-testing-neg";
        const profitFactor = summary.profitFactor === null ? "n/a" : summary.profitFactor.toFixed(2);

        /* [label, value, colour class] */
        const numbers = [
            ["Net profit", formatSigned(summary.netProfit), profitClass],
            ["Win rate", summary.winRate.toFixed(1) + "%", ""],
            ["Profit factor", profitFactor, ""],
            ["Max drawdown", formatMoney(summary.maxDrawdown) + " (" + summary.maxDrawdownPct.toFixed(1) + "%)", "back-testing-neg"],
            ["Total trades", summary.totalTrades + " (" + summary.buyTrades + " buy / " + summary.sellTrades + " sell)", ""],
            ["Wins / Losses", summary.wins + " / " + summary.losses, ""],
            ["Avg win / Avg loss", formatMoney(summary.avgWin) + " / " + formatMoney(summary.avgLoss), ""],
            ["Final balance", formatMoney(summary.finalBalance) + " (" + (summary.returnPct >= 0 ? "+" : "") + summary.returnPct.toFixed(1) + "%)", returnClass]
        ];

        elements.stats.innerHTML = numbers.map(function (number) {
            return '<div class="back-testing-stat"><span>' + number[0] + '</span><b class="' + number[2] + '">' + escapeHtml(number[1]) + "</b></div>";
        }).join("");

        elements.title.innerHTML = "<b>" + escapeHtml(meta.name) + "</b><span>" + escapeHtml(meta.dataset) +
            " &middot; " + meta.from.slice(0, 10) + " to " + meta.to.slice(0, 10) +
            " &middot; " + meta.candleCount.toLocaleString("en-US") + " candles</span>";

        elements.note.hidden = !meta.note;
        elements.note.textContent = meta.note || "";
    };

    /* ---------- Trades table ---------- */

    function buildTradeRow(trade, index) {
        const isBuy = trade.type === "BUY";
        const isWin = trade.pnl >= 0;

        const trendClass = isBuy ? "back-testing-up" : "back-testing-down";
        const trendText = isBuy ? "&#9650; Uptrend" : "&#9660; Downtrend";
        const typeClass = isBuy ? "back-testing-badge-buy" : "back-testing-badge-sell";
        const pnlClass = isWin ? "back-testing-pos" : "back-testing-neg";
        const resultClass = isWin ? "back-testing-badge-win" : "back-testing-badge-loss";
        const duration = formatDuration(Math.max(0, trade.exit_time - trade.entry_time));

        return '<tr data-index="' + index + '">' +
            "<td>" + trade.no + "</td>" +
            '<td class="' + trendClass + '">' + trendText + "</td>" +
            '<td><span class="back-testing-badge ' + typeClass + '">' + escapeHtml(trade.type) + "</span></td>" +
            '<td class="back-testing-num">' + trade.lots.toFixed(2) + "</td>" +
            "<td>" + formatTime(trade.entry_time) + "</td>" +
            '<td class="back-testing-num">' + trade.entry_price.toFixed(2) + "</td>" +
            "<td>" + formatTime(trade.exit_time) + "</td>" +
            '<td class="back-testing-num">' + trade.exit_price.toFixed(2) + "</td>" +
            "<td>" + duration + "</td>" +
            "<td>" + escapeHtml(trade.exit_reason) + "</td>" +
            '<td class="back-testing-num ' + pnlClass + '">' + formatSigned(trade.pnl) + "</td>" +
            '<td><span class="back-testing-badge ' + resultClass + '">' + (isWin ? "Profit" : "Loss") + "</span></td>" +
            '<td class="back-testing-num">' + formatMoney(trade.balance_after) + "</td>" +
            "</tr>";
    };

    function drawTable() {
        const trades = state.trades;
        const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
        if (state.page > totalPages) state.page = totalPages;

        const firstIndex = (state.page - 1) * PAGE_SIZE;
        const tradesOfThisPage = trades.slice(firstIndex, firstIndex + PAGE_SIZE);

        elements.tbody.innerHTML = tradesOfThisPage.map(function (trade, position) {
            return buildTradeRow(trade, firstIndex + position);
        }).join("");

        elements.empty.hidden = trades.length > 0;
        elements.count.textContent = trades.length + " trades (click a row to see it on the chart)";
        elements.pageInfo.textContent = "Page " + state.page + " of " + totalPages;
        elements.prev.disabled = state.page <= 1;
        elements.next.disabled = state.page >= totalPages;
    };

    /* ---------- Public : mount and render ---------- */

    function mount(container) {
        container.innerHTML = TEMPLATE;
        elements = { root: container };
        ROLE_NAMES.forEach(function (name) { elements[name] = findPart(name); });

        elements.prev.addEventListener("click", function () { state.page--; drawTable(); });
        elements.next.addEventListener("click", function () { state.page++; drawTable(); });
        elements.tbody.addEventListener("click", function (event) {
            const row = event.target.closest("tr");
            if (row && charts) showTradeOnChart(state.trades[Number(row.dataset.index)]);
        });
    };

    /* An ADX row is [time, adx, +DI, -DI]. A null value gives an empty point, so every chart has the same candles. */
    function adxPoint(row, columnIndex) {
        return row[columnIndex] === null ? { time: row[0] } : { time: row[0], value: row[columnIndex] };
    };

    function render(result) {
        if (!elements) throw new Error("BTView.mount() must be called first");
        createCharts();

        const meta = result.meta;
        const chartData = result.chart;
        const config = meta.config;

        drawSummary(meta);

        /* Candles. */
        const candles = chartData.candles.map(function (row) {
            return { time: row[0], open: row[1], high: row[2], low: row[3], close: row[4] };
        });
        charts.candleSeries.setData(candles);
        charts.lastCandle = candles[candles.length - 1];
        drawLegend(charts.lastCandle);

        state.indexByTime = new Map();
        candles.forEach(function (candle, index) { state.indexByTime.set(candle.time, index); });

        /* SuperTrend and HalfTrend lines (drawn only for the check boxes that are ticked). */
        charts.indicatorLines.setData({ superTrend: chartData.superTrend, halfTrend: chartData.halfTrend }, 0);
        charts.indicatorLines.setVisible("superTrend", elements.showSuperTrend.checked);
        charts.indicatorLines.setVisible("halfTrend", elements.showHalfTrend.checked);

        /* ADX with its minimum line. */
        charts.adxLine.setData(chartData.adx.map(function (row) { return adxPoint(row, 1); }));
        charts.plusLine.setData(chartData.adx.map(function (row) { return adxPoint(row, 2); }));
        charts.minusLine.setData(chartData.adx.map(function (row) { return adxPoint(row, 3); }));

        if (charts.thresholdLine) charts.adxLine.removePriceLine(charts.thresholdLine);
        charts.thresholdLine = charts.adxLine.createPriceLine({
            price: config.adx.threshold, color: "#8b5cf6", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Min " + config.adx.threshold
        });

        /* Equity with the start balance line. */
        charts.equityLine.setData(chartData.equity.map(function (row) { return { time: row[0], value: row[1] }; }));

        if (charts.startBalanceLine) charts.equityLine.removePriceLine(charts.startBalanceLine);
        charts.startBalanceLine = charts.equityLine.createPriceLine({
            price: config.trade.initialBalance, color: "#9db3b3", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Start"
        });

        /* Trades. */
        state.trades = result.trades;
        state.page = 1;
        drawTradesOnChart(result.trades);
        drawTable();

        /* Show the newest candles first (the other two charts follow). */
        charts.mainChart.timeScale().setVisibleLogicalRange({
            from: Math.max(0, candles.length - VISIBLE_CANDLES),
            to: candles.length + 4
        });
    };

    window.BTView = { mount: mount, render: render };
})();
