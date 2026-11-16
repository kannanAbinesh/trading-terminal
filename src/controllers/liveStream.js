/* Helpers. */
const live = require('../helpers/liveStore');

module.exports = {
    /* GET /api/v1/trading/liveStream (browser, Server-Sent Events).
       Events : snapshot (full chart), tick (newest candles + position + account), waiting, trades (a trade was closed). */
    liveStream: async (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'   /* Stops nginx from buffering the stream. */
        });
        res.write('retry: 3000\n\n');

        live.addClient(req, res);
    }
};
