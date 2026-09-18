(function () {
    'use strict';

    function init() {

    var cfg = window.categoryEditorConfig || {};
    var text = cfg.i18n || {};
    var iconInput = document.getElementById('icon');
    var iconPreview = document.getElementById('category_icon_preview');
    var imageInput = document.getElementById('og_image');
    var imagePreview = document.getElementById('category_og_preview');
    var imageWrap = document.getElementById('category_og_preview_wrap');
    var status = document.getElementById('category_image_status');
    var icons = [];

    function escapeHTML(value) {
        var node = document.createElement('div');
        node.textContent = value || '';
        return node.innerHTML;
    }

    function secureURL(value) {
        value = (value || '').trim();
        return !value || /^(https?:\/\/|\/)/i.test(value) ? value : 'https://' + value;
    }

    function setStatus(message, kind) {
        if (!status) return;
        status.textContent = message || '';
        status.className = 'small ms-2' + (kind ? ' text-' + kind : '');
    }

    function updateIconPreview() {
        var name = (iconInput.value || '').trim().replace(/^bi-/, '');
        iconPreview.className = 'bi fs-4' + (name ? ' bi-' + name : '');
    }

    function updateImagePreview() {
        var url = secureURL(imageInput.value);
        imageWrap.style.display = url ? '' : 'none';
        imagePreview.src = url;
    }

    iconInput.addEventListener('input', updateIconPreview);
    imageInput.addEventListener('input', updateImagePreview);
    updateIconPreview();
    updateImagePreview();

    var iconModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('categoryIconPickerModal'));
    var iconGrid = document.getElementById('category_icon_grid');
    var iconSearch = document.getElementById('category_icon_search');
    var iconCount = document.getElementById('category_icon_count');

    function renderIcons() {
        var query = (iconSearch.value || '').trim().toLowerCase();
        var matches = query ? icons.filter(function (name) { return name.indexOf(query) !== -1; }) : icons;
        iconCount.textContent = (text.iconCount || '{count} icons').replace('{count}', matches.length);
        if (!matches.length) {
            iconGrid.innerHTML = '<div class="col-12 text-muted">' + escapeHTML(text.empty) + '</div>';
            return;
        }
        iconGrid.innerHTML = matches.map(function (name) {
            return '<div class="col"><button type="button" class="btn btn-outline-secondary w-100 h-100 py-2 category-icon-choice" data-icon="' + escapeHTML(name) + '" title="' + escapeHTML(name) + '"><i class="bi bi-' + escapeHTML(name) + ' fs-4 d-block mb-1"></i><small class="d-block text-truncate">' + escapeHTML(name) + '</small></button></div>';
        }).join('');
    }

    document.getElementById('category_icon_picker_btn').addEventListener('click', function () {
        iconModal.show();
        iconSearch.focus();
        if (icons.length) return;
        iconGrid.innerHTML = '<div class="col-12 text-muted">' + escapeHTML(text.loading) + '</div>';
        fetch(cfg.iconCSSURL).then(function (response) {
            if (!response.ok) throw new Error('icon catalog');
            return response.text();
        }).then(function (css) {
            var found = new Set();
            var pattern = /\.bi-([a-z0-9-]+)::before/g;
            var match;
            while ((match = pattern.exec(css)) !== null) found.add(match[1]);
            icons = Array.from(found).sort();
            renderIcons();
        }).catch(function () {
            iconGrid.innerHTML = '<div class="col-12 text-danger">' + escapeHTML(text.empty) + '</div>';
        });
    });
    iconSearch.addEventListener('input', renderIcons);
    iconGrid.addEventListener('click', function (event) {
        var choice = event.target.closest('.category-icon-choice');
        if (!choice) return;
        iconInput.value = choice.dataset.icon;
        updateIconPreview();
        iconModal.hide();
    });

    if (!cfg.s3Enabled) return;

    function uploadBlob(blob, filename) {
        var body = new FormData();
        body.append('image', blob, filename);
        body.append('category', 'category');
        return fetch('/admin/media/upload?json=1', {method: 'POST', body: body}).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok || !data.url) throw new Error(data.error || text.uploadError);
                return data;
            });
        });
    }

    function useUploadedImage(data) {
        imageInput.value = secureURL(data.url);
        updateImagePreview();
        setStatus(data.existing ? text.alreadyExists : text.generated, data.existing ? 'warning' : 'success');
    }

    var mediaModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('categoryMediaPickerModal'));
    var mediaGrid = document.getElementById('category_media_grid');
    document.getElementById('category_media_picker_btn').addEventListener('click', function () {
        mediaGrid.innerHTML = '<div class="col-12 text-muted">' + escapeHTML(text.loading) + '</div>';
        fetch('/admin/media/picker').then(function (response) { return response.json(); }).then(function (data) {
            var items = data && data.all ? data.all : [];
            mediaGrid.innerHTML = items.length ? items.map(function (item) {
                var url = secureURL(item.url), label = item.title || item.filename || '';
                return '<div class="col-6 col-md-3 col-lg-2"><button type="button" class="card h-100 w-100 text-start category-media-choice" data-url="' + escapeHTML(url) + '"><img src="' + escapeHTML(url) + '" class="card-img-top" style="height:90px;object-fit:cover" alt=""><span class="card-body p-1"><small class="text-muted text-truncate d-block">' + escapeHTML(label) + '</small></span></button></div>';
            }).join('') : '<div class="col-12 text-muted">' + escapeHTML(text.mediaEmpty) + '</div>';
        }).catch(function () { mediaGrid.innerHTML = '<div class="col-12 text-danger">' + escapeHTML(text.uploadError) + '</div>'; });
        mediaModal.show();
    });
    mediaGrid.addEventListener('click', function (event) {
        var choice = event.target.closest('.category-media-choice');
        if (!choice) return;
        imageInput.value = choice.dataset.url;
        updateImagePreview();
        setStatus('', '');
        mediaModal.hide();
    });

    var fileInput = document.getElementById('category_media_file');
    document.getElementById('category_upload_btn').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (!fileInput.files || !fileInput.files[0]) return;
        setStatus(text.loading, 'muted');
        uploadBlob(fileInput.files[0], fileInput.files[0].name).then(useUploadedImage).catch(function (error) {
            setStatus(error.message || text.uploadError, 'danger');
        });
        fileInput.value = '';
    });

    function shade(hex, amount) {
        var raw = (hex || '#0d6efd').replace('#', '');
        if (raw.length === 3) raw = raw.split('').map(function (c) { return c + c; }).join('');
        if (!/^[0-9a-f]{6}$/i.test(raw)) raw = '0d6efd';
        var value = parseInt(raw, 16), target = amount < 0 ? 0 : 255, ratio = Math.abs(amount);
        var r = value >> 16, g = value >> 8 & 255, b = value & 255;
        return 'rgb(' + Math.round(r + (target - r) * ratio) + ',' + Math.round(g + (target - g) * ratio) + ',' + Math.round(b + (target - b) * ratio) + ')';
    }

    function iconGlyph(name) {
        var probe = document.createElement('i');
        probe.className = 'bi bi-' + name;
        probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
        document.body.appendChild(probe);
        var content = getComputedStyle(probe, '::before').content;
        probe.remove();
        if (!content || content === 'none' || content === 'normal') return '';
        return content.replace(/^['"]|['"]$/g, '');
    }

    document.getElementById('category_generate_btn').addEventListener('click', function () {
        var button = this;
        var name = (iconInput.value || '').trim().replace(/^bi-/, '');
        var glyph = iconGlyph(name);
        if (!name || !glyph) { setStatus(text.generateNoIcon, 'danger'); return; }
        button.disabled = true;
        setStatus(text.generating, 'muted');
        Promise.resolve(document.fonts && document.fonts.load ? document.fonts.load('320px bootstrap-icons') : null).then(function () {
            var canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
            var ctx = canvas.getContext('2d');
            var gradient = ctx.createLinearGradient(0, 0, 1200, 630);
            gradient.addColorStop(0, shade(cfg.primaryColor, 0.24));
            gradient.addColorStop(1, shade(cfg.primaryColor, -0.24));
            ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = '320px bootstrap-icons'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
            ctx.fillText(glyph, canvas.width / 2, canvas.height / 2);
            return new Promise(function (resolve, reject) { canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error(text.generateError)); }, 'image/png'); });
        }).then(function (blob) {
            var filename = 'category-' + (name || 'icon') + '-og.png';
            return uploadBlob(blob, filename);
        }).then(useUploadedImage).catch(function (error) {
            setStatus(error.message || text.generateError, 'danger');
        }).finally(function () { button.disabled = false; });
    });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
