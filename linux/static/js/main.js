// DDO News Portal - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.forEach(function(tooltipTriggerEl) {
        new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
    popoverTriggerList.forEach(function(popoverTriggerEl) {
        new bootstrap.Popover(popoverTriggerEl);
    });

    // Auto-dismiss alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert-dismissible');
    alerts.forEach(function(alert) {
        setTimeout(function() {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, 5000);
    });

    // Image preview for URL input
    const imageUrlInput = document.getElementById('image_url');
    if (imageUrlInput) {
        let previewContainer = imageUrlInput.parentNode.querySelector('.image-preview');
        
        imageUrlInput.addEventListener('change', function() {
            updateImagePreview(this.value);
        });

        imageUrlInput.addEventListener('blur', function() {
            updateImagePreview(this.value);
        });

        function updateImagePreview(url) {
            if (!previewContainer) {
                previewContainer = document.createElement('div');
                previewContainer.className = 'image-preview mt-2';
                imageUrlInput.parentNode.appendChild(previewContainer);
            }

            if (url && isValidUrl(url)) {
                previewContainer.innerHTML = `
                    <img src="${escapeHtml(url)}" class="rounded" style="max-height: 100px;" 
                         alt="Preview" onerror="this.style.display='none'">
                `;
            } else {
                previewContainer.innerHTML = '';
            }
        }
    }

    // Character counter for text areas
    const textareas = document.querySelectorAll('textarea[maxlength]');
    textareas.forEach(function(textarea) {
        const maxLength = textarea.getAttribute('maxlength');
        const counter = document.createElement('div');
        counter.className = 'form-text text-end';
        counter.textContent = `0 / ${maxLength} characters`;
        textarea.parentNode.appendChild(counter);

        textarea.addEventListener('input', function() {
            counter.textContent = `${this.value.length} / ${maxLength} characters`;
        });
    });

    // Confirm delete actions
    const deleteForms = document.querySelectorAll('form[action*="/delete/"]');
    deleteForms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
            if (!confirm('Are you sure you want to delete this article? This action cannot be undone.')) {
                e.preventDefault();
            }
        });
    });

    // Search form enhancement
    const searchForm = document.querySelector('form[action="/search"]');
    if (searchForm) {
        const searchInput = searchForm.querySelector('input[name="q"]');
        if (searchInput) {
            searchInput.addEventListener('keyup', function(e) {
                if (e.key === 'Escape') {
                    this.value = '';
                }
            });
        }
    }

    // Smooth scroll to top
    const scrollToTopBtn = document.getElementById('scrollToTop');
    if (scrollToTopBtn) {
        window.addEventListener('scroll', function() {
            if (window.pageYOffset > 300) {
                scrollToTopBtn.style.display = 'block';
            } else {
                scrollToTopBtn.style.display = 'none';
            }
        });

        scrollToTopBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Reading progress bar for article pages
    if (document.querySelector('.article-content')) {
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'position: fixed; top: 0; left: 0; height: 3px; background: var(--bs-primary); z-index: 9999; transition: width 0.2s;';
        document.body.appendChild(progressBar);

        window.addEventListener('scroll', function() {
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (winScroll / height) * 100;
            progressBar.style.width = scrolled + '%';
        });
    }
});

// Utility functions
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Share functionality
function shareArticle() {
    if (navigator.share) {
        navigator.share({
            title: document.title,
            url: window.location.href
        }).catch(console.error);
    } else {
        copyToClipboard(window.location.href);
        showToast('Link copied to clipboard!');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(function() {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast show position-fixed bottom-0 end-0 m-3';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="toast-header">
            <strong class="me-auto">Notification</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">${message}</div>
    `;
    document.body.appendChild(toast);

    setTimeout(function() {
        toast.remove();
    }, 3000);
}

// ===== Search Category Filter =====
(function () {
    var catList = document.getElementById('searchCatList');
    if (!catList) return;

    var resultList = document.querySelector('.search-results .listing-list');
    if (!resultList) return;

    catList.addEventListener('click', function (e) {
        var btn = e.target.closest('.search-cat-item');
        if (!btn || btn.disabled) return;

        // Update active state
        catList.querySelectorAll('.search-cat-item').forEach(function (b) {
            b.classList.remove('search-cat-active');
        });
        btn.classList.add('search-cat-active');

        var cat = btn.getAttribute('data-cat');
        var rows = resultList.querySelectorAll('.listing-row');
        rows.forEach(function (row) {
            if (!cat || row.getAttribute('data-category') === cat) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
}());

// ===== Live Search Widget =====
(function () {
    var input = document.getElementById('navSearchInput');
    var dropdown = document.getElementById('searchDropdown');
    if (!input || !dropdown) return;

    var timer = null;
    var lastQ = '';

    input.addEventListener('input', function () {
        clearTimeout(timer);
        var q = input.value.trim();
        if (q.length < 2) {
            dropdown.hidden = true;
            lastQ = '';
            return;
        }
        if (q === lastQ) return;
        timer = setTimeout(function () { fetchResults(q); }, 280);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            dropdown.hidden = true;
            input.blur();
        }
    });

    document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.hidden = true;
        }
    });

    function fetchResults(q) {
        lastQ = q;
        fetch('/api/search?q=' + encodeURIComponent(q))
            .then(function (r) { return r.json(); })
            .then(function (data) { renderDropdown(q, data); })
            .catch(function () { dropdown.hidden = true; });
    }

    function renderDropdown(q, items) {
        if (!items || items.length === 0) {
            dropdown.innerHTML = '<div class="search-dropdown-empty">Nincs találat</div>';
            dropdown.hidden = false;
            return;
        }
        var html = items.map(function (a) {
            var thumb = a.image_url
                ? '<img class="search-dropdown-thumb" src="' + esc(a.image_url) + '" alt="" loading="lazy">'
                : '<div class="search-dropdown-thumb-placeholder"><i class="bi bi-image"></i></div>';
            var summary = a.summary ? esc(a.summary.substring(0, 80)) + '\u2026' : '';
            return '<a href="/article/' + esc(a.slug) + '" class="search-dropdown-item">'
                + thumb
                + '<div class="search-dropdown-text">'
                + '<div class="search-dropdown-title">' + esc(a.title) + '</div>'
                + (summary ? '<div class="search-dropdown-summary">' + summary + '</div>' : '')
                + '</div></a>';
        }).join('');
        html += '<a href="/search?q=' + encodeURIComponent(q)
            + '" class="search-dropdown-footer">Összes találat megtekintése &rarr;</a>';
        dropdown.innerHTML = html;
        dropdown.hidden = false;
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}());
