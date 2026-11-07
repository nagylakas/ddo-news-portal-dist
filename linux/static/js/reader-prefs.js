/*
 * Reader preferences: colour scheme, text size, line height, typeface, text
 * width, focus mode, list view, data saver and reduced motion.
 *
 * The values live in localStorage ("ddo.reader.v1") and are applied as
 * attributes on <html> (data-bs-theme, data-reader-*) by the inline bootstrap
 * script in templates/appearance.html before the first paint; this file
 * builds the settings panel and keeps everything in sync. For a signed-in
 * reader (<body data-reader-sync="1">) the settings also follow the account
 * across devices through /api/personal/preferences.
 */
(function () {
    'use strict';

    var KEY = 'ddo.reader.v1';
    var root = document.documentElement;
    var schemes = (root.getAttribute('data-schemes') || 'light').split(' ');
    var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    var GROUPS = [
        { key: 'scheme', label: 'Színséma', icon: 'bi-circle-half', fallback: 'auto', when: function () { return schemes.length > 1; },
          choices: [['auto', 'Automatikus', 'bi-display'], ['light', 'Világos', 'bi-sun'], ['dark', 'Sötét', 'bi-moon-stars']] },
        { key: 'size', label: 'Betűméret', icon: 'bi-fonts', fallback: 'm',
          choices: [['s', 'Kicsi'], ['m', 'Normál'], ['l', 'Nagy'], ['xl', 'Nagyon nagy']] },
        { key: 'leading', label: 'Sorköz', icon: 'bi-text-paragraph', fallback: 'normal',
          choices: [['normal', 'Normál'], ['relaxed', 'Tágas']] },
        { key: 'font', label: 'Cikkek betűtípusa', icon: 'bi-type', fallback: 'theme',
          choices: [['theme', 'A téma szerint'], ['serif', 'Talpas'], ['sans', 'Talpatlan'], ['dyslexic', 'Diszlexiabarát']] },
        { key: 'width', label: 'Szövegszélesség', icon: 'bi-arrows', fallback: 'theme',
          choices: [['theme', 'A téma szerint'], ['narrow', 'Keskeny'], ['medium', 'Közepes']] },
        { key: 'list', label: 'Listanézet', icon: 'bi-view-list', fallback: 'cards',
          choices: [['cards', 'Kártyák'], ['compact', 'Kompakt'], ['titles', 'Csak címek']] },
        { key: 'focus', label: 'Fókusz mód cikkeknél', icon: 'bi-bullseye', fallback: 'off', hint: 'Oldalsáv és hirdetések nélkül.',
          choices: [['off', 'Ki'], ['on', 'Be']] },
        { key: 'saver', label: 'Adattakarékos mód', icon: 'bi-speedometer2', fallback: 'off', hint: 'A képek csak kérésre töltődnek be.',
          choices: [['off', 'Ki'], ['on', 'Be']] },
        { key: 'motion', label: 'Animációk', icon: 'bi-magic', fallback: 'auto',
          choices: [['auto', 'Az eszköz szerint'], ['reduce', 'Csökkentve']] }
    ];

    function read() {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function write(prefs) {
        try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ }
    }
    function valid(group, value) {
        return group.choices.some(function (c) { return c[0] === value; });
    }

    var prefs = read();

    function effectiveScheme() {
        var s = prefs.scheme || 'auto';
        if (s === 'auto') { s = mql && mql.matches ? 'dark' : 'light'; }
        return schemes.indexOf(s) >= 0 ? s : schemes[0];
    }

    function apply() {
        root.setAttribute('data-bs-theme', effectiveScheme());
        GROUPS.forEach(function (g) {
            if (g.key === 'scheme') { return; }
            var v = prefs[g.key];
            if (v && v !== g.fallback && valid(g, v)) { root.setAttribute('data-reader-' + g.key, v); }
            else { root.removeAttribute('data-reader-' + g.key); }
        });
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            if (!meta.dataset.light) { meta.dataset.light = meta.getAttribute('content') || ''; }
            meta.setAttribute('content', effectiveScheme() === 'dark' ? '#0f1115' : meta.dataset.light);
        }
        prepareSaverImages();
        syncPanel();
    }

    if (mql) {
        var onChange = function () { if ((prefs.scheme || 'auto') === 'auto') { apply(); } };
        if (mql.addEventListener) { mql.addEventListener('change', onChange); } else if (mql.addListener) { mql.addListener(onChange); }
    }

    /* ---- Data saver: article images load on request ---- */
    function prepareSaverImages() {
        if (root.getAttribute('data-reader-saver') !== 'on') { return; }
        document.querySelectorAll('.article-content img:not([data-saver-ready])').forEach(function (img) {
            img.setAttribute('data-saver-ready', '1');
            if (img.complete && img.naturalWidth > 0) { return; } // already loaded: nothing to save
            var src = img.getAttribute('src');
            var srcset = img.getAttribute('srcset');
            if (!src) { return; }
            img.removeAttribute('srcset');
            img.setAttribute('data-saver-src', src);
            if (srcset) { img.setAttribute('data-saver-srcset', srcset); }
            img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
            img.classList.add('saver-hidden');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'saver-show-btn';
            btn.innerHTML = '<i class="bi bi-image" aria-hidden="true"></i> Kép megjelenítése';
            btn.addEventListener('click', function () {
                img.setAttribute('src', img.getAttribute('data-saver-src'));
                var set = img.getAttribute('data-saver-srcset');
                if (set) { img.setAttribute('srcset', set); }
                img.classList.remove('saver-hidden');
                btn.remove();
            });
            img.parentNode.insertBefore(btn, img);
        });
    }

    /* ---- Panel ---- */
    var panel, toggle, lastFocus;

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) { e.className = cls; }
        if (text) { e.textContent = text; }
        return e;
    }

    function buildPanel() {
        panel = el('div', 'reader-panel');
        panel.id = 'readerPrefsPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'readerPrefsTitle');
        panel.hidden = true;

        var head = el('div', 'reader-panel-head');
        var title = el('h2', 'reader-panel-title', 'Megjelenés és olvasás');
        title.id = 'readerPrefsTitle';
        var close = el('button', 'reader-panel-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Bezárás');
        close.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
        close.addEventListener('click', closePanel);
        head.appendChild(title);
        head.appendChild(close);
        panel.appendChild(head);

        var body = el('div', 'reader-panel-body');
        GROUPS.forEach(function (g) {
            if (g.when && !g.when()) { return; }
            var fs = el('fieldset', 'reader-group');
            var legend = el('legend', 'reader-group-label');
            legend.innerHTML = '<i class="bi ' + g.icon + '" aria-hidden="true"></i> ';
            legend.appendChild(document.createTextNode(g.label));
            fs.appendChild(legend);
            var row = el('div', 'reader-choices');
            g.choices.forEach(function (c) {
                var b = el('button', 'reader-choice');
                b.type = 'button';
                b.setAttribute('data-key', g.key);
                b.setAttribute('data-value', c[0]);
                b.setAttribute('aria-pressed', 'false');
                if (c[2]) { b.innerHTML = '<i class="bi ' + c[2] + '" aria-hidden="true"></i> '; }
                b.appendChild(document.createTextNode(c[1]));
                b.addEventListener('click', function () { set(g.key, c[0]); });
                row.appendChild(b);
            });
            fs.appendChild(row);
            if (g.hint) { fs.appendChild(el('p', 'reader-group-hint', g.hint)); }
            body.appendChild(fs);
        });
        if (window.ddoPush) { body.appendChild(window.ddoPush.section()); }
        var reset = el('button', 'reader-reset', 'Alapbeállítások visszaállítása');
        reset.type = 'button';
        reset.addEventListener('click', function () { prefs = {}; save(); apply(); });
        body.appendChild(reset);
        if (document.body.getAttribute('data-reader-sync') === '1') {
            body.appendChild(el('p', 'reader-group-hint reader-sync-note', 'A beállításaidat a fiókodhoz mentjük, így minden eszközödön érvényesek.'));
        } else {
            body.appendChild(el('p', 'reader-group-hint reader-sync-note', 'A beállítások csak ebben a böngészőben tárolódnak.'));
        }
        panel.appendChild(body);

        var backdrop = el('div', 'reader-backdrop');
        backdrop.hidden = true;
        backdrop.addEventListener('click', closePanel);
        panel._backdrop = backdrop;
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        panel.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closePanel(); return; }
            if (e.key !== 'Tab') { return; }
            var items = panel.querySelectorAll('button');
            var first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });
        syncPanel();
    }

    function syncPanel() {
        if (!panel) { return; }
        panel.querySelectorAll('.reader-choice').forEach(function (b) {
            var g = GROUPS.filter(function (x) { return x.key === b.getAttribute('data-key'); })[0];
            var current = prefs[g.key] && valid(g, prefs[g.key]) ? prefs[g.key] : g.fallback;
            var on = current === b.getAttribute('data-value');
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function openPanel() {
        if (!panel) { buildPanel(); }
        lastFocus = document.activeElement;
        panel.hidden = false;
        panel._backdrop.hidden = false;
        document.documentElement.classList.add('reader-panel-open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'true'); }
        var first = panel.querySelector('.reader-choice.is-active') || panel.querySelector('button');
        if (first) { first.focus(); }
    }

    function closePanel() {
        if (!panel || panel.hidden) { return; }
        panel.hidden = true;
        panel._backdrop.hidden = true;
        document.documentElement.classList.remove('reader-panel-open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'false'); }
        if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
    }

    function set(key, value) {
        prefs[key] = value;
        save();
        apply();
    }

    /* ---- Persistence + account sync ---- */
    var syncTimer = null;
    var syncEnabled = false;

    function save() {
        prefs.updated_at = new Date().toISOString();
        write(prefs);
        if (!syncEnabled) { return; }
        clearTimeout(syncTimer);
        syncTimer = setTimeout(function () {
            var body = {};
            GROUPS.forEach(function (g) { if (prefs[g.key]) { body[g.key] = prefs[g.key]; } });
            fetch('/api/personal/preferences', {
                method: 'PUT', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(body)
            }).catch(function () { /* offline: localStorage keeps it */ });
        }, 600);
    }

    function pullFromAccount() {
        fetch('/api/personal/preferences', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (remote) {
                if (!remote) { return; }
                syncEnabled = true;
                var remoteAt = Date.parse(remote.updated_at || '') || 0;
                var localAt = Date.parse(prefs.updated_at || '') || 0;
                if (remote.prefs && remoteAt > localAt) {
                    var next = { updated_at: remote.updated_at };
                    GROUPS.forEach(function (g) {
                        if (remote.prefs[g.key] && valid(g, remote.prefs[g.key])) { next[g.key] = remote.prefs[g.key]; }
                    });
                    prefs = next;
                    write(prefs);
                    apply();
                } else if (localAt > remoteAt && Object.keys(prefs).length > 1) {
                    save(); // the device has newer settings than the account
                }
            })
            .catch(function () { /* ignore */ });
    }

    function init() {
        toggle = document.getElementById('readerPrefsToggle');
        if (!toggle) {
            // A theme header without the toggle: offer a floating button instead.
            toggle = el('button', 'reader-toggle reader-toggle-floating');
            toggle.type = 'button';
            toggle.id = 'readerPrefsToggle';
            toggle.setAttribute('aria-label', 'Megjelenés és olvasás beállításai');
            toggle.innerHTML = '<i class="bi bi-type" aria-hidden="true"></i><i class="bi bi-circle-half reader-toggle-scheme" aria-hidden="true"></i>';
            document.body.appendChild(toggle);
        }
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', function () { if (panel && !panel.hidden) { closePanel(); } else { openPanel(); } });
        apply();
        if (document.body.getAttribute('data-reader-sync') === '1') { pullFromAccount(); }
        window.addEventListener('storage', function (e) {
            if (e.key === KEY) { prefs = read(); apply(); }
        });
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
}());
