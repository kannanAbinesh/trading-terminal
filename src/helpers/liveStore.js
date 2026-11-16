/* Live data kept in memory + the Server-Sent Events (SSE) connections of the open browsers.
   - The MT5 EA pushes candles to receiveLiveCandles, which updates this store.
   - Every open page (live chart, dashboard, floating trade widget) listens through liveStream. */

const MAX_CANDLES = 1500;      /* Candles kept in memory per symbol / timeframe. */
const MIN_CANDLES = 50;        /* Below this the server asks the EA for the history again. */
const HEARTBEAT_MS = 15000;    /* Keeps the SSE connection open through proxies. */

const stores = new Map();      /* "XAUUSD_M15" -> { symbol, timeframe, digits, candles[], bid, ask, position, updated_at } */
const clients = new Set();     /* Connected browsers: { res, followKey }. */
let account = null;            /* Latest MT5 account : { login, name, currency, balance, equity, ... }. */
let activeKey = null;          /* The chart the EA is currently sending (one chart for now). */
let heartbeat = null;

/* Insert or replace one candle, keeping the list sorted by time. */
const upsertCandle = (list, candle) => {
    const last = list[list.length - 1];
    if (!last || candle.time > last.time) return list.push(candle);
    if (candle.time === last.time) { list[list.length - 1] = candle; return; }
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].time === candle.time) { list[i] = candle; return; }
        if (list[i].time < candle.time) { list.splice(i + 1, 0, candle); return; }
    }
    list.unshift(candle);
};

const getStore = (symbol, timeframe) => {
    const key = `${symbol}_${timeframe}`;
    if (!stores.has(key)) stores.set(key, { symbol, timeframe, digits: 2, candles: [], bid: null, ask: null, position: { type: 'NONE' }, updated_at: null });
    return { key, store: stores.get(key) };
};

const snapshotOf = (store) => ({
    symbol: store.symbol, timeframe: store.timeframe, digits: store.digits, candles: store.candles,
    bid: store.bid, ask: store.ask, position: store.position, account, updated_at: store.updated_at
});

/* ---------- SSE ---------- */
const send = (client, event, data) => {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof client.res.flush === 'function') client.res.flush();
};

/* A named event to every browser (for example "trades" when a trade was closed). */
const broadcastEvent = (event, data) => {
    clients.forEach((client) => {
        try { send(client, event, data); } catch (error) { clients.delete(client); }
    });
};

/* Live update. A browser that is not on this chart yet (first message, or the EA changed symbol / timeframe) gets a full snapshot first. */
const broadcastLive = (key, tickPayload) => {
    const store = stores.get(key);
    clients.forEach((client) => {
        try {
            if (client.followKey !== key || !tickPayload) {
                client.followKey = key;
                send(client, 'snapshot', snapshotOf(store));
            } else send(client, 'tick', tickPayload);
        } catch (error) { clients.delete(client); }
    });
};

/* Register a browser. It receives the current chart at once, or "waiting" when MT5 has not sent anything yet. */
const addClient = (req, res) => {
    const client = { res, followKey: null };
    clients.add(client);

    if (activeKey && stores.has(activeKey)) {
        client.followKey = activeKey;
        send(client, 'snapshot', snapshotOf(stores.get(activeKey)));
    } else send(client, 'waiting', { message: 'Waiting for MT5', account });

    /* One heartbeat timer for all browsers. */
    if (!heartbeat) {
        heartbeat = setInterval(() => {
            clients.forEach((c) => { try { c.res.write(': ping\n\n'); } catch (error) { clients.delete(c); } });
        }, HEARTBEAT_MS);
        heartbeat.unref();
    }

    req.on('close', () => clients.delete(client));
};

module.exports = {
    MAX_CANDLES, MIN_CANDLES,
    upsertCandle, getStore, broadcastEvent, broadcastLive, addClient,
    setActiveKey: (key) => { activeKey = key; },
    getActiveStore: () => (activeKey && stores.has(activeKey)) ? stores.get(activeKey) : null,
    getAccount: () => account,
    setAccount: (value) => { account = value; }
};
