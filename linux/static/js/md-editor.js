/**
 * Markdown editor helpers for the admin interface.
 * Requires marked.js to be loaded before this script.
 */

// Configure marked (output is always passed through sanitizePreviewHTML).
if (typeof marked !== 'undefined') {
    marked.use({
        breaks: true,
        gfm: true,
    });
}

// The public site renders Markdown on the server with raw HTML stripped and
// unsafe URLs removed; marked does neither. Content can come from API, MCP
// or central-sync clients, so the preview must not execute it in the admin
// origin. The HTML is parsed into an inert document (no scripts run, no
// resources load) and rebuilt from an allowlist of tags and attributes.
var PREVIEW_ALLOWED_TAGS = {
    A: 1, ABBR: 1, B: 1, BLOCKQUOTE: 1, BR: 1, CODE: 1, DEL: 1, DIV: 1, EM: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, HR: 1, I: 1, IMG: 1, INPUT: 1,
    KBD: 1, LI: 1, OL: 1, P: 1, PRE: 1, S: 1, SECTION: 1, SPAN: 1, STRONG: 1,
    SUB: 1, SUP: 1, TABLE: 1, TBODY: 1, TD: 1, TFOOT: 1, TH: 1, THEAD: 1, TR: 1, UL: 1
};
var PREVIEW_ALLOWED_ATTRS = {
    alt: 1, align: 1, checked: 1, 'class': 1, disabled: 1, href: 1, id: 1,
    src: 1, start: 1, title: 1, type: 1
};
var PREVIEW_DROP_WITH_CONTENT = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, SVG: 1, MATH: 1 };

function isSafePreviewURL(value) {
    var v = String(value || '').replace(/[\u0000- \u007f]/g, '').toLowerCase();
    if (v === '' || v.charAt(0) === '#' || v.charAt(0) === '?') return true;
    if (v.charAt(0) === '/') return v.charAt(1) !== '/' && v.charCodeAt(1) !== 92; // 92 = backslash
    var colon = v.indexOf(':');
    if (colon < 0) return true; // relative path
    var slash = v.indexOf('/');
    if (slash >= 0 && slash < colon) return true; // "a/b:c" is relative
    var scheme = v.slice(0, colon);
    return scheme === 'http' || scheme === 'https' || scheme === 'mailto';
}

function sanitizePreviewNode(node, doc) {
    if (node.nodeType === 3) return doc.createTextNode(node.nodeValue);
    if (node.nodeType !== 1) return null;
    var tag = node.nodeName.toUpperCase();
    if (PREVIEW_DROP_WITH_CONTENT[tag]) return null;
    var children = Array.prototype.slice.call(node.childNodes);
    if (!PREVIEW_ALLOWED_TAGS[tag] || (tag === 'INPUT' && String(node.getAttribute('type')).toLowerCase() !== 'checkbox')) {
        // Unknown element: keep its (sanitized) content, drop the element.
        var frag = doc.createDocumentFragment();
        children.forEach(function (child) {
            var clean = sanitizePreviewNode(child, doc);
            if (clean) frag.appendChild(clean);
        });
        return frag;
    }
    var el = doc.createElement(tag.toLowerCase());
    Array.prototype.slice.call(node.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        if (!PREVIEW_ALLOWED_ATTRS[name]) return;
        if ((name === 'href' || name === 'src') && !isSafePreviewURL(attr.value)) return;
        el.setAttribute(name, attr.value);
    });
    if (tag === 'INPUT') el.setAttribute('disabled', '');
    if (tag === 'A') el.setAttribute('rel', 'noopener noreferrer');
    children.forEach(function (child) {
        var clean = sanitizePreviewNode(child, doc);
        if (clean) el.appendChild(clean);
    });
    return el;
}

function sanitizePreviewHTML(html) {
    var parsed = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(parsed.body.childNodes).forEach(function (child) {
        var clean = sanitizePreviewNode(child, document);
        if (clean) frag.appendChild(clean);
    });
    return frag;
}

// renderMarkdownPreview also expands reusable gallery blocks. The editor uses
// marked for immediate feedback, while the public renderer resolves blocks on
// the server; this small hydration step makes the two views agree.
function renderMarkdownPreview(preview, source) {
    preview.textContent = '';
    if (typeof marked === 'undefined') {
        // No Markdown parser on this page: show the source as plain text.
        var pre = document.createElement('pre');
        pre.textContent = source || '';
        preview.appendChild(pre);
        return;
    }
    preview.appendChild(sanitizePreviewHTML(marked.parse(source || '')));
    preview.querySelectorAll('pre > code.language-gallery').forEach(function (code) {
        var lines = code.textContent.trim().split(/\s+/);
        var id = lines[0] || '';
        var match = /^\[(\d+)\s*-\s*(\d+)\]$/.exec(lines[1] || '');
        var start = match ? Number(match[1]) : 1;
        var end = match ? Number(match[2]) : 4;
        if (!/^[a-f0-9]{24}$/.test(id) || start < 1 || end < start || end - start > 8) return;
        fetch('/api/galleries/' + encodeURIComponent(id), { credentials: 'same-origin' })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (gallery) {
                if (!gallery || !gallery.images || !gallery.images.length || !preview.contains(code)) return;
                end = Math.min(end, gallery.images.length);
                if (start > end) return;
                var section = document.createElement('section');
                section.className = 'content-gallery content-gallery-' + (end - start + 1);
                section.dataset.galleryId = id;
                section.setAttribute('aria-label', gallery.title || 'Galéria');
                var grid = document.createElement('div'); grid.className = 'content-gallery-grid';
                gallery.images.slice(start - 1, end).forEach(function (image, relativeIndex) {
                    var button = document.createElement('button'); button.type = 'button'; button.className = 'content-gallery-item';
                    button.dataset.galleryId = id; button.dataset.galleryIndex = String(start - 1 + relativeIndex);
                    var img = document.createElement('img'); img.src = image.url; img.alt = image.alt_text || image.title || gallery.title || ''; img.loading = 'lazy';
                    button.appendChild(img); grid.appendChild(button);
                });
                section.appendChild(grid);
                code.closest('pre').replaceWith(section);
            })
            .catch(function () {});
    });
}

/**
 * Wrap the selected text in the textarea with a prefix and suffix.
 * If nothing is selected, inserts prefix+suffix at cursor position.
 */
function mdWrap(textareaId, prefix, suffix) {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const replacement = prefix + (selected || 'szöveg') + suffix;
    ta.setRangeText(replacement, start, end, 'select');
    ta.focus();
    livePreviewIfVisible(textareaId);
}

/**
 * Prepend a Markdown prefix to the current line.
 */
function mdLine(textareaId, prefix) {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    const start = ta.selectionStart;
    // Find start of the current line
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    ta.setRangeText(prefix, lineStart, lineStart, 'end');
    ta.focus();
    livePreviewIfVisible(textareaId);
}

/**
 * Insert a Markdown link. Prompts for URL.
 */
function mdInsertLink(textareaId) {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    const url = prompt('Link URL:', 'https://');
    if (!url) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end) || 'link szöveg';
    const replacement = '[' + selected + '](' + url + ')';
    ta.setRangeText(replacement, start, end, 'end');
    ta.focus();
    livePreviewIfVisible(textareaId);
}

/**
 * Toggle the preview panel on/off.
 */
function togglePreview(textareaId, previewId, btnId) {
    const preview = document.getElementById(previewId);
    const ta = document.getElementById(textareaId);
    const btn = document.getElementById(btnId);
    if (!preview || !ta) return;

    if (preview.classList.contains('d-none')) {
        // Show preview
        renderMarkdownPreview(preview, ta.value);
        preview.classList.remove('d-none');
        ta.classList.add('d-none');
        if (btn) btn.textContent = '✏️ Szerkesztés';
    } else {
        // Back to editor
        preview.classList.add('d-none');
        ta.classList.remove('d-none');
        if (btn) btn.textContent = '👁 Preview';
        ta.focus();
    }
}

/**
 * Update preview content live while typing (only if preview is visible).
 */
function livePreview(textareaId, previewId) {
    const preview = document.getElementById(previewId);
    if (preview && !preview.classList.contains('d-none')) {
        const ta = document.getElementById(textareaId);
        if (ta) renderMarkdownPreview(preview, ta.value);
    }
}

/**
 * Internal: update preview if currently shown (used by toolbar buttons).
 */
function livePreviewIfVisible(textareaId) {
    // Find the sibling preview div by looking for md-preview in the same wrapper
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    const wrap = ta.closest('.md-editor-wrap');
    if (!wrap) return;
    const preview = wrap.querySelector('.md-preview');
    if (preview && !preview.classList.contains('d-none')) {
        renderMarkdownPreview(preview, ta.value);
    }
}
