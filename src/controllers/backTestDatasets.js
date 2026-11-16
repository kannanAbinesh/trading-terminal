/* Plugins. */
const path = require('path');
const fs = require('fs').promises;

/* Helpers. */
const { DATASETS } = require('../helpers/paths');
const { round } = require('../helpers/csv');

module.exports = {
    /* GET /api/v1/trading/backTestDatasets : the CSV files (uploads/datasets) the user can test on. */
    backTestDatasets: async (req, res) => {
        try {

            await fs.mkdir(DATASETS, { recursive: true });
            const names = (await fs.readdir(DATASETS)).filter((name) => name.toLowerCase().endsWith('.csv')).sort();
            const datasets = await Promise.all(names.map(async (name) => ({
                file: name,
                size_mb: round((await fs.stat(path.join(DATASETS, name))).size / 1048576, 1)
            })));

            return res.status(200).json({ status: 200, datasets });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the datasets : ${error.message}` }) };
    }
};
