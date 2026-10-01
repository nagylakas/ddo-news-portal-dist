(() => {
    "use strict";

    const locale = () => document.documentElement.lang === "hu" ? "hu-HU" : "en-GB";

    const format = (date, style) => {
        const options = style === "date"
            ? { year: "numeric", month: "long", day: "numeric" }
            : { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
        return new Intl.DateTimeFormat(locale(), options).format(date);
    };

    const localize = (element) => {
        const raw = element.getAttribute("datetime");
        const date = new Date(raw);
        if (!raw || Number.isNaN(date.getTime())) return;

        const style = element.dataset.adminTimeStyle;
        element.textContent = format(date, style);
        element.title = style === "date"
            ? new Intl.DateTimeFormat(locale(), { dateStyle: "full" }).format(date)
            : new Intl.DateTimeFormat(locale(), { dateStyle: "full", timeStyle: "long" }).format(date);
        element.dataset.adminTimeLocalized = "true";
    };

    const run = () => document.querySelectorAll("time.js-admin-local-time[datetime]").forEach(localize);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run);
    } else {
        run();
    }
})();
