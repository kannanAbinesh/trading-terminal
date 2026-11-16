/* SuperTrend and HalfTrend lines on a Lightweight Charts chart.
   Used by the Live Trade page and by the Back Testing result.

   const lines = IndicatorLines.create(chart);
   lines.setData({ superTrend: rows, halfTrend: rows }, timeShift);   // rows : [{ time, value, trend }] or [[time, value, trend]]
   lines.setVisible("superTrend", true);                               // show or hide one indicator
   lines.clear();

   Each indicator is one line. Its colour follows the trend (rising / falling). */
(function () {

    /* Colours : [rising, falling]. The lines are made to be seen on top of green / red candles. */
    const LINE_COLORS = {
        superTrend: { rising: "#0ea5a8", falling: "#f97316", title: "SuperTrend" },
        halfTrend: { rising: "#2563eb", falling: "#a21caf", title: "HalfTrend" }
    };

    const RISING = 1;

    /* A row can be an object (live chart) or a list [time, value, trend] (saved back test). */
    function readRow(row, timeShift) {
        const isList = Array.isArray(row);
        return {
            time: Number(isList ? row[0] : row.time) + timeShift,
            value: isList ? row[1] : row.value,
            trend: isList ? row[2] : row.trend
        };
    };

    /* Points of one line. The colour of each point follows the trend. A candle without a value gets an empty point. */
    function buildPoints(rows, colors, timeShift) {
        return rows.map(function (row) {
            const point = readRow(row, timeShift);
            const hasValue = point.value !== null && point.value !== undefined && Number.isFinite(point.value);
            if (!hasValue) return { time: point.time };

            return { time: point.time, value: point.value, color: point.trend === RISING ? colors.rising : colors.falling };
        });
    };

    function createSeries(chart, colors) {
        return chart.addLineSeries({
            color: colors.rising,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false
        });
    };

    function create(chart) {
        const series = {
            superTrend: createSeries(chart, LINE_COLORS.superTrend),
            halfTrend: createSeries(chart, LINE_COLORS.halfTrend)
        };
        const isVisible = { superTrend: false, halfTrend: false };
        let savedRows = { superTrend: [], halfTrend: [] };
        let savedShift = 0;

        /* A hidden indicator gets no points, so nothing is drawn and the price scale ignores it. */
        function draw(name) {
            const rows = isVisible[name] ? savedRows[name] : [];
            series[name].setData(buildPoints(rows, LINE_COLORS[name], savedShift));
        };

        return {
            setData: function (rowsByName, timeShift) {
                savedRows = { superTrend: rowsByName.superTrend || [], halfTrend: rowsByName.halfTrend || [] };
                savedShift = timeShift || 0;
                draw("superTrend");
                draw("halfTrend");
            },
            setVisible: function (name, visible) {
                isVisible[name] = Boolean(visible);
                draw(name);
            },
            clear: function () {
                savedRows = { superTrend: [], halfTrend: [] };
                draw("superTrend");
                draw("halfTrend");
            }
        };
    };

    window.IndicatorLines = { create: create, colors: LINE_COLORS };
})();
