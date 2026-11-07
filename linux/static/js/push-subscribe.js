/*
 * Web push opt-in. Adds a section to the reader settings panel. Nothing is asked
 * of the browser until the reader presses the button, and the permission prompt
 * only ever follows that click.
 */
(function () {
    'use strict';

    var publicKey = window.ddoPushKey;
    if (!publicKey) { return; }

    var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    var isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function keyBytes(base64) {
        var normal = (base64 + '==='.slice((base64.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/');
        var raw = window.atob(normal);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) { bytes[i] = raw.charCodeAt(i); }
        return bytes;
    }

    function post(path, body) {
        return fetch(path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (response) {
            if (!response.ok) { throw new Error('HTTP ' + response.status); }
        });
    }

    // serviceWorker.ready never settles when the worker cannot be registered, and
    // the button must not stay disabled without a word in that case.
    function workerReady() {
        return Promise.race([
            navigator.serviceWorker.ready,
            new Promise(function (resolve, reject) {
                window.setTimeout(function () { reject(new Error('no service worker')); }, 8000);
            })
        ]);
    }

    function currentSubscription() {
        return workerReady().then(function (registration) {
            return registration.pushManager.getSubscription();
        });
    }

    function subscribe() {
        return Notification.requestPermission().then(function (permission) {
            if (permission !== 'granted') { throw new Error('denied'); }
            return workerReady();
        }).then(function (registration) {
            return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        }).then(function (subscription) {
            var json = subscription.toJSON();
            return post('/api/push/subscribe', { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
        });
    }

    function unsubscribe(subscription) {
        var endpoint = subscription.endpoint;
        return subscription.unsubscribe().then(function () {
            return post('/api/push/unsubscribe', { endpoint: endpoint });
        });
    }

    function section() {
        var box = document.createElement('fieldset');
        box.className = 'reader-group';
        var legend = document.createElement('legend');
        legend.className = 'reader-group-label';
        legend.innerHTML = '<i class="bi bi-bell" aria-hidden="true"></i> ';
        legend.appendChild(document.createTextNode('Értesítések a friss hírekről'));
        box.appendChild(legend);

        var hint = document.createElement('p');
        hint.className = 'reader-group-hint';
        hint.setAttribute('aria-live', 'polite');

        if (!supported) {
            hint.textContent = isApple
                ? 'iPhone-on és iPaden előbb add hozzá az oldalt a kezdőképernyőhöz, majd onnan megnyitva kapcsold be.'
                : 'Ez a böngésző nem támogatja az értesítéseket.';
            box.appendChild(hint);
            return box;
        }

        var button = document.createElement('button');
        button.type = 'button';
        // Not .reader-choice: the panel treats those as its own preference buttons.
        button.className = 'btn btn-sm btn-outline-secondary';
        box.appendChild(button);
        box.appendChild(hint);

        function show(subscription) {
            button.disabled = false;
            button.textContent = subscription ? 'Kikapcsolás' : 'Bekapcsolás';
            button.setAttribute('aria-pressed', subscription ? 'true' : 'false');
            if (Notification.permission === 'denied') {
                button.disabled = true;
                hint.textContent = 'A böngészőben le vannak tiltva az értesítések ennél az oldalnál. A böngésző beállításaiban oldható fel.';
            } else {
                hint.textContent = subscription
                    ? 'Bekapcsolva ezen az eszközön. A szerkesztőség a fontos híreknél küld értesítést.'
                    : 'Bármikor kikapcsolható. A feliratkozáshoz nem kell fiók.';
            }
        }

        function failed(error) {
            hint.textContent = error && error.message === 'denied'
                ? 'Az értesítések nem kaptak engedélyt ebben a böngészőben.'
                : 'Ez most nem sikerült. Kérlek, próbáld újra később.';
            button.disabled = Notification.permission === 'denied';
        }

        button.addEventListener('click', function () {
            button.disabled = true;
            currentSubscription().then(function (subscription) {
                return subscription ? unsubscribe(subscription) : subscribe();
            }).then(currentSubscription).then(show).catch(failed);
        });

        button.disabled = true;
        button.textContent = 'Bekapcsolás';
        currentSubscription().then(show).catch(failed);
        return box;
    }

    window.ddoPush = { section: section };
}());
