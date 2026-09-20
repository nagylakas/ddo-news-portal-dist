/**
 * Markdown editor helpers for the admin interface.
 * Requires marked.js to be loaded before this script.
 */

// Configure marked for safe rendering
marked.use({
    breaks: true,
    gfm: true,
});

// renderMarkdownPreview also expands reusable gallery blocks. The editor uses
// marked for immediate feedback, while the public renderer resolves blocks on
// the server; this small hydration step makes the two views agree.
function renderMarkdownPreview(preview, source) {
    preview.innerHTML = marked.parse(source || '');
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
