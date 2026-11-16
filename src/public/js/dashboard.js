(function () {

    /* Variable declarations. */
    const STATS_URL = "/api/v1/trading/dashboardStats";
    const stream_URL = "/api/v1/trading/liveStream";

    const timeZoneShift = -new Date().getTimezoneOffset() * 60;   /* The chart works in UTC, this makes it show the local time. */

    let account = null;          /* { balance, equity, currency } from MT5. */
    let balanceCurve = [];       /* [{ time, value }] balance after each closed trade (UTC seconds). */
    let startBalance = null;     /* Balance before the first closed trade. */

    /* ---------- Chart ---------- */

    const chart = LightweightCharts.createChart(getById("dashboard-chart"), {
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
                color: "#f1f6f6"
            },
            horzLines: {
                color: "#f1f6f6"
            }
        },
        rightPriceScale: {
            borderColor: "#dbe7e7"
        },
        timeScale: {
            borderColor: "#dbe7e7",
            timeVisible: true,
            secondsVisible: false
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal
        }
    });

    const balanceSeries = chart.addAreaSeries({
        lineColor: "#077a7d",
        topColor: "rgba(7, 122, 125, 0.28)",
        bottomColor: "rgba(7, 122, 125, 0.02)",
        lineWidth: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 }
    });

    /* ---------- Small helpers ---------- */

    function getById(id) {
        return document.getElementById(id);
    };

    function formatMoney(value, currency) {
        if (value === null || value === undefined || isNaN(value)) return "--";
        const number = Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return currency ? number + " " + currency : number;
    };

    function formatSigned(value) {
        const sign = value >= 0 ? "+" : "";
        return sign + Number(value).toFixed(2);
    };

    /* The "equity right now" point moves once per minute, so the graph does not get a new point every second. */
    function currentMinute() {
        return Math.floor(Date.now() / 60000) * 60;
    };

    /* ---------- Chart points ---------- */

    /* The graph needs: start balance, balance after each trade, equity right now.
       The chart library wants the times to be unique and rising, so a repeated time only updates the value. */
    function buildChartPoints() {
        const points = [];

        function addPoint(time, value) {
            const chartTime = Math.floor(time) + timeZoneShift;
            const lastPoint = points[points.length - 1];

            if (lastPoint && chartTime <= lastPoint.time) {
                lastPoint.value = value;
                return;
            };
            points.push({ time: chartTime, value: value });
        };

        if (balanceCurve.length > 0 && startBalance !== null) addPoint(balanceCurve[0].time - 60, startBalance);
        balanceCurve.forEach(function (point) { addPoint(point.time, point.value); });
        if (account && Number.isFinite(account.equity)) addPoint(currentMinute(), account.equity);

        return points;
    };

    /* ---------- Drawing ---------- */

    function drawChart() {
        const points = buildChartPoints();
        const hasEnoughPoints = points.length >= 2;

        getById("dashboard-chart-empty").style.display = hasEnoughPoints ? "none" : "flex";
        if (!hasEnoughPoints) return;

        balanceSeries.setData(points);
        chart.timeScale().fitContent();
    };

    function drawAccount() {
        const currency = account ? account.currency : "";
        getById("dashboard-balance").textContent = account ? formatMoney(account.balance, currency) : "--";
        getById("dashboard-equity").textContent = account ? formatMoney(account.equity, currency) : "--";
    };

    function drawTotals(totals) {
        getById("dashboard-total").textContent = totals.trades;
        getById("dashboard-wins").textContent = totals.profitTrades;
        getById("dashboard-losses").textContent = totals.lossTrades;
        getById("dashboard-rate").textContent = "Win rate " + totals.winRate + "%";
        getById("dashboard-gross-profit").textContent = "Gross " + formatSigned(totals.grossProfit);
        getById("dashboard-gross-loss").textContent = "Gross " + Number(totals.grossLoss).toFixed(2);

        const netProfit = getById("dashboard-net");
        netProfit.textContent = formatSigned(totals.netProfit);
        netProfit.className = totals.netProfit >= 0 ? "dashboard-profit" : "dashboard-loss";
    };

    /* ---------- Loading ---------- */

    async function loadStats(quiet) {
        const result = await window.apiFetch(STATS_URL, { quiet: quiet });
        if (!result.ok) return;

        const data = result.data;
        account = data.account || account;
        balanceCurve = data.curve || [];
        startBalance = data.startBalance;

        drawTotals(data.totals);
        drawAccount();
        drawChart();
    };

    /* ---------- Live messages ---------- */

    function readLiveMessage(message) {
        if (!message.account) return;

        account = message.account;
        drawAccount();

        /* Only the newest point is updated (the whole graph is not redrawn), so the zoom of the user stays. */
        const canUpdateLastPoint = balanceCurve.length > 0 && Number.isFinite(account.equity);
        if (!canUpdateLastPoint) return;

        try {
            balanceSeries.update({ time: currentMinute() + timeZoneShift, value: account.equity });
        } catch (error) {
            drawChart();
        };
    };

    const stream = new EventSource(stream_URL);
    stream.addEventListener("snapshot", function (event) { readLiveMessage(JSON.parse(event.data)); });
    stream.addEventListener("tick", function (event) { readLiveMessage(JSON.parse(event.data)); });
    stream.addEventListener("trades", function () { loadStats(true); });   /* A trade closed : new totals and new curve. */

    loadStats(false);
})();