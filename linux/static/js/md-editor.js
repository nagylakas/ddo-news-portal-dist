/**
 * Markdown editor helpers for the admin interface.
 * Requires marked.js to be loaded before this script.
 */

// Configure marked for safe rendering
marked.use({
    breaks: true,
    gfm: true,
});

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
        preview.innerHTML = marked.parse(ta.value || '');
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
        if (ta) preview.innerHTML = marked.parse(ta.value || '');
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
        preview.innerHTML = marked.parse(ta.value || '');
    }
}
