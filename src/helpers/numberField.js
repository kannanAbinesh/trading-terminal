/* Reads one number from a form or a request.
   - Empty value  : the fallback is used. With no fallback an Error is thrown (the field is required).
   - Not valid    : an Error with a readable message is thrown (it is shown to the user in a toast). */
const readNumber = ({ label, value, min, max, integer = false, fallback }) => {

    const isEmpty = value === undefined || value === null || value === '';
    if (isEmpty) {
        if (fallback === undefined) throw new Error(`${label} is required`);
        return fallback;
    };

    const number = Number(value);
    const isWrongType = integer && !Number.isInteger(number);

    if (!Number.isFinite(number) || number < min || number > max || isWrongType) {
        throw new Error(`${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}`);
    };

    return number;
};

module.exports = { readNumber };
