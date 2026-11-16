(function () {

    /* Variable declarations. */
    const toasterTypes = {
        success: {
            icon: "fa-circle-check",
            title: "success",
            ms: 3500
        },
        warning: {
            icon: "fa-triangle-exclamation",
            title: "warning",
            ms: 5500
        },
        error: {
            icon: "fa-circle-xmark",
            title: "error",
            ms: 6500
        },
        info: {
            icon: "fa-circle-info",
            title: "info",
            ms: 4000
        }
    };

    const defaultMessages = {
        runBackTest: "Back test finished",
        strategyValues: "Strategy values saved",
        startTrading: "Trading started",
        stopTrading: "Trading stopped"
    };

    function getContainer() {
        var box = document.getElementById("toaster-container");
        if (!box) {
            box = document.createElement("div");
            box.id = "toaster-container";
            box.className = "toaster-container";
            document.body.appendChild(box);
        };
        return box;
    };

    function addStyles() {
        if (document.getElementById("toaster-css")) return;
        var link = document.createElement("link");
        link.id = "toaster-css";
        link.rel = "stylesheet";
        link.href = "/public/style/toaster.css";
        document.head.appendChild(link);
    };

    function show(type, message, options) {
        try {
            if (window.parent !== window && window.parent.Toaster && window.parent.Toaster.show !== show) return window.parent.Toaster.show(type, message, options);
        } catch (e) { };

        addStyles();
        var kind = toasterTypes[type] ? type : "info";
        var settings = toasterTypes[kind];

        var toast = document.createElement("div");
        toast.className = "toaster-toast toaster-toast-" + kind;
        toast.setAttribute("role", kind === "error" ? "alert" : "status");

        var icon = document.createElement("i");
        icon.className = "toaster-icon fa-solid " + settings.icon;

        var body = document.createElement("div");
        body.className = "toaster-body";
        var title = document.createElement("span");
        title.className = "toaster-title";
        title.textContent = (options && options.title) || settings.title;
        var text = document.createElement("span");
        text.className = "toaster-text";
        text.textContent = String(message || "");
        body.appendChild(title);
        body.appendChild(text);

        var close = document.createElement("button");
        close.type = "button";
        close.className = "toaster-close";
        close.setAttribute("aria-label", "Close");
        close.innerHTML = "&times;";

        toast.appendChild(icon);
        toast.appendChild(body);
        toast.appendChild(close);

        var box = getContainer();
        while (box.children.length >= 5) box.removeChild(box.firstChild);   /* Never more than 5 toasts. */
        box.appendChild(toast);

        function remove() {
            if (!toast.parentNode) return;
            toast.classList.add("toaster-toast-leave");
            setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 200);
        }
        close.addEventListener("click", remove);
        setTimeout(remove, (options && options.ms) || settings.ms);
    }

    function typeOfStatus(status) {
        if (status >= 200 && status < 300) return "success";
        if (status >= 400 && status < 500) return "warning";
        if (status >= 500 || status === 0) return "error";
        return "info";
    }

    function endpointName(url) {
        return String(url).split("?")[0].replace(/\/+$/, "").split("/").pop();
    }

    function apiFetch(url, options) {
        var settings = options || {};
        var fetchOptions = {};
        Object.keys(settings).forEach(function (key) { if (key !== "quiet" && key !== "message") fetchOptions[key] = settings[key]; });

        return fetch(url, fetchOptions).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                var status = response.status;

                if (status === 401) {
                    show("warning", (data && data.message) || "Please log in again.");
                    setTimeout(function () { (window.top || window).location.href = "/login"; }, 1200);
                } else if (response.ok) {
                    var isReadOnly = String(settings.method || "GET").toUpperCase() === "GET";   /* Loading data needs no "Done" message. */
                    if (!settings.quiet && !isReadOnly) show("success", settings.message || (data && data.message) || defaultMessages[endpointName(url)] || "Done");
                } else {
                    show(typeOfStatus(status), (data && data.message) || (response.statusText || "Request failed") + " (" + status + ")");
                }
                return { ok: response.ok, status: status, data: data || {} };
            });
        }).catch(function (error) {
            show("error", "Could not reach the server. " + (error && error.message ? error.message : ""));
            return { ok: false, status: 0, data: { message: "Could not reach the server" } };
        });
    }

    window.Toaster = {
        show: show,
        success: function (message, options) { show("success", message, options); },
        warning: function (message, options) { show("warning", message, options); },
        error: function (message, options) { show("error", message, options); },
        info: function (message, options) { show("info", message, options); }
    };
    window.apiFetch = apiFetch;
})();
