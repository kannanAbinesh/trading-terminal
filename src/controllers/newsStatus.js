/* Helpers. */
const { getNewsStatus } = require('../helpers/newsBlackout');

module.exports = {
    /* GET /api/v1/trading/newsStatus (called by the MT5 EA every few seconds, and by the Live Trade page. No login cookie for MT5).
       Answer : { blackout: true | false, event, startsAt, endsAt, nextEvent, minutesBefore, minutesAfter }
       The EA closes every open trade as soon as blackout is true. */
    newsStatus: async (req, res) => {
        try {

            return res.status(200).json({ status: 200, ...(await getNewsStatus()) });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in reading the news status : ${error.message}` }) };
    }
};
