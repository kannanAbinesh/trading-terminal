/* Plugins. */
const path = require('path');
const fs = require('fs').promises;

/* Helpers. */
const { WEEKLY_NEWS } = require('../helpers/paths');

module.exports = {
    getWeeklyNEWS: async (req, res) => {
        try {

            /* Validate the request. */
            const keys = String(req.query.weeks || '').split(',').map((key) => key.trim()).filter(Boolean);
            if (!keys.length) return res.status(400).json({ status: 400, message: 'weeks is required (for example weeks=2026-11-02)' });
            if (keys.length > 60 || keys.some((key) => !/^\d{4}-\d{2}-\d{2}$/.test(key))) return res.status(400).json({ status: 400, message: 'weeks must be a list of Monday dates (YYYY-MM-DD), at most 60' });

            /* Read the files. */
            const weeks = {};
            let count = 0;
            await Promise.all(keys.map(async (key) => {
                try {
                    const data = JSON.parse(await fs.readFile(path.join(WEEKLY_NEWS, `${key}.json`), 'utf8'));
                    weeks[key] = Array.isArray(data.events) ? data.events : [];
                } catch (error) { weeks[key] = []; }
                count += weeks[key].length;
            }));

            return res.status(200).json({ status: 200, message: count ? `${count} news events loaded` : 'No news saved for the selected period yet', weeks });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the weekly NEWS : ${error.message}` }) };
    }
};
