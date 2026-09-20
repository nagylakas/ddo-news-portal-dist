// Admin audit log browser — dependency-free. Talks to /admin/audit/data,
// /admin/audit/verify and /admin/audit/export. Mirrors the analytics
// dashboard's state/query pattern: state.filter keys ARE the query params.
(function () {
    'use strict';

    var root = document.getElementById('auditRoot');
    if (!root || root.dataset.enabled !== '1') { return; }

    var i18n = window.auditI18n || {};
    var locale = i18n.locale || 'en-GB';

    var state = {
        range: '7d',
        from: '',
        to: '',
        filter: { module: '', action: '', outcome: '', actor: '', ip: '', q: '' },
        cursor: '',
        loading: false
    };

    function el(id) { return document.getElementById(id); }

    function escapeHTML(s) {
        if (s === null || s === undefined) { return ''; }
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function fmtTime(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return escapeHTML(iso); }
        return d.toLocaleDateString(locale) + ' ' + d.toLocaleTimeString(locale);
    }

    function buildQuery() {
        var params = new URLSearchParams();
        params.set('range', state.range);
        if (state.range === 'custom') {
            params.set('from', state.from);
            params.set('to', state.to);
        }
        Object.keys(state.filter).forEach(function (key) {
            if (state.filter[key]) { params.set(key, state.filter[key]); }
        });
        return params;
    }

    function outcomeBadge(outcome) {
        var cls = { success: 'bg-success', failure: 'bg-danger', denied: 'bg-warning text-dark', attempt: 'bg-secondary' }[outcome] || 'bg-secondary';
        var label = (i18n.outcomes && i18n.outcomes[outcome]) || outcome;
        return '<span class="badge ' + cls + '">' + escapeHTML(label) + '</span>';
    }

    function actorCell(e) {
        if (e.actor_type === 'admin') {
            var name = e.actor_name || e.actor_email || 'admin';
            return '<span class="fw-semibold">' + escapeHTML(name) + '</span>' +
                (e.actor_email ? '<div class="text-muted small">' + escapeHTML(e.actor_email) + '</div>' : '');
        }
        return '<span class="badge bg-light text-dark border">' + escapeHTML(e.actor_type) + '</span>';
    }

    function targetCell(e) {
        if (!e.target_type && !e.target_id && !e.target_label) { return '<span class="text-muted">—</span>'; }
        var label = e.target_label || e.target_id || '';
        var html = escapeHTML(label);
        if (e.target_type) {
            html = '<span class="text-muted small">' + escapeHTML(e.target_type) + ':</span> ' + html;
        }
        return html;
    }

    function detailRow(e) {
        var parts = [];
        parts.push('<div class="text-muted small mb-1">' + escapeHTML(i18n.detailRequest || 'Request') + ': ' +
            '<code>' + escapeHTML(e.method || '') + ' ' + escapeHTML(e.path || '') + '</code> → ' +
            escapeHTML(String(e.status || '')) +
            (e.duration_ms !== undefined ? ' · ' + escapeHTML(i18n.detailDuration || 'Duration') + ': ' + escapeHTML(String(e.duration_ms)) + ' ms' : '') +
            '</div>');
        if (e.detail && Object.keys(e.detail).length > 0) {
            var rows = Object.keys(e.detail).sort().map(function (k) {
                var v = e.detail[k];
                if (typeof v === 'object') { try { v = JSON.stringify(v); } catch (err) { v = String(v); } }
                return '<tr><td class="text-muted small pe-3">' + escapeHTML(k) + '</td><td class="small">' + escapeHTML(String(v)) + '</td></tr>';
            }).join('');
            parts.push('<table class="table table-sm table-borderless mb-1"><tbody>' + rows + '</tbody></table>');
        }
        parts.push('<div class="text-muted" style="font-size:.7rem;word-break:break-all;">' +
            '#' + escapeHTML(String(e.seq)) + ' · ' +
            escapeHTML(i18n.detailHash || 'Hash') + ': <code>' + escapeHTML(e.hash || '') + '</code><br>' +
            escapeHTML(i18n.detailPrevHash || 'Prev hash') + ': <code>' + escapeHTML(e.prev_hash || '') + '</code></div>');
        return parts.join('');
    }

    function renderRows(events, append) {
        var body = el('auditTableBody');
        if (!append) { body.innerHTML = ''; }
        if (!append && events.length === 0) {
            body.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">' + escapeHTML(i18n.noEvents || 'No events') + '</td></tr>';
            return;
        }
        var html = events.map(function (e, idx) {
            var rowId = 'auditDetail-' + e.seq + '-' + idx;
            return '<tr class="audit-row" data-target="' + rowId + '" style="cursor:pointer">' +
                '<td class="text-nowrap text-muted small">' + fmtTime(e.ts) + '</td>' +
                '<td>' + actorCell(e) + '</td>' +
                '<td><span class="badge bg-light text-dark border font-monospace">' + escapeHTML(e.action) + '</span></td>' +
                '<td>' + targetCell(e) + '</td>' +
                '<td class="text-center">' + outcomeBadge(e.outcome) + '</td>' +
                '<td class="text-muted small text-nowrap">' + escapeHTML(e.ip || '') + '</td>' +
                '<td class="text-end text-muted"><i class="bi bi-chevron-down"></i></td>' +
                '</tr>' +
                '<tr id="' + rowId + '" class="d-none"><td colspan="7" class="bg-light-subtle">' + detailRow(e) + '</td></tr>';
        }).join('');
        body.insertAdjacentHTML('beforeend', html);
    }

    function renderFacets(data) {
        var wrap = el('auditFacets');
        if (!wrap) { return; }
        var parts = [];
        if (data.total !== undefined) {
            var total = String(data.total) + (data.total_capped ? '+' : '');
            parts.push('<span class="text-muted small">' + escapeHTML(total) + ' ' + escapeHTML(i18n.totalEvents || 'events') + '</span>');
        }
        var outcomes = (data.facets && data.facets.outcomes) || {};
        ['success', 'failure', 'denied', 'attempt'].forEach(function (o) {
            if (outcomes[o]) {
                parts.push(outcomeBadge(o).replace('</span>', ' ' + outcomes[o] + '</span>'));
            }
        });
        wrap.innerHTML = parts.join('');
        el('auditTotal').textContent = '';
    }

    function renderVerify(status) {
        var chip = el('auditVerifyChip');
        var info = el('auditVerifyInfo');
        if (!chip || !status) { return; }
        if (status.running) {
            chip.className = 'badge bg-info text-dark';
            chip.textContent = i18n.integrityRunning || 'Running…';
            info.textContent = '';
            return;
        }
        if (!status.ran) {
            chip.className = 'badge bg-secondary';
            chip.textContent = i18n.integrityUnknown || 'Not verified';
            info.textContent = '';
            return;
        }
        if (status.ok) {
            chip.className = 'badge bg-success';
            chip.textContent = i18n.integrityOk || 'Intact';
            info.textContent = String(status.checked) + ' ' + (i18n.verifyChecked || 'checked');
        } else {
            chip.className = 'badge bg-danger';
            chip.textContent = (i18n.integrityBroken || 'Broken at seq %d').replace('%d', String(status.broken_at_seq || 0));
            info.textContent = status.reason || '';
        }
    }

    function rebuildExportLinks() {
        var params = buildQuery();
        params.set('format', 'csv');
        el('auditExportCsv').href = '/admin/audit/export?' + params.toString();
        params.set('format', 'ndjson');
        el('auditExportNdjson').href = '/admin/audit/export?' + params.toString();
    }

    function load(append) {
        if (state.loading) { return; }
        state.loading = true;
        var params = buildQuery();
        if (append && state.cursor) { params.set('cursor', state.cursor); }
        fetch('/admin/audit/data?' + params.toString(), { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); })
            .then(function (data) {
                renderRows(data.events || [], append);
                if (!append) { renderFacets(data); }
                renderVerify(data.verify);
                state.cursor = data.next_cursor || '';
                el('auditLoadMore').classList.toggle('d-none', !data.has_more);
                rebuildExportLinks();
            })
            .catch(function () {
                if (!append) {
                    el('auditTableBody').innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">' +
                        escapeHTML(i18n.loadError || 'Load error') + '</td></tr>';
                }
            })
            .finally(function () { state.loading = false; });
    }

    function readFilters() {
        document.querySelectorAll('[data-filter]').forEach(function (input) {
            state.filter[input.getAttribute('data-filter')] = input.value.trim();
        });
        var from = el('auditFrom').value;
        var to = el('auditTo').value;
        if (from && to) {
            state.range = 'custom';
            state.from = from;
            state.to = to;
            document.querySelectorAll('#auditRangeGroup .btn').forEach(function (b) { b.classList.remove('active'); });
        }
    }

    // ─── Events ───

    document.addEventListener('click', function (event) {
        var rangeBtn = event.target.closest('#auditRangeGroup .btn');
        if (rangeBtn) {
            document.querySelectorAll('#auditRangeGroup .btn').forEach(function (b) { b.classList.remove('active'); });
            rangeBtn.classList.add('active');
            state.range = rangeBtn.getAttribute('data-range');
            el('auditFrom').value = '';
            el('auditTo').value = '';
            state.cursor = '';
            load(false);
            return;
        }
        var row = event.target.closest('.audit-row');
        if (row) {
            var detail = el(row.getAttribute('data-target'));
            if (detail) { detail.classList.toggle('d-none'); }
            var icon = row.querySelector('.bi-chevron-down, .bi-chevron-up');
            if (icon) { icon.classList.toggle('bi-chevron-down'); icon.classList.toggle('bi-chevron-up'); }
        }
    });

    el('auditApply').addEventListener('click', function () {
        readFilters();
        state.cursor = '';
        load(false);
    });

    el('auditReset').addEventListener('click', function () {
        document.querySelectorAll('[data-filter]').forEach(function (input) { input.value = ''; });
        el('auditFrom').value = '';
        el('auditTo').value = '';
        state.filter = { module: '', action: '', outcome: '', actor: '', ip: '', q: '' };
        state.range = '7d';
        state.cursor = '';
        document.querySelectorAll('#auditRangeGroup .btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-range') === '7d');
        });
        load(false);
    });

    el('auditLoadMore').addEventListener('click', function () { load(true); });

    ['auditActor', 'auditIP', 'auditQ'].forEach(function (id) {
        el(id).addEventListener('keydown', function (event) {
            if (event.key === 'Enter') { el('auditApply').click(); }
        });
    });

    // ─── Verify ───

    var verifyPoll = null;
    function pollVerify() {
        fetch('/admin/audit/verify', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (status) {
                if (!status) { return; }
                renderVerify(status);
                if (!status.running && verifyPoll) {
                    clearInterval(verifyPoll);
                    verifyPoll = null;
                }
            })
            .catch(function () {});
    }

    el('auditVerifyBtn').addEventListener('click', function () {
        fetch('/admin/audit/verify', { method: 'POST', credentials: 'same-origin' })
            .then(function () {
                renderVerify({ running: true });
                if (!verifyPoll) { verifyPoll = setInterval(pollVerify, 3000); }
            })
            .catch(function () {});
    });

    // ─── Boot ───
    load(false);
})();
