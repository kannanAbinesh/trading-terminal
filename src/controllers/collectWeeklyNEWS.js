/* Plugins. */
const path = require('path');
const fs = require('fs').promises;

/* Helpers. */
const { WEEKLY_NEWS } = require('../helpers/paths');

module.exports = {
    /* POST /api/v1/trading/collectWeeklyNEWS (called by the MT5 EA, no cookie). */
    collectWeeklyNEWS: async (req, res) => {
        try {

            /* Variables. */
            const { symbol, week_start, week_end, events } = req.body || {};

            /* Validate the request. */
            if (!Array.isArray(events)) return res.status(400).json({ status: 400, message: 'events array is required' });
            if (!Number.isFinite(Number(week_start))) return res.status(400).json({ status: 400, message: 'week_start is required' });

            /* Define the folder path for storing the weekly NEWS as a JSON. */
            const newsPath = WEEKLY_NEWS;
            await fs.mkdir(newsPath, { recursive: true });

            /* One file per week, named by the Monday date (e.g. weeklyNEWS_2026-11-02.json). It is overwritten on every push so actual values stay fresh. */
            const weekDate = new Date(Number(week_start) * 1000).toISOString().slice(0, 10);
            const filePath = path.join(newsPath, `${weekDate}.json`);

            const data = {
                symbol: symbol || null,
                week_start: Number(week_start),
                week_end: Number(week_end) || null,
                received_at: new Date().toISOString(),
                count: events.length,
                events
            };

            /* Write to a temp file then rename, so a reader never sees a half-written file. */
            const tempPath = `${filePath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
            await fs.rename(tempPath, filePath);

            return res.status(200).json({ status: 200, message: `NEWS saved successfully` });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in collecting the weekly NEWS from meta trader 5 : ${error}` }) }
    }
};