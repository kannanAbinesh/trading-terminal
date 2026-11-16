/* Strategy Values page : shows the saved SuperTrend / HalfTrend / ADX values and saves the changes.
   These are the values the live signal uses. The back test form and the live chart lines start from them too.

   Server routes : GET strategyValues, POST strategyValues. */
document.addEventListener('DOMContentLoaded', async function () {

    /* Variables. */
    const STRATEGY_VALUES_URL = '/api/v1/trading/strategyValues';
    const saveButton = document.getElementById('strategy-values-btn');
    const inputs = Array.from(document.querySelectorAll('input[data-strategy]'));   /* data-strategy = group, data-key = value name. */

    /* Show the saved values in the input fields. */
    const saved = await apiFetch(STRATEGY_VALUES_URL, { quiet: true });
    if (saved.ok) {
        inputs.forEach(function (input) {
            input.value = saved.data.values[input.dataset.strategy][input.dataset.key];
        });
    };

    /* The values in the fields, as { superTrend: { period, multiplier }, halfTrend: { amplitude }, adx: { period, threshold } }. */
    function readInputs() {
        const values = {};

        for (const input of inputs) {
            const number = parseFloat(input.value);
            if (!Number.isFinite(number)) return null;

            values[input.dataset.strategy] = values[input.dataset.strategy] || {};
            values[input.dataset.strategy][input.dataset.key] = number;
        };
        return values;
    };

    saveButton.onclick = async function () {
        const values = readInputs();
        if (!values) return Toaster.warning('Please enter a number in every field.');

        saveButton.disabled = true;
        await apiFetch(STRATEGY_VALUES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
            message: 'Strategy values saved. The live signal uses them from the next candle.'
        });
        saveButton.disabled = false;
    };
});
