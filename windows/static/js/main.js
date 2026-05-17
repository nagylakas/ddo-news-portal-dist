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
        const scopeInput = searchForm.querySelector('input[name="scope"]');
        const marketplaceEnabled = searchForm.getAttribute('data-marketplace-enabled') === 'true';
        const forumEnabled = searchForm.getAttribute('data-forum-enabled') === 'true';
        const path = window.location.pathname;
        let scope = 'articles';
        if (marketplaceEnabled && path.indexOf('/marketplace') === 0) {
            scope = 'marketplace';
        } else if (forumEnabled && path.indexOf('/forum') === 0) {
            scope = 'forum';
        } else if (path === '/search') {
            const requestedScope = new URLSearchParams(window.location.search).get('scope');
            if (marketplaceEnabled && requestedScope === 'marketplace') {
                scope = 'marketplace';
            } else if (forumEnabled && requestedScope === 'forum') {
                scope = 'forum';
            }
        }
        if (scopeInput) {
            scopeInput.value = scope;
        }
        if (searchInput) {
            if (scope === 'marketplace') {
                searchInput.placeholder = 'Keresés hirdetésekben...';
            } else if (scope === 'forum') {
                searchInput.placeholder = 'Keresés témákban...';
            } else {
                searchInput.placeholder = 'Keresés cikkekben...';
            }
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
    var scopeInput = document.getElementById('navSearchScope');
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
        var scope = scopeInput ? scopeInput.value : 'articles';
        fetch('/api/search/preview?q=' + encodeURIComponent(q) + '&scope=' + encodeURIComponent(scope))
            .then(function (r) { return r.json(); })
            .then(function (data) { renderDropdown(q, data); })
            .catch(function () { dropdown.hidden = true; });
    }

    function renderDropdown(q, data) {
        var sections = data && data.sections ? data.sections : [];
        if (sections.length === 0) {
            dropdown.innerHTML = '<div class="search-dropdown-empty">Nincs találat</div>';
            dropdown.hidden = false;
            return;
        }
        var html = sections.map(function (section) {
            var items = (section.items || []).map(function (item) {
                var thumb = item.image_url
                    ? '<img class="search-dropdown-thumb" src="' + esc(item.image_url) + '" alt="" loading="lazy">'
                    : '<div class="search-dropdown-thumb-placeholder"><i class="bi bi-search"></i></div>';
                var summary = item.summary ? esc(item.summary.substring(0, 80)) + (item.summary.length > 80 ? '\u2026' : '') : '';
                return '<a href="' + esc(item.url) + '" class="search-dropdown-item">'
                    + thumb
                    + '<div class="search-dropdown-text">'
                    + '<div class="search-dropdown-title">' + esc(item.title) + '</div>'
                    + (summary ? '<div class="search-dropdown-summary">' + summary + '</div>' : '')
                    + '</div></a>';
            }).join('');
            return '<div class="search-dropdown-section">'
                + '<div class="search-dropdown-section-title">' + esc(section.label) + '</div>'
                + items
                + '<a href="' + esc(section.url) + '" class="search-dropdown-footer">Összes ' + esc(section.label.toLowerCase()) + ' találat &rarr;</a>'
                + '</div>';
        }).join('');
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
