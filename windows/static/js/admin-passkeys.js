/*
 * Admin passkeys (WebAuthn): registration on "My account → Security",
 * passwordless sign-in, the second-factor step after a correct password, and
 * the same two sign-in modes on the MCP OAuth /authorize form.
 *
 * No third-party library: the native navigator.credentials API is used, with
 * PublicKeyCredential.parse*OptionsFromJSON / toJSON when the browser has
 * them and a small base64url fallback otherwise.
 *
 * The script is ES5 so it still parses in Microsoft Edge's IE mode (Trident),
 * where WebAuthn does not exist: there it must explain why passkeys are not
 * available instead of leaving a silently greyed-out ("read-only") form.
 * Every state that disables a control shows a concrete reason.
 *
 * Markup contract (data attributes):
 *   [data-passkey-login]      button: passwordless sign-in
 *                             (data-begin, data-finish, optional data-flow-token)
 *   [data-passkey-autofill]   on the login form: also offer passkeys in the
 *                             browser's autofill (conditional mediation)
 *   [data-passkey-2fa]        container of the second-factor step; starts
 *                             automatically (data-begin, data-finish,
 *                             optional data-flow-token)
 *   #passkey-register-form    add-passkey form (label, password); its submit
 *                             button is disabled in the HTML and enabled here
 *   [data-passkey-delete]     delete forms: submit disabled while posting
 *   [data-passkey-env-warning] element for environment problems (IE mode,
 *                             non-secure or non-canonical address)
 *   [data-passkey-status]     element receiving progress / error messages
 * Texts come from window.passkeyI18n, the canonical site address from
 * window.passkeyConfig.expectedOrigin.
 */
(function () {
    'use strict';

    var i18n = window.passkeyI18n || {};
    var config = window.passkeyConfig || {};
    function t(key, fallback) { return i18n[key] || fallback || key; }
    function fill(text, origin) { return String(text).replace('{origin}', origin || ''); }

    // Extra time on top of the ceremony timeout the server asked for, after
    // which a prompt that never answered (e.g. a Windows Security dialog left
    // behind another window) is abandoned so the controls come back.
    var CLIENT_TIMEOUT_GRACE_MS = 5000;
    var DEFAULT_TIMEOUT_MS = 300000;

    function supported() {
        return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create &&
            window.fetch && window.Promise);
    }

    // originOf normalises a URL to scheme://host[:port] without default ports
    // (works without the URL constructor, i.e. in IE mode too).
    function originOf(href) {
        if (!href) { return ''; }
        var a = document.createElement('a');
        a.href = href;
        var protocol = (a.protocol || '').toLowerCase();
        var host = (a.host || '').toLowerCase();
        if ((protocol === 'https:' && /:443$/.test(host)) || (protocol === 'http:' && /:80$/.test(host))) {
            host = host.replace(/:\d+$/, '');
        }
        return protocol + '//' + host;
    }
    var expectedOrigin = originOf(config.expectedOrigin);
    var currentOrigin = originOf(window.location.href);

    // unsupportedReason explains why WebAuthn is missing in this browser tab.
    function unsupportedReason() {
        if (document.documentMode) {
            return t('unsupportedIEMode', 'Microsoft Edge opened this page in Internet Explorer mode, which has no passkey support. Open it in normal Edge (and ask your IT team to remove the address from the IE mode site list).');
        }
        if (window.isSecureContext === false) {
            return fill(t('unsupportedInsecure', 'Passkeys only work over a secure (HTTPS) connection. Open the admin at {origin}.'), expectedOrigin || 'https://…');
        }
        return t('unsupported', 'This browser does not support passkeys.');
    }

    // environmentWarning returns a problem that will make ceremonies fail even
    // though the browser supports WebAuthn: the page is not on the address
    // the passkeys are bound to.
    function environmentWarning() {
        if (!supported()) { return unsupportedReason(); }
        if (expectedOrigin && currentOrigin && expectedOrigin !== currentOrigin) {
            return fill(t('wrongOrigin', 'This page is open at a different address than the site address passkeys are bound to. Open the admin at {origin}.'), expectedOrigin);
        }
        return '';
    }

    // ── base64url helpers ──
    function b64urlToBuf(s) {
        s = String(s).replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) { s += '='; }
        var bin = atob(s), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
        return out.buffer;
    }
    function bufToB64url(buf) {
        if (!buf) { return undefined; }
        var bytes = new Uint8Array(buf), bin = '';
        for (var i = 0; i < bytes.length; i++) { bin += String.fromCharCode(bytes[i]); }
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function mapDescriptors(list) {
        return (list || []).map(function (d) {
            var o = { type: d.type, id: b64urlToBuf(d.id) };
            if (d.transports) { o.transports = d.transports; }
            return o;
        });
    }

    function creationOptions(json) {
        if (window.PublicKeyCredential.parseCreationOptionsFromJSON) {
            return window.PublicKeyCredential.parseCreationOptionsFromJSON(json);
        }
        var o = Object.assign({}, json);
        o.challenge = b64urlToBuf(json.challenge);
        o.user = Object.assign({}, json.user, { id: b64urlToBuf(json.user.id) });
        o.excludeCredentials = mapDescriptors(json.excludeCredentials);
        return o;
    }
    function requestOptions(json) {
        if (window.PublicKeyCredential.parseRequestOptionsFromJSON) {
            return window.PublicKeyCredential.parseRequestOptionsFromJSON(json);
        }
        var o = Object.assign({}, json);
        o.challenge = b64urlToBuf(json.challenge);
        o.allowCredentials = mapDescriptors(json.allowCredentials);
        return o;
    }
    function credentialJSON(cred) {
        if (typeof cred.toJSON === 'function') {
            try { return cred.toJSON(); } catch (e) { /* fall through */ }
        }
        var r = cred.response, resp = { clientDataJSON: bufToB64url(r.clientDataJSON) };
        if (r.attestationObject) {
            resp.attestationObject = bufToB64url(r.attestationObject);
            if (typeof r.getTransports === 'function') { resp.transports = r.getTransports(); }
        } else {
            resp.authenticatorData = bufToB64url(r.authenticatorData);
            resp.signature = bufToB64url(r.signature);
            if (r.userHandle && r.userHandle.byteLength) { resp.userHandle = bufToB64url(r.userHandle); }
        }
        return {
            id: cred.id,
            rawId: bufToB64url(cred.rawId),
            type: cred.type,
            authenticatorAttachment: cred.authenticatorAttachment || undefined,
            clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
            response: resp
        };
    }

    function post(url, body) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body || {})
        }).then(function (res) {
            // An expired admin session is redirected to the HTML login page.
            if (res.redirected) {
                var expired = new Error(t('sessionExpired', 'Your session has expired. Reload the page and sign in again.'));
                expired.code = 'session_expired';
                throw expired;
            }
            var type = res.headers.get('Content-Type') || '';
            if (type.indexOf('application/json') === -1) {
                var plain = new Error(t('failed', 'Passkey error') + ' (HTTP ' + res.status + ')');
                plain.code = 'http_' + res.status;
                throw plain;
            }
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    var err = new Error((data.error && data.error.message) || t('failed', 'Passkey error'));
                    err.code = data.error && data.error.code;
                    throw err;
                }
                return data;
            });
        });
    }

    function status(el, msg, kind) {
        if (!el) { return; }
        el.textContent = msg || '';
        el.className = 'small mt-2 ' + (kind === 'error' ? 'text-danger' : kind === 'ok' ? 'text-success' : 'text-muted');
        el.hidden = !msg;
    }

    // tlsError: Chromium refuses WebAuthn on a page whose certificate error
    // was clicked through, reporting a NotAllowedError that mentions TLS.
    function tlsError(err) {
        return !!(err && err.name === 'NotAllowedError' && /certificate|TLS/i.test(err.message || ''));
    }
    // cancelled: the user closed the dialog, it timed out, or no usable
    // passkey was offered — not worth a red error.
    function cancelled(err) {
        return !!err && !tlsError(err) && (err.name === 'NotAllowedError' || err.name === 'AbortError');
    }
    function browserError(err) {
        if (!err) { return t('failed', 'Passkey error'); }
        if (err.code === 'client_timeout') { return t('timeout', 'No answer from the passkey dialog. If you do not see it, check the taskbar or your other screen (Windows Security), then try again.'); }
        if (tlsError(err)) { return t('tlsError', 'The browser blocks passkeys because the site certificate is not trusted.'); }
        if (err.name === 'InvalidStateError') { return t('alreadyRegistered', 'This passkey is already registered.'); }
        if (err.name === 'SecurityError') { return environmentWarning() || t('securityError', 'Passkeys need HTTPS and the site address the passkey was created for.'); }
        if (err.name === 'NotSupportedError' || err.name === 'ConstraintError') { return t('notSupported', 'This device or security key cannot create a suitable passkey. Try another authenticator (e.g. a phone or a security key).'); }
        if (cancelled(err)) { return t('cancelled', 'Cancelled, or no usable passkey on this device. Try again, or use a security key or your phone.'); }
        return err.message || t('failed', 'Passkey error');
    }

    // withTimeout runs a navigator.credentials call with an AbortController,
    // so a dialog that never answers releases the controls.
    // The timer rejects on its own (Promise.race), so the controls come back
    // even if the platform dialog ignores the abort signal.
    function withTimeout(publicKeyTimeout, run) {
        var ms = (publicKeyTimeout || DEFAULT_TIMEOUT_MS) + CLIENT_TIMEOUT_GRACE_MS;
        var ctrl = typeof AbortController === 'undefined' ? null : new AbortController();
        var timer;
        var timeout = new Promise(function (resolve, reject) {
            timer = setTimeout(function () {
                if (ctrl) { ctrl.abort(); }
                var e = new Error('timeout');
                e.name = 'AbortError';
                e.code = 'client_timeout';
                reject(e);
            }, ms);
        });
        return Promise.race([run(ctrl ? ctrl.signal : undefined), timeout]).then(function (v) {
            clearTimeout(timer);
            return v;
        }, function (err) {
            clearTimeout(timer);
            throw err;
        });
    }

    function go(data) { window.location.assign(data.redirect || '/admin'); }

    // ── Sign-in (passwordless + conditional autofill) ──
    var conditionalAbort = null;

    function assert(beginURL, finishURL, extra, opts) {
        opts = opts || {};
        var begin = Object.assign({}, extra, { conditional: !!opts.conditional });
        return post(beginURL, begin).then(function (data) {
            var pk = data.options.publicKey;
            var run = function (signal) {
                var getOpts = { publicKey: requestOptions(pk) };
                if (opts.conditional) { getOpts.mediation = 'conditional'; }
                if (signal) { getOpts.signal = signal; }
                return navigator.credentials.get(getOpts);
            };
            // The autofill request waits for the user indefinitely by design.
            var call = opts.conditional ? run(opts.signal) : withTimeout(pk.timeout, run);
            return call.then(function (cred) {
                return post(finishURL, Object.assign({}, extra, { ceremony: data.ceremony, credential: credentialJSON(cred) }));
            });
        });
    }

    function initLoginButton(btn) {
        var statusEl = document.querySelector('[data-passkey-status]');
        if (!supported()) {
            btn.disabled = true;
            btn.title = unsupportedReason();
            status(statusEl, unsupportedReason(), 'error');
            return;
        }
        var warning = environmentWarning();
        if (warning) { status(statusEl, warning, 'error'); }
        var extra = {};
        if (btn.dataset.flowToken) { extra.flow_token = btn.dataset.flowToken; extra.mode = 'passwordless'; }
        btn.addEventListener('click', function () {
            if (conditionalAbort) { conditionalAbort.abort(); conditionalAbort = null; }
            btn.disabled = true;
            status(statusEl, t('waiting', 'Follow the instructions of your browser or security key…'));
            assert(btn.dataset.begin, btn.dataset.finish, extra).then(go).catch(function (err) {
                btn.disabled = false;
                status(statusEl, browserError(err), cancelled(err) ? 'muted' : 'error');
            });
        });
    }

    function initAutofill(form) {
        if (!supported() || !window.PublicKeyCredential.isConditionalMediationAvailable) { return; }
        var btn = document.querySelector('[data-passkey-login]');
        if (!btn) { return; }
        window.PublicKeyCredential.isConditionalMediationAvailable().then(function (ok) {
            if (!ok) { return; }
            conditionalAbort = new AbortController();
            var extra = {};
            if (btn.dataset.flowToken) { extra.flow_token = btn.dataset.flowToken; extra.mode = 'passwordless'; }
            assert(btn.dataset.begin, btn.dataset.finish, extra, { conditional: true, signal: conditionalAbort.signal })
                .then(go)
                .catch(function (err) {
                    if (!cancelled(err)) { status(document.querySelector('[data-passkey-status]'), browserError(err), 'error'); }
                });
        }).catch(function () {});
    }

    // ── Second factor after the password ──
    function initSecondFactor(box) {
        var statusEl = box.querySelector('[data-passkey-status]');
        var retry = box.querySelector('[data-passkey-retry]');
        var restart = box.querySelector('[data-passkey-restart]');
        function giveUp(msg) {
            status(statusEl, msg, 'error');
            if (retry) { retry.hidden = true; }
            if (restart) { restart.hidden = false; }
        }
        if (!supported()) { giveUp(unsupportedReason()); return; }
        var extra = {};
        if (box.dataset.flowToken) { extra.flow_token = box.dataset.flowToken; extra.mode = '2fa'; }
        function run() {
            if (retry) { retry.disabled = true; }
            status(statusEl, t('waiting', 'Follow the instructions of your browser or security key…'));
            post(box.dataset.begin, extra).then(function (data) {
                var pk = data.options.publicKey;
                return withTimeout(pk.timeout, function (signal) {
                    var getOpts = { publicKey: requestOptions(pk) };
                    if (signal) { getOpts.signal = signal; }
                    return navigator.credentials.get(getOpts);
                }).then(function (cred) {
                    return post(box.dataset.finish, Object.assign({}, extra, { ceremony: data.ceremony, credential: credentialJSON(cred) }));
                });
            }).then(function (data) {
                status(statusEl, t('success', 'Signed in.'), 'ok');
                go(data);
            }).catch(function (err) {
                if (retry) { retry.disabled = false; }
                if (err.code === 'login_expired' || err.code === 'flow_expired' || err.code === 'session_expired') {
                    giveUp(err.message);
                    return;
                }
                status(statusEl, browserError(err), 'error');
            });
        }
        if (retry) { retry.addEventListener('click', run); }
        var warning = environmentWarning();
        if (warning) { status(statusEl, warning, 'error'); return; }
        run();
    }

    // ── Registration ──
    function initRegister(form) {
        var statusEl = form.querySelector('[data-passkey-status]');
        var submit = form.querySelector('button[type=submit]');
        if (!supported()) {
            if (submit) { submit.disabled = true; }
            // The page-level warning box already explains it; do not repeat.
            if (!document.querySelector('[data-passkey-env-warning]')) { status(statusEl, unsupportedReason(), 'error'); }
            return;
        }
        if (submit) { submit.disabled = false; }
        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var label = form.querySelector('[name=label]').value;
            var password = form.querySelector('[name=password]').value;
            if (submit) { submit.disabled = true; }
            status(statusEl, t('waiting', 'Follow the instructions of your browser or security key…'));
            post(form.dataset.begin, { label: label, password: password }).then(function (data) {
                var pk = data.options.publicKey;
                return withTimeout(pk.timeout, function (signal) {
                    var createOpts = { publicKey: creationOptions(pk) };
                    if (signal) { createOpts.signal = signal; }
                    return navigator.credentials.create(createOpts);
                }).then(function (cred) {
                    return post(form.dataset.finish, { ceremony: data.ceremony, credential: credentialJSON(cred) });
                });
            }).then(function (data) {
                status(statusEl, t('added', 'Passkey added.'), 'ok');
                go(data);
            }).catch(function (err) {
                if (submit) { submit.disabled = false; }
                status(statusEl, browserError(err), cancelled(err) ? 'muted' : 'error');
            });
        });
    }

    // Delete forms are plain POST forms (no WebAuthn); only guard against a
    // double submit, which would trip the password re-check rate limit.
    function initDeleteForm(form) {
        form.addEventListener('submit', function () {
            var btn = form.querySelector('button[type=submit]');
            if (btn) { setTimeout(function () { btn.disabled = true; }, 0); }
        });
    }

    function init() {
        var envBox = document.querySelector('[data-passkey-env-warning]');
        if (envBox) {
            var warning = environmentWarning();
            if (warning) {
                envBox.textContent = warning;
                envBox.className = envBox.className.replace(/\bd-none\b/, '');
            }
        }
        var btn = document.querySelector('[data-passkey-login]');
        if (btn) { initLoginButton(btn); }
        var form = document.querySelector('[data-passkey-autofill]');
        if (form) { initAutofill(form); }
        var box = document.querySelector('[data-passkey-2fa]');
        if (box) { initSecondFactor(box); }
        var reg = document.getElementById('passkey-register-form');
        if (reg) { initRegister(reg); }
        var dels = document.querySelectorAll('[data-passkey-delete]');
        for (var i = 0; i < dels.length; i++) { initDeleteForm(dels[i]); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
