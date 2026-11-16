(function () {

    /* Variable declarations. */
    const stream_URL = "/api/v1/trading/liveStream";
    const trades_URL = "/api/v1/trading/liveTradeHistory";
    const MAX_TRADES = 150;          /* Newest closed trades drawn on the chart (each one has a dotted line). */
    const VISIBLE_CANDLES = 120;     /* How many candles are shown when the chart first opens. */

    const COLOR_UP = "#089981";      /* Buy side and rising candles. */
    const COLOR_DOWN = "#e5383b";    /* Sell side and falling candles. */
    const COLOR_WIN = "#16a34a";
    const COLOR_LOSS = "#dc2626";

    const legend = document.getElementById("liveLegend");
    const overlay = document.getElementById("liveOverlay");

    /* The chart library shows UTC, so the browser's offset is added to show the local time. */
    const timeZoneShift = -new Date().getTimezoneOffset() * 60;

    let digits = 2;                  /* Decimal places of the price. */
    let symbol = "";
    let chartData = [];              /* Our own copy of the candles that are on the chart. */
    let lastCandle = null;
    let isFirstSnapshot = true;

    let entryLine = null;            /* Price line of the open position. */
    let openPositionKey = "";        /* Changes when the position changes, so the line is only redrawn then. */
    let openMarker = null;           /* Arrow on the entry candle of the open position. */

    let closedTrades = [];
    let tradeLines = [];             /* One dotted line per closed trade. */
    let tradeMarkers = [];           /* Entry arrow and result circle of the closed trades. */

    /* ---------- Chart ---------- */

    const chart = LightweightCharts.createChart(document.getElementById("liveChart"), {
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
            borderColor: "#dbe7e7"
        },
        timeScale: {
            borderColor: "#dbe7e7",
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 6
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

    /* The Trade Panel (live-trade-indicators.js) and the news circles (live-trade-news-markers.js) use this chart. */
    window.LiveChart = { chart: chart, timeZoneShift: timeZoneShift, getChartData: function () { return chartData; } };

    const candleSeries = chart.addCandlestickSeries({
        upColor: COLOR_UP,
        downColor: COLOR_DOWN,
        borderUpColor: COLOR_UP,
        borderDownColor: COLOR_DOWN,
        wickUpColor: COLOR_UP,
        wickDownColor: COLOR_DOWN
    });

    /* ---------- Small helpers ---------- */

    function toChartCandle(candle) {
        return {
            time: Number(candle.time) + timeZoneShift,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        };
    };

    function formatPrice(value) {
        if (value === null || value === undefined || isNaN(value)) return "--";
        return Number(value).toFixed(digits);
    };

    function setDigits(value) {
        if (!Number.isFinite(Number(value))) return;

        digits = Number(value);
        candleSeries.applyOptions({
            priceFormat: { type: "price", precision: digits, minMove: 1 / Math.pow(10, digits) }
        });
    };

    /* The candle that holds this time : the last candle that opened at or before it.
       Returns null when the time is older than the first candle on the chart. (Binary search, the candles are sorted.) */
    function findCandleTime(seconds) {
        const target = Number(seconds) + timeZoneShift;
        let low = 0;
        let high = chartData.length - 1;
        let found = null;

        while (low <= high) {
            const middle = (low + high) >> 1;

            if (chartData[middle].time <= target) {
                found = chartData[middle].time;
                low = middle + 1;
            } else {
                high = middle - 1;
            };
        };
        return found;
    };

    /* ---------- Legend : O H L C of the candle under the mouse (or the latest one) ---------- */

    function drawLegend(candle) {
        if (!candle) {
            legend.innerHTML = "";
            return;
        };

        const colorClass = candle.close >= candle.open ? "live-trade-up" : "live-trade-down";
        legend.innerHTML =
            '<span>O <b class="' + colorClass + '">' + formatPrice(candle.open) + "</b></span>" +
            '<span>H <b class="' + colorClass + '">' + formatPrice(candle.high) + "</b></span>" +
            '<span>L <b class="' + colorClass + '">' + formatPrice(candle.low) + "</b></span>" +
            '<span>C <b class="' + colorClass + '">' + formatPrice(candle.close) + "</b></span>";
    };

    chart.subscribeCrosshairMove(function (param) {
        const candleUnderMouse = param.seriesData && param.seriesData.get(candleSeries);
        drawLegend(candleUnderMouse || lastCandle);
    });

    /* ---------- Markers (arrows and circles on the candles) ---------- */

    /* The chart wants the markers sorted by time. */
    function drawMarkers() {
        const allMarkers = tradeMarkers.slice();
        if (openMarker) allMarkers.push(openMarker);

        allMarkers.sort(function (first, second) { return first.time - second.time; });
        candleSeries.setMarkers(allMarkers);
    };

    /* ---------- Open position : entry price line and an arrow on the entry candle ---------- */

    function drawOpenPosition(position) {
        const isOpen = position && (position.type === "BUY" || position.type === "SELL");
        const newKey = isOpen ? [position.type, position.open_price, position.open_time].join("|") : "";

        /* Nothing changed, so the line and the arrow stay as they are. */
        if (newKey === openPositionKey) return;
        openPositionKey = newKey;

        if (entryLine) {
            candleSeries.removePriceLine(entryLine);
            entryLine = null;
        };
        openMarker = null;

        if (!isOpen) {
            drawMarkers();
            return;
        };

        const isBuy = position.type === "BUY";
        const color = isBuy ? COLOR_UP : COLOR_DOWN;

        entryLine = candleSeries.createPriceLine({
            price: Number(position.open_price),
            color: color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: position.type
        });

        const entryCandleTime = findCandleTime(position.open_time);
        if (entryCandleTime !== null) {
            openMarker = {
                time: entryCandleTime,
                position: isBuy ? "belowBar" : "aboveBar",
                color: color,
                shape: isBuy ? "arrowUp" : "arrowDown",
                text: position.type
            };
        };
        drawMarkers();
    };

    /* ---------- Closed trades : entry arrow, result circle and a dotted line between them ---------- */

    async function loadClosedTrades(quiet) {
        const result = await window.apiFetch(trades_URL, { quiet: quiet });
        if (!result.ok) return;

        closedTrades = (result.data.trades || []).map(function (trade) {
            return {
                symbol: trade.symbol,
                type: trade.type,
                entryTime: trade.entry_time,
                entryPrice: trade.entry_price,
                exitTime: trade.exit_time,
                exitPrice: trade.exit_price,
                pnl: trade.pnl
            };
        });
        drawClosedTrades();
    };

    function drawOneClosedTrade(trade) {
        const isBuy = trade.type === "BUY";
        const isWin = trade.pnl >= 0;
        const entryCandleTime = findCandleTime(trade.entryTime);
        const exitCandleTime = findCandleTime(trade.exitTime);

        /* Older than the candles on the chart : nothing to draw. */
        if (exitCandleTime === null) return;

        /* Start of the trade. */
        if (entryCandleTime !== null) {
            tradeMarkers.push({
                time: entryCandleTime,
                position: isBuy ? "belowBar" : "aboveBar",
                color: isBuy ? COLOR_UP : COLOR_DOWN,
                shape: isBuy ? "arrowUp" : "arrowDown",
                text: trade.type
            });
        };

        /* End of the trade, with its result. */
        tradeMarkers.push({
            time: exitCandleTime,
            position: isBuy ? "aboveBar" : "belowBar",
            color: isWin ? COLOR_WIN : COLOR_LOSS,
            shape: "circle",
            text: (isWin ? "+" : "") + trade.pnl.toFixed(2)
        });

        /* Dotted line from the entry price to the exit price. */
        const hasLine = entryCandleTime !== null && entryCandleTime < exitCandleTime;
        if (!hasLine) return;

        const line = chart.addLineSeries({
            color: isWin ? COLOR_WIN : COLOR_LOSS,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false
        });
        line.setData([
            { time: entryCandleTime, value: trade.entryPrice },
            { time: exitCandleTime, value: trade.exitPrice }
        ]);
        tradeLines.push(line);
    };

    function drawClosedTrades() {
        tradeLines.forEach(function (line) { chart.removeSeries(line); });
        tradeLines = [];
        tradeMarkers = [];

        if (chartData.length === 0) {
            drawMarkers();
            return;
        };

        const tradesOfThisSymbol = closedTrades.filter(function (trade) {
            return !symbol || !trade.symbol || trade.symbol === symbol;
        });
        tradesOfThisSymbol.sort(function (first, second) { return first.entryTime - second.entryTime; });

        tradesOfThisSymbol.slice(-MAX_TRADES).forEach(drawOneClosedTrade);
        drawMarkers();
    };

    /* ---------- Messages from the server ---------- */

    /* snapshot : all the candles (sent when the page connects, and again if MT5 reconnects). */
    function readSnapshot(message) {
        setDigits(message.digits);

        const candles = (message.candles || []).map(toChartCandle);
        chartData = candles;
        symbol = message.symbol || symbol;
        candleSeries.setData(candles);
        openPositionKey = "~";   /* Forces the entry line to be drawn again on the new candles. */

        if (candles.length > 0) {
            lastCandle = message.candles[message.candles.length - 1];
            drawLegend(lastCandle);

            if (isFirstSnapshot) {
                chart.timeScale().setVisibleLogicalRange({
                    from: Math.max(0, candles.length - VISIBLE_CANDLES),
                    to: candles.length + 6
                });
                isFirstSnapshot = false;
            };
            overlay.style.display = "none";
        };

        drawOpenPosition(message.position);
        drawClosedTrades();
    };

    /* One candle from MT5. The chart only accepts updates for the newest candle (or a new one).
       MT5 also resends the last closed candle, so an older candle is replaced in our copy
       and the chart is redrawn only when its values really changed. */
    function readOneCandle(rawCandle) {
        const candle = toChartCandle(rawCandle);
        const newestCandle = chartData[chartData.length - 1];

        /* A new candle. */
        if (!newestCandle || candle.time > newestCandle.time) {
            chartData.push(candle);
            candleSeries.update(candle);
            return false;
        };

        /* The newest candle changed. */
        if (candle.time === newestCandle.time) {
            chartData[chartData.length - 1] = candle;
            candleSeries.update(candle);
            return false;
        };

        /* An older candle : look for it and replace it only if its values are different. */
        for (let index = chartData.length - 1; index >= 0; index--) {
            if (chartData[index].time !== candle.time) continue;

            const oldCandle = chartData[index];
            const isDifferent = oldCandle.open !== candle.open || oldCandle.high !== candle.high ||
                oldCandle.low !== candle.low || oldCandle.close !== candle.close;

            if (isDifferent) {
                chartData[index] = candle;
                return true;   /* The whole chart must be drawn again. */
            };
            return false;
        };
        return false;
    };

    /* tick : the newest candles and the open position (sent many times a second). */
    function readTick(message) {
        let mustRedraw = false;

        (message.candles || []).forEach(function (rawCandle) {
            if (readOneCandle(rawCandle)) mustRedraw = true;
        });
        if (mustRedraw) candleSeries.setData(chartData);

        if (message.candles && message.candles.length > 0) {
            lastCandle = message.candles[message.candles.length - 1];
        };
        drawLegend(lastCandle);
        drawOpenPosition(message.position);
    };

    /* ---------- Start (the browser reconnects by itself if the connection drops) ---------- */

    const stream = new EventSource(stream_URL);
    stream.addEventListener("snapshot", function (event) { readSnapshot(JSON.parse(event.data)); });
    stream.addEventListener("tick", function (event) { readTick(JSON.parse(event.data)); });
    stream.addEventListener("trades", function () { loadClosedTrades(true); });   /* A trade closed : reload the list. */

    loadClosedTrades(false);
})();