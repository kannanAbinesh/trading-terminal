(function () {

    /* Variables. */
    const countryCurrency = {
        USD: "us", EUR: "eu", GBP: "gb", JPY: "jp", AUD: "au", CAD: "ca", CHF: "ch", NZD: "nz",
        CNY: "cn", INR: "in", SEK: "se", NOK: "no", DKK: "dk", PLN: "pl", TRY: "tr", ZAR: "za",
        MXN: "mx", BRL: "br", KRW: "kr", SGD: "sg", HKD: "hk", RUB: "ru"
    };
    const flagsByCountryCode = new Map();
    const flagsByCountryName = new Map();
    let allLoadedEvents = [];
    let latestRequestNumber = 0;

    /* DOM Variables. */
    const filterWrapper = document.getElementById("newsFilterWrap");
    const filterButton = document.getElementById("newsFilterBtn");
    const filterBadge = document.getElementById("newsFilterBadge");
    const fromDateInput = document.getElementById("newsFrom");
    const toDateInput = document.getElementById("newsTo");
    const importanceSelect = document.getElementById("newsImportance");
    const currencySelect = document.getElementById("newsCurrency");
    const newsListContainer = document.getElementById("newsList");
    const periodLabel = document.getElementById("newsPeriod");
    const applyButton = document.getElementById("newsApply");
    const clearButton = document.getElementById("newsClear");

    /* Escapes text so it is safe to put inside HTML. */
    function escapeHtml(value) {
        const htmlEscapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
            return htmlEscapes[character];
        });
    };

    /* Replaces the news list with an icon + message (loading, error, empty states). */
    function showMessage(iconClass, messageText) {
        newsListContainer.innerHTML = '<div class="news-message"><i class="fa-solid ' + iconClass + '"></i><p>' + escapeHtml(messageText) + "</p></div>";
    };

    /* =====================================================================
     * Main flow: read inputs -> validate -> fetch -> filter -> render.
     * Pass { resetToCurrentWeek: true } to start from "this week, no filters".
     * ===================================================================== */
    async function loadAndRenderNews(options) {
        const resetToCurrentWeek = Boolean(options && options.resetToCurrentWeek);

        /* ----- Step 1: Work out the current week (Monday to Sunday, local time) ----- */
        const today = new Date();
        const currentWeekMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        currentWeekMonday.setDate(currentWeekMonday.getDate() - ((currentWeekMonday.getDay() + 6) % 7));
        const currentWeekSunday = new Date(currentWeekMonday);
        currentWeekSunday.setDate(currentWeekSunday.getDate() + 6);

        const currentWeekStartKey = currentWeekMonday.toLocaleDateString("en-CA");   // "YYYY-MM-DD"
        const currentWeekEndKey = currentWeekSunday.toLocaleDateString("en-CA");
        const todayKey = today.toLocaleDateString("en-CA");

        if (resetToCurrentWeek) {
            fromDateInput.value = currentWeekStartKey;
            toDateInput.value = currentWeekEndKey;
            importanceSelect.value = "all";
            currencySelect.value = "all";
        }

        /* ----- Step 2: Read and validate the selected range ----- */
        const fromDateText = fromDateInput.value;
        const toDateText = toDateInput.value || fromDateText;

        if (!fromDateText) {
            showMessage("fa-calendar-day", "Select a date to see the news.");
            return;
        };

        const rangeStartMs = new Date(fromDateText + "T00:00:00").getTime();
        const rangeEndMs = new Date(toDateText + "T23:59:59.999").getTime();

        if (rangeEndMs < rangeStartMs) {
            showMessage("fa-triangle-exclamation", "The 'To' date must be after the 'From' date.");
            return;
        };

        /* ----- Step 3: Find which weekly files are needed ----- */
        /* The EA saves one file per week, named by the Monday date in UTC. */
        const weekFileKeys = new Set();
        for (let timeMs = rangeStartMs; ; timeMs += 86400000) {
            const checkedTimeMs = Math.min(timeMs, rangeEndMs);   // Makes sure the end date's week is always included.
            const checkedDate = new Date(checkedTimeMs);
            const daysSinceMonday = (checkedDate.getUTCDay() + 6) % 7;
            const weekMondayUtc = new Date(Date.UTC(
                checkedDate.getUTCFullYear(),
                checkedDate.getUTCMonth(),
                checkedDate.getUTCDate() - daysSinceMonday
            ));
            weekFileKeys.add(weekMondayUtc.toISOString().slice(0, 10));
            if (checkedTimeMs === rangeEndMs) break;
        };

        const weekKeyList = Array.from(weekFileKeys);

        if (weekKeyList.length > 26) {
            showMessage("fa-triangle-exclamation", "Please select a range of 26 weeks or less.");
            return;
        };

        /* ----- Step 4: Fetch the weeks from the server ----- */
        const thisRequestNumber = ++latestRequestNumber;
        showMessage("fa-spinner fa-spin", "Loading news...");

        /* One call returns every week: { "2026-11-02": [events], ... } */
        const weeklyResponse = await window.apiFetch(
            "/api/v1/trading/weeklyNEWS?weeks=" + weekKeyList.join(","),
            { quiet: true }   // The success toast is shown below, with the number of events inside the period.
        );

        if (thisRequestNumber !== latestRequestNumber) return;   // A newer request replaced this one.

        if (!weeklyResponse.ok) {
            showMessage("fa-triangle-exclamation", "The news could not be loaded.");
            return;
        }

        /* ----- Step 5: Merge weeks, keep only the selected period, remove duplicates, sort by time ----- */
        const alreadyAddedEventKeys = new Set();
        allLoadedEvents = []
            .concat.apply([], weekKeyList.map(function (weekKey) { return weeklyResponse.data.weeks[weekKey] || []; }))
            .filter(function (newsEvent) {
                const eventTimeMs = Number(newsEvent.time) * 1000;
                if (!(eventTimeMs >= rangeStartMs && eventTimeMs <= rangeEndMs)) return false;

                const uniqueEventKey = newsEvent.id + "-" + newsEvent.time;
                if (alreadyAddedEventKeys.has(uniqueEventKey)) return false;

                alreadyAddedEventKeys.add(uniqueEventKey);
                return true;
            })
            .sort(function (firstEvent, secondEvent) { return firstEvent.time - secondEvent.time; });

        /* ----- Step 6: Update the period label (e.g. "This week · 2 Nov 2026 – 8 Nov 2026") ----- */
        const periodStartDate = new Date(rangeStartMs);
        const periodEndDate = new Date(rangeEndMs);
        const periodStartText = periodStartDate.getDate() + " " +
            periodStartDate.toLocaleDateString("en-GB", { month: "short" }) + " " + periodStartDate.getFullYear();
        const periodEndText = periodEndDate.getDate() + " " +
            periodEndDate.toLocaleDateString("en-GB", { month: "short" }) + " " + periodEndDate.getFullYear();

        const isCurrentWeekSelected =
            periodStartDate.toLocaleDateString("en-CA") === currentWeekStartKey &&
            periodEndDate.toLocaleDateString("en-CA") === currentWeekEndKey;
        const isSingleDaySelected =
            periodStartDate.toLocaleDateString("en-CA") === periodEndDate.toLocaleDateString("en-CA");

        periodLabel.textContent = (isCurrentWeekSelected ? "This week · " : "") +
            (isSingleDaySelected ? periodStartText : periodStartText + " – " + periodEndText);

        /* ----- Step 7: Refill the currency dropdown with the currencies found in this period ----- */
        const previouslySelectedCurrency = currencySelect.value;
        const availableCurrencies = Array.from(new Set(
            allLoadedEvents.map(function (newsEvent) { return newsEvent.currency; }).filter(Boolean)
        )).sort();

        currencySelect.innerHTML = '<option value="all">All</option>' + availableCurrencies.map(function (currencyCode) {
            return '<option value="' + escapeHtml(currencyCode) + '">' + escapeHtml(currencyCode) + "</option>";
        }).join("");
        currencySelect.value = availableCurrencies.indexOf(previouslySelectedCurrency) !== -1 ? previouslySelectedCurrency : "all";

        /* ----- Step 8: Show a small dot on the filter icon when anything other than "this week, all" is selected ----- */
        const isAnyFilterActive =
            fromDateInput.value !== currentWeekStartKey ||
            (toDateInput.value || fromDateInput.value) !== currentWeekEndKey ||
            importanceSelect.value !== "all" ||
            currencySelect.value !== "all";
        filterBadge.style.display = isAnyFilterActive ? "block" : "none";

        /* ----- Step 9: Apply the importance + currency filters ----- */
        const selectedImportance = importanceSelect.value;
        const selectedCurrency = currencySelect.value;
        const visibleEvents = allLoadedEvents.filter(function (newsEvent) {
            const matchesImportance = selectedImportance === "all" || newsEvent.importance === selectedImportance;
            const matchesCurrency = selectedCurrency === "all" || newsEvent.currency === selectedCurrency;
            return matchesImportance && matchesCurrency;
        });

        /* ----- Step 10: Show toast with the result count ----- */
        if (allLoadedEvents.length) window.Toaster.success(allLoadedEvents.length + " news events loaded");
        else window.Toaster.info("No news saved for this period yet");

        if (!visibleEvents.length) {
            showMessage(
                "fa-calendar-xmark",
                allLoadedEvents.length ? "No events match these filters." : "No news found for this period."
            );
            return;
        };

        /* ----- Step 11: Build the list, grouped by day ----- */
        let newsListHtml = "";
        let previousDayKey = "";

        visibleEvents.forEach(function (newsEvent) {
            const eventDate = new Date(Number(newsEvent.time) * 1000);
            const eventDayKey = eventDate.toLocaleDateString("en-CA");

            /* New day -> close the previous day block and open a new one with its heading. */
            if (eventDayKey !== previousDayKey) {
                if (previousDayKey) newsListHtml += "</div>";

                const dayHeading = eventDate.toLocaleDateString("en-GB", { weekday: "long" }) + ", " +
                    eventDate.getDate() + " " + eventDate.toLocaleDateString("en-GB", { month: "long" }) + " " +
                    eventDate.getFullYear();

                newsListHtml += '<div class="news-day"><div class="news-day-title">' + escapeHtml(dayHeading) +
                    (eventDayKey === todayKey ? ' <span class="news-today">Today</span>' : "") + "</div>" +
                    '<div class="news-row news-row-head"><span>Time</span><span>Event</span><span>Impact</span></div>';
                previousDayKey = eventDayKey;
            }

            /* Country flag: match by currency code first, then by country name. */
            const flagEntry =
                flagsByCountryCode.get(countryCurrency[newsEvent.currency]) ||
                flagsByCountryName.get(String(newsEvent.country || "").toLowerCase());
            const flagImageUrl = flagEntry ? flagEntry.flag : "";

            const eventTimeText = String(eventDate.getHours()).padStart(2, "0") + ":" +
                String(eventDate.getMinutes()).padStart(2, "0");

            /* Importance indicator: 3 dots, filled according to high / medium / low. */
            const filledDotCount = { high: 3, medium: 2, low: 1 }[newsEvent.importance] || 0;
            let importanceDotsHtml = "";
            for (let dotNumber = 1; dotNumber <= 3; dotNumber++) {
                importanceDotsHtml += '<span class="news-dot' + (dotNumber <= filledDotCount ? " news-dot-on" : "") + '"></span>';
            }

            newsListHtml += '<div class="news-row">' +
                '<span class="news-time">' + escapeHtml(eventTimeText) + "</span>" +
                '<span class="news-event">' +
                (flagImageUrl
                    ? '<img class="news-flag" src="' + escapeHtml(flagImageUrl) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
                    : "") +
                '<span class="news-currency">' + escapeHtml(newsEvent.currency) + "</span>" +
                '<span class="news-name" title="' + escapeHtml(newsEvent.country) + '">' + escapeHtml(newsEvent.event) + "</span>" +
                "</span>" +
                '<span class="news-impact">' +
                '<span class="news-importance news-importance-' + escapeHtml(newsEvent.importance) + '" title="' + escapeHtml(newsEvent.importance) + '">' +
                importanceDotsHtml + "</span>" +
                "</span>" +
                "</div>";
        });

        newsListContainer.innerHTML = newsListHtml + "</div>";
    }

    /* Open / close the filter box. */
    filterButton.addEventListener("click", function (event) {
        event.stopPropagation();
        const isOpen = filterWrapper.classList.toggle("news-open");
        filterButton.setAttribute("aria-expanded", String(isOpen));
    });

    /* Clicking outside the filter box or pressing Esc closes it. */
    document.addEventListener("click", function (event) {
        if (filterWrapper.contains(event.target)) return;
        filterWrapper.classList.remove("news-open");
        filterButton.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        filterWrapper.classList.remove("news-open");
        filterButton.setAttribute("aria-expanded", "false");
    });

    /* Apply: close the box and reload with the selected values. */
    applyButton.addEventListener("click", function () {
        filterWrapper.classList.remove("news-open");
        filterButton.setAttribute("aria-expanded", "false");
        loadAndRenderNews();
    });

    /* Clear: close the box and go back to the current week with no filters. */
    clearButton.addEventListener("click", function () {
        filterWrapper.classList.remove("news-open");
        filterButton.setAttribute("aria-expanded", "false");
        loadAndRenderNews({ resetToCurrentWeek: true });
    });

    /* Load the flags first, then show the current week. */
    (async function startPage() {
        try {
            const flagsResponse = await window.apiFetch("/public/data/countriesDetails.json", { quiet: true });
            if (!flagsResponse.ok) throw new Error("HTTP " + flagsResponse.status);

            flagsResponse.data.forEach(function (countryItem) {
                if (countryItem.code && !flagsByCountryCode.has(countryItem.code)) flagsByCountryCode.set(countryItem.code, countryItem);
                if (countryItem.country) flagsByCountryName.set(countryItem.country.toLowerCase(), countryItem);
            });
        } catch (error) { };

        loadAndRenderNews({ resetToCurrentWeek: true });
    })();

})();