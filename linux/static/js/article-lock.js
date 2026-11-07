/*
 * Keeps the edit lock of the article editor. While another editor holds the
 * lock, saving is disabled here and refused on the server too. Taking over is
 * an explicit choice, and the other editor's page finds out at its next beat.
 */
(function () {
    'use strict';

    var form = document.getElementById('article-edit-form');
    if (!form || !window.fetch) { return; }

    var HEARTBEAT_MS = 30000;
    var baseURL = form.getAttribute('data-lock-url');
    var version = form.getAttribute('data-version') || '';
    var alertBox = document.getElementById('article-lock-alert');
    var alertText = document.getElementById('article-lock-text');
    var takeover = document.getElementById('article-lock-takeover');
    var changedBox = document.getElementById('article-changed-alert');
    var saveButtons = form.querySelectorAll('button[type="submit"]');
    var submitting = false;
    var timer = null;

    function setSaving(enabled) {
        Array.prototype.forEach.call(saveButtons, function (button) { button.disabled = !enabled; });
    }

    function showHolder(name) {
        alertText.textContent = form.getAttribute('data-lock-message').replace('%s', name);
        alertBox.classList.remove('d-none');
        setSaving(false);
    }

    function showHeld() {
        alertBox.classList.add('d-none');
        setSaving(true);
    }

    function showWarning(message) {
        alertText.textContent = message;
        alertBox.classList.remove('d-none');
        takeover.classList.add('d-none');
    }

    function send(operation) {
        return fetch(baseURL + '/' + operation, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: 'version=' + encodeURIComponent(version)
        }).then(function (response) {
            var type = response.headers.get('Content-Type') || '';
            // An expired session redirects to the login page, which is HTML.
            if (!response.ok || type.indexOf('application/json') === -1) { throw new Error('unexpected response'); }
            return response.json();
        });
    }

    function apply(state) {
        takeover.classList.remove('d-none');
        if (state.held) { showHeld(); } else { showHolder(state.holder_name); }
        if (changedBox) { changedBox.classList.toggle('d-none', !state.changed); }
    }

    function beat() {
        send('heartbeat').then(apply).catch(function () {
            // Keep the buttons usable: the server has the final word on saving,
            // and a refused save keeps the text. Only say what is not known.
            showWarning(form.getAttribute('data-lock-offline'));
        });
    }

    takeover.addEventListener('click', function () {
        if (!window.confirm(form.getAttribute('data-lock-confirm'))) { return; }
        takeover.disabled = true;
        send('takeover').then(apply).catch(function () {
            showWarning(form.getAttribute('data-lock-offline'));
        }).then(function () { takeover.disabled = false; });
    });

    form.addEventListener('submit', function () { submitting = true; });

    window.addEventListener('pagehide', function () {
        if (submitting || !navigator.sendBeacon) { return; }
        navigator.sendBeacon(baseURL + '/release');
    });

    // A page restored from the back/forward cache released its lock on the way out.
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) { beat(); }
    });

    beat();
    timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { beat(); }
    });
    window.addEventListener('beforeunload', function () { if (timer) { window.clearInterval(timer); } });
}());
