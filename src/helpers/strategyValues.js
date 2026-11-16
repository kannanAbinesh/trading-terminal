/* The strategy values : the one place the SuperTrend, HalfTrend and ADX settings come from.

   They are saved in src/public/data/strategyValues.json, edited in the "Strategy Values" page and used by
     - the live signal (generateSignal),
     - the back test form (starting values),
     - the live chart lines (when nothing is typed in the indicator popup). */
const fs = require('fs').promises;

const { STRATEGY_VALUES_FILE } = require('./paths');
const { readNumber } = require('./numberField');

/* Every value, with the label shown in error messages and its allowed range. */
const VALUE_RULES = {
    superTrend: {
        period: { label: 'SuperTrend ATR length', min: 2, max: 200, integer: true },
        multiplier: { label: 'SuperTrend multiplier', min: 0.1, max: 20, integer: false }
    },
    halfTrend: {
        amplitude: { label: 'HalfTrend amplitude', min: 1, max: 50, integer: true }
    },
    adx: {
        period: { label: 'ADX period', min: 2, max: 100, integer: true },
        threshold: { label: 'Minimum ADX to open a trade', min: 0, max: 100, integer: false }
    }
};

/* Reads the saved values. */
const readStrategyValues = async () => {
    return JSON.parse(await fs.readFile(STRATEGY_VALUES_FILE, 'utf8'));
};

/* Takes the values typed by a user (any of them can be missing) and fills the missing ones from `baseValues`.
   Returns a complete, checked set of values. */
const mergeStrategyValues = (typedValues, baseValues) => {
    const result = {};

    Object.keys(VALUE_RULES).forEach((groupName) => {
        result[groupName] = {};

        Object.keys(VALUE_RULES[groupName]).forEach((valueName) => {
            const rule = VALUE_RULES[groupName][valueName];
            result[groupName][valueName] = readNumber({
                ...rule,
                value: typedValues?.[groupName]?.[valueName],
                fallback: baseValues?.[groupName]?.[valueName]
            });
        });
    });

    return result;
};

/* Checks and saves the values. A value that is not sent keeps its saved value. */
const saveStrategyValues = async (typedValues) => {
    const cleanValues = mergeStrategyValues(typedValues, await readStrategyValues());
    await fs.writeFile(STRATEGY_VALUES_FILE, JSON.stringify(cleanValues, null, 2), 'utf8');
    return cleanValues;
};

module.exports = { readStrategyValues, mergeStrategyValues, saveStrategyValues };
