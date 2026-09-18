/* First-party analytics beacon.
   The pageview itself is recorded server-side; this script only adds the two
   things the server cannot see: how long the visitor actually stayed on the
   page, how far they scrolled, and which outbound links they clicked.
   No cookies, no identifiers, no third-party requests. */
(function () {
    'use strict';

    var ENDPOINT = '/api/collect';
    var HEARTBEAT_MS = 15000;

    // Honour the browser's opt-out signals client-side too.
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) {
        return;
    }

    var path = location.pathname.length > 1
        ? location.pathname.replace(/\/+$/, '')
        : location.pathname;
    if (!path) { path = '/'; }

    var visibleSince = document.hidden ? 0 : Date.now();
    var engagedMs = 0;
    var maxScroll = 0;
    var lastSent = { d: -1, s: -1 };

    function send(payload) {
        var body = JSON.stringify(payload);
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
                return;
            }
        } catch (err) { /* fall through to fetch */ }
        try {
            fetch(ENDPOINT, {
                method: 'POST',
                body: body,
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                credentials: 'same-origin'
            });
        } catch (err) { /* tracking must never break the page */ }
    }

    function currentEngagement() {
        var total = engagedMs;
        if (visibleSince) { total += Date.now() - visibleSince; }
        return Math.round(total);
    }

    function measureScroll() {
        var doc = document.documentElement;
        var height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
        if (height <= 0) { return; }
        var seen = (window.scrollY || doc.scrollTop || 0) + window.innerHeight;
        var pct = Math.round(Math.min(100, (seen / height) * 100));
        if (pct > maxScroll) { maxScroll = pct; }
    }

    function report() {
        var duration = currentEngagement();
        // Nothing new to say: skip the request.
        if (duration - lastSent.d < 1000 && maxScroll <= lastSent.s) { return; }
        lastSent.d = duration;
        lastSent.s = maxScroll;
        send({ p: path, d: duration, s: maxScroll });
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (visibleSince) {
                engagedMs += Date.now() - visibleSince;
                visibleSince = 0;
            }
            report();
        } else if (!visibleSince) {
            visibleSince = Date.now();
        }
    });

    window.addEventListener('pagehide', report);
    window.addEventListener('beforeunload', report);
    window.addEventListener('scroll', measureScroll, { passive: true });
    setInterval(function () {
        if (!document.hidden) { measureScroll(); report(); }
    }, HEARTBEAT_MS);

    var DOWNLOAD_RE = /\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|csv|mp3|mp4|avi|mkv|apk|exe|dmg|iso|txt)$/i;

    document.addEventListener('click', function (event) {
        var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!link) { return; }
        var href = link.href;
        if (!href || href.indexOf('http') !== 0) { return; }

        var isExternal = link.hostname && link.hostname !== location.hostname;
        var isDownload = link.hasAttribute('download') || DOWNLOAD_RE.test(link.pathname || '');
        if (!isExternal && !isDownload) { return; }

        send({
            p: path,
            e: isExternal ? 'outbound' : 'download',
            u: href.slice(0, 300)
        });
    }, true);

    measureScroll();
})();
