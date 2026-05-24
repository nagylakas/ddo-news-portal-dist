/**
 * page-blocks.js — Block shortcode helpers for the custom-page markdown editor.
 *
 * Expects in the DOM:
 *   - textarea#content                                 — the markdown editor
 *   - #page-block-modal                                — Bootstrap modal container
 *   - window.pageBlocksConfig = {
 *         bannerSlots: [{id, label}, ...],
 *         categories:  [{name, slug}, ...],
 *         i18n: { ... }
 *     }
 *
 * Each `pageBlockInsert(kind)` call either inserts a snippet at the cursor
 * immediately, or opens a picker modal that builds the snippet from a choice.
 */

(function () {
    var TEXTAREA_ID = 'content';

    function tx() { return document.getElementById(TEXTAREA_ID); }
    function cfg() { return window.pageBlocksConfig || {}; }
    function t(key, fallback) { return (cfg().i18n && cfg().i18n[key]) || fallback || key; }

    function insertSnippet(snippet) {
        var ta = tx();
        if (!ta) return;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var s = '\n' + snippet + '\n';
        ta.value = ta.value.substring(0, start) + s + ta.value.substring(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + s.length;
        ta.dispatchEvent(new Event('input'));
    }

    function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ─── Modal plumbing ──────────────────────────────────────────────────────
    function getModalEl() { return document.getElementById('page-block-modal'); }

    function openModal(title, bodyHTML, onShow) {
        var modalEl = getModalEl();
        if (!modalEl) return;
        modalEl.querySelector('.modal-title').textContent = title;
        modalEl.querySelector('.modal-body').innerHTML = bodyHTML;
        var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        if (typeof onShow === 'function') onShow(modalEl, modal);
    }

    function closeModal() {
        var modalEl = getModalEl();
        if (!modalEl) return;
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    // ─── Article picker (single-select via search) ───────────────────────────
    function openArticlePicker(kind) {
        // kind is "article" → ```article slug```; "card_only" same
        var body =
            '<input type="search" id="pb-article-q" class="form-control mb-3"' +
            ' placeholder="' + escAttr(t('search_articles', 'Cikk keresése (legalább 2 karakter)…')) + '" autocomplete="off">' +
            '<div id="pb-article-results" class="list-group small"></div>';

        openModal(t('block_article', 'Cikk kártya'), body, function (modalEl) {
            var q = modalEl.querySelector('#pb-article-q');
            var results = modalEl.querySelector('#pb-article-results');
            var lastQ = '';
            var timer = null;

            function search() {
                var v = q.value.trim();
                if (v === lastQ) return;
                lastQ = v;
                if (v.length < 2) {
                    results.innerHTML = '';
                    return;
                }
                fetch('/api/search/preview?scope=articles&q=' + encodeURIComponent(v))
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        var items = [];
                        (data.sections || []).forEach(function (sec) {
                            if (sec.scope === 'articles') items = sec.items || [];
                        });
                        if (items.length === 0) {
                            results.innerHTML = '<div class="list-group-item text-muted">' +
                                escAttr(t('no_results', 'Nincs találat')) + '</div>';
                            return;
                        }
                        results.innerHTML = items.map(function (it) {
                            // URL format: /article/<slug>
                            var slug = (it.url || '').split('/article/')[1] || '';
                            return '<button type="button" class="list-group-item list-group-item-action"' +
                                ' data-slug="' + escAttr(slug) + '">' +
                                '<div class="fw-semibold">' + escAttr(it.title) + '</div>' +
                                '<div class="text-muted small">' + escAttr(it.summary || '') + '</div>' +
                                '</button>';
                        }).join('');
                    })
                    .catch(function () {
                        results.innerHTML = '<div class="list-group-item text-danger">' +
                            escAttr(t('search_error', 'Hálózati hiba')) + '</div>';
                    });
            }

            q.addEventListener('input', function () {
                clearTimeout(timer);
                timer = setTimeout(search, 250);
            });
            results.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-slug]');
                if (!btn) return;
                var slug = btn.getAttribute('data-slug');
                if (!slug) return;
                insertSnippet('```article\n' + slug + '\n```');
                closeModal();
            });
            setTimeout(function () { q.focus(); }, 100);
        });
    }

    // ─── Gallery picker (multi-select from media library) ────────────────────
    function openGalleryPicker() {
        var body =
            '<div class="d-flex justify-content-between align-items-center mb-2">' +
            '  <small class="text-muted">' + escAttr(t('gallery_hint', 'Válassz egy vagy több képet')) + '</small>' +
            '  <button type="button" class="btn btn-sm btn-primary" id="pb-gallery-insert" disabled>' +
            escAttr(t('insert_selected', 'Beszúrás')) + '</button>' +
            '</div>' +
            '<div id="pb-gallery-grid" class="row g-2"></div>';

        openModal(t('block_gallery', 'Galéria'), body, function (modalEl) {
            var grid = modalEl.querySelector('#pb-gallery-grid');
            var btn = modalEl.querySelector('#pb-gallery-insert');
            grid.innerHTML = '<div class="col-12 text-muted small">' + escAttr(t('loading', 'Betöltés…')) + '</div>';

            fetch('/admin/media/picker')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var items = (data && data.all) ? data.all : [];
                    if (items.length === 0) {
                        grid.innerHTML = '<div class="col-12 text-muted small">' +
                            escAttr(t('media_empty', 'A médiatár üres')) + '</div>';
                        return;
                    }
                    grid.innerHTML = items.map(function (it) {
                        var url = (it.url || '').replace(/^http:/, 'https:');
                        return '<div class="col-6 col-md-3 col-lg-2">' +
                            '<div class="card h-100 pb-pick" style="cursor:pointer" data-id="' + escAttr(it.id) + '">' +
                            '<img src="' + escAttr(url) + '" class="card-img-top" style="height:80px;object-fit:cover">' +
                            '<div class="card-body p-1"><small class="text-muted text-truncate d-block">' +
                            escAttr(it.title || it.filename || '') + '</small></div>' +
                            '</div></div>';
                    }).join('');
                });

            var selected = []; // ordered list of media IDs
            grid.addEventListener('click', function (e) {
                var card = e.target.closest('.pb-pick');
                if (!card) return;
                var id = card.getAttribute('data-id');
                var idx = selected.indexOf(id);
                if (idx >= 0) {
                    selected.splice(idx, 1);
                    card.classList.remove('border-primary', 'border-3');
                } else {
                    selected.push(id);
                    card.classList.add('border-primary', 'border-3');
                }
                btn.disabled = selected.length === 0;
                btn.textContent = t('insert_selected', 'Beszúrás') +
                    (selected.length ? ' (' + selected.length + ')' : '');
            });
            btn.addEventListener('click', function () {
                if (selected.length === 0) return;
                insertSnippet('```gallery\n' + selected.join(',') + '\n```');
                closeModal();
            });
        });
    }

    // ─── Banner picker (slot dropdown from KnownSlots) ───────────────────────
    function openBannerPicker() {
        var slots = cfg().bannerSlots || [];
        if (slots.length === 0) {
            var slot = prompt(t('banner_slot_prompt', 'Banner slot azonosító:'), 'article-horizontal');
            if (slot && slot.trim()) insertSnippet('```banner\n' + slot.trim() + '\n```');
            return;
        }
        var opts = slots.map(function (s) {
            return '<option value="' + escAttr(s.id) + '">' + escAttr(s.label || s.id) + '</option>';
        }).join('');
        var body =
            '<label class="form-label">' + escAttr(t('block_banner', 'Banner slot')) + '</label>' +
            '<select class="form-select mb-3" id="pb-banner-slot">' + opts + '</select>' +
            '<button type="button" class="btn btn-primary" id="pb-banner-insert">' +
            escAttr(t('insert_selected', 'Beszúrás')) + '</button>';
        openModal(t('block_banner', 'Banner'), body, function (modalEl) {
            modalEl.querySelector('#pb-banner-insert').addEventListener('click', function () {
                var v = modalEl.querySelector('#pb-banner-slot').value;
                if (v) insertSnippet('```banner\n' + v + '\n```');
                closeModal();
            });
        });
    }

    // ─── Auto articles list picker (category + limit) ────────────────────────
    function openArticlesAutoPicker() {
        var cats = cfg().categories || [];
        var opts = cats.length
            ? cats.map(function (c) {
                return '<option value="' + escAttr(c.slug || c.name) + '">' +
                    escAttr(c.name) + '</option>';
            }).join('')
            : '<option value="">' + escAttr(t('no_categories', 'Nincsenek kategóriák')) + '</option>';

        var body =
            '<label class="form-label">' + escAttr(t('field_category', 'Kategória')) + '</label>' +
            '<select class="form-select mb-3" id="pb-articles-cat">' + opts + '</select>' +
            '<label class="form-label">' + escAttr(t('field_limit', 'Megjelenítendő cikkek száma')) + '</label>' +
            '<input type="number" class="form-control mb-3" id="pb-articles-limit" value="5" min="1" max="20">' +
            '<button type="button" class="btn btn-primary" id="pb-articles-insert">' +
            escAttr(t('insert_selected', 'Beszúrás')) + '</button>';
        openModal(t('block_articles', 'Cikkek'), body, function (modalEl) {
            modalEl.querySelector('#pb-articles-insert').addEventListener('click', function () {
                var cat = modalEl.querySelector('#pb-articles-cat').value;
                var lim = parseInt(modalEl.querySelector('#pb-articles-limit').value, 10) || 5;
                if (!cat) return;
                insertSnippet('```articles\ncategory=' + cat + ' limit=' + lim + '\n```');
                closeModal();
            });
        });
    }

    // ─── Prompt-style snippets ───────────────────────────────────────────────
    function insertYouTube() {
        var id = prompt(t('youtube_prompt', 'YouTube videó azonosító (11 karakter):'), '');
        if (!id) return;
        id = id.trim();
        var m = id.match(/[A-Za-z0-9_\-]{11}/);
        if (!m) {
            alert(t('youtube_invalid', 'Érvénytelen YouTube ID.'));
            return;
        }
        insertSnippet('```youtube\n' + m[0] + '\n```');
    }

    function insertMap() {
        var raw = prompt(t('map_prompt', 'Koordináták (lat,lng[,zoom]) vagy address: cím:'), '47.4979,19.0402,14');
        if (!raw) return;
        if (/^address:/i.test(raw.trim())) {
            insertSnippet('```map\n' + raw.trim() + '\n```');
            return;
        }
        var parts = raw.split(',').map(function (s) { return s.trim(); });
        if (parts.length < 2 || isNaN(parseFloat(parts[0])) || isNaN(parseFloat(parts[1]))) {
            alert(t('map_invalid', 'Érvénytelen koordináta.'));
            return;
        }
        insertSnippet('```map\n' + parts.join(',') + '\n```');
    }

    function insertButton() {
        var txt = prompt(t('button_text_prompt', 'Gomb szövege:'), '');
        if (!txt) return;
        var url = prompt(t('button_url_prompt', 'Cél URL (relatív útvonal vagy https://…):'), '/');
        if (!url) return;
        insertSnippet('```button\n' + txt.trim() + ' | ' + url.trim() + '\n```');
    }

    // ─── Dispatch ─────────────────────────────────────────────────────────────
    window.pageBlockInsert = function (kind) {
        switch (kind) {
            case 'article':  return openArticlePicker(kind);
            case 'articles': return openArticlesAutoPicker();
            case 'gallery':  return openGalleryPicker();
            case 'banner':   return openBannerPicker();
            case 'youtube':  return insertYouTube();
            case 'map':      return insertMap();
            case 'button':   return insertButton();
            default:         return;
        }
    };
})();
