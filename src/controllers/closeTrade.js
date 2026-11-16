/* Helpers. */
const live = require('../helpers/liveStore');
const { botControl, requestClose } = require('../helpers/botControl');

module.exports = {
    /* POST /api/v1/trading/closeTrade : exits the open trade now. Trading stays ON.
       The EA sees the new closeRequestId (GET botControl) and closes the position within a few seconds.
       The same trend is not entered again : the bot waits for a new trend. */
    closeTrade: async (req, res) => {
        try {

            const store = live.getActiveStore();
            const positionType = store && store.position ? store.position.type : 'NONE';
            if (positionType !== 'BUY' && positionType !== 'SELL') {
                return res.status(400).json({ status: 400, message: 'There is no open trade to close.' });
            };

            requestClose(positionType === 'BUY' ? 1 : -1);
            return res.status(200).json({ status: 200, message: `Closing the ${positionType} trade. The bot now waits for a new trend.`, ...botControl });

        } catch (error) { return res.status(400).json({ status: 400, message: `Something went wrong in closing the trade : ${error.message}` }) };
    }
};
