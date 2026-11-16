/* Plugins. */
const fs = require('fs');
const path = require('path');
const { BOT_CONTROL_FILE } = require('./paths');

const state = {
    tradingEnabled: true,
    closeRequestId: 0,         
    closedDirection: 0,        
    changedAt: new Date().toISOString()
};

/* Reads the saved controls once, when the server starts. */
try { Object.assign(state, JSON.parse(fs.readFileSync(BOT_CONTROL_FILE, 'utf8'))); } catch (error) { };

const save = () => {
    state.changedAt = new Date().toISOString();
    try {
        fs.mkdirSync(path.dirname(BOT_CONTROL_FILE), { recursive: true });
        fs.writeFileSync(BOT_CONTROL_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) { console.error(`[BOT CONTROL] ${error.message}`); };
};

const setTradingEnabled = (enabled) => {
    state.tradingEnabled = Boolean(enabled);
    save();
};

/* "Close trade" was pressed : remember the direction so the same trend is not entered again. */
const requestClose = (direction) => {
    state.closeRequestId = Date.now();
    state.closedDirection = direction;
    save();
};

const clearClosedDirection = () => {
    if (state.closedDirection === 0) return;
    state.closedDirection = 0;
    save();
};

module.exports = { botControl: state, setTradingEnabled, requestClose, clearClosedDirection };
