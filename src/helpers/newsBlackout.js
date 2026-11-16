/* News rule : no trading around a scheduled news event.

   From `newsMinutesBefore` minutes before the event until `newsMinutesAfter` minutes after it (config.js, 15 + 15 = a 30 minute window)
     - the signal API answers FLAT, so the EA closes every open trade (profit or loss, it does not matter) and opens nothing,
     - the EA also asks /newsStatus every few seconds, so a trade is closed when the window starts, not on the next candle.
   If another event starts before the window ends, the window is extended until 15 minutes after the last one.

   The events are the ones the EA saved from the MT5 calendar in uploads/weeklyNEWS (one file per week, named by its Monday date).
   Which events are saved is chosen with the news inputs of the EA. Which of them stop the bot is chosen in config.js (newsCurrencies, now USD only). */
const fs = require('fs').promises;
const path = require('path');

const { WEEKLY_NEWS } = require('./paths');
const { newsMinutesBefore, newsMinutesAfter, newsCurrencies } = require('../../config');

const SECONDS_IN_A_DAY = 86400;
const BEFORE_SECONDS = newsMinutesBefore * 60;
const AFTER_SECONDS = newsMinutesAfter * 60;

const cachedFiles = new Map();   /* File path -> { modifiedAt, events } : a file is read again only when it changed. */

/* "2026-11-09" : the Monday (UTC) of the week that holds this time. */
const mondayOf = (seconds) => {
    const day = new Date(seconds * 1000);
    const daysSinceMonday = (day.getUTCDay() + 6) % 7;
    return new Date((seconds - daysSinceMonday * SECONDS_IN_A_DAY) * 1000).toISOString().slice(0, 10);
};

const readWeekFile = async (mondayDate) => {
    const filePath = path.join(WEEKLY_NEWS, `${mondayDate}.json`);

    try {
        const { mtimeMs } = await fs.stat(filePath);
        const cached = cachedFiles.get(filePath);
        if (cached && cached.modifiedAt === mtimeMs) return cached.events;

        const week = JSON.parse(await fs.readFile(filePath, 'utf8'));
        const events = Array.isArray(week.events) ? week.events : [];
        cachedFiles.set(filePath, { modifiedAt: mtimeMs, events });
        return events;
    } catch (error) {
        return [];   /* No file for this week yet. */
    };
};

/* The events of last week, this week and next week (an event close to a week change can belong to the other file). */
const readNearbyEvents = async (nowSeconds) => {
    const mondays = [
        mondayOf(nowSeconds - 7 * SECONDS_IN_A_DAY),
        mondayOf(nowSeconds),
        mondayOf(nowSeconds + 7 * SECONDS_IN_A_DAY)
    ];

    const lists = await Promise.all(mondays.map(readWeekFile));
    return lists.flat().filter((event) => Number.isFinite(Number(event.time)) && event.importance !== 'none' && newsCurrencies.includes(event.currency));   /* Only the chosen currencies (US = USD). Importance "none" = bank holidays, not news releases. */
};

const describeEvent = (event) => ({
    time: Number(event.time),
    iso: new Date(Number(event.time) * 1000).toISOString(),
    currency: event.currency || '',
    importance: event.importance || '',
    name: event.event || ''
});

/* The news state at `nowSeconds` (UTC seconds).
   Returns { blackout, event, startsAt, endsAt, nextEvent, minutesBefore, minutesAfter }.
   `startsAt` / `endsAt` are UTC seconds of the window, `event` is the event that started it. */
const getNewsStatus = async (nowSeconds = Math.floor(Date.now() / 1000)) => {
    const events = (await readNearbyEvents(nowSeconds)).sort((first, second) => Number(first.time) - Number(second.time));

    const status = { blackout: false, event: null, startsAt: null, endsAt: null, nextEvent: null, minutesBefore: newsMinutesBefore, minutesAfter: newsMinutesAfter, currencies: newsCurrencies };

    /* The window of an event is [time - before, time + after]. Find the events whose window holds "now". */
    const activeEvents = events.filter((event) => nowSeconds >= Number(event.time) - BEFORE_SECONDS && nowSeconds <= Number(event.time) + AFTER_SECONDS);

    if (activeEvents.length) {
        const firstEvent = activeEvents[0];
        let windowEnd = Number(activeEvents[activeEvents.length - 1].time) + AFTER_SECONDS;

        /* Another event starts before the window ends : the window continues until 15 minutes after that one. */
        let extended = true;
        while (extended) {
            extended = false;
            events.forEach((event) => {
                const startsInsideWindow = Number(event.time) - BEFORE_SECONDS <= windowEnd;
                const endsAfterWindow = Number(event.time) + AFTER_SECONDS > windowEnd;
                if (startsInsideWindow && endsAfterWindow) {
                    windowEnd = Number(event.time) + AFTER_SECONDS;
                    extended = true;
                };
            });
        };

        status.blackout = true;
        status.event = describeEvent(firstEvent);
        status.startsAt = Number(firstEvent.time) - BEFORE_SECONDS;
        status.endsAt = windowEnd;
    };

    const nextEvent = events.find((event) => Number(event.time) - BEFORE_SECONDS > nowSeconds);
    if (nextEvent) status.nextEvent = { ...describeEvent(nextEvent), blackoutStartsAt: Number(nextEvent.time) - BEFORE_SECONDS };

    return status;
};

module.exports = { getNewsStatus };