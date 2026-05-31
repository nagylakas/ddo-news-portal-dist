// DDO News Portal - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Decode contact e-mail links on the client so plain mailto addresses are not exposed in HTML.
    const contactEmailLinks = document.querySelectorAll('.js-contact-email[data-email-token]');
    contactEmailLinks.forEach(function(link) {
        try {
            const email = atob(link.getAttribute('data-email-token'));
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return;
            }
            const address = link.querySelector('.footer-contact-address');
            if (address) {
                address.textContent = email;
            }
            link.href = 'mailto:' + email;
        } catch (_) {
            link.removeAttribute('href');
        }
    });

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
        const webshopEnabled = searchForm.getAttribute('data-webshop-enabled') === 'true';
        const path = window.location.pathname;
        let scope = 'articles';
        if (marketplaceEnabled && path.indexOf('/marketplace') === 0) {
            scope = 'marketplace';
        } else if (forumEnabled && path.indexOf('/forum') === 0) {
            scope = 'forum';
        } else if (webshopEnabled && path.indexOf('/webshop') === 0) {
            scope = 'webshop';
        } else if (path === '/search') {
            const requestedScope = new URLSearchParams(window.location.search).get('scope');
            if (marketplaceEnabled && requestedScope === 'marketplace') {
                scope = 'marketplace';
            } else if (forumEnabled && requestedScope === 'forum') {
                scope = 'forum';
            } else if (webshopEnabled && requestedScope === 'webshop') {
                scope = 'webshop';
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
            } else if (scope === 'webshop') {
                searchInput.placeholder = 'Keresés termékek között...';
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

    initCookieConsent();
});

// Consent-gated measurement loaders. Third-party scripts are not requested until the visitor grants per-provider consent.
function initCookieConsent() {
    const config = window.ddoConsentConfig || {};
    const metaPixelId = String(config.metaPixelId || '').trim();
    const googleAnalyticsId = String(config.googleAnalyticsId || '').trim();
    const availableProviders = {
        metaPixel: metaPixelId !== '',
        googleAnalytics: googleAnalyticsId !== ''
    };
    if (!availableProviders.metaPixel && !availableProviders.googleAnalytics) {
        return;
    }

    const storageKey = 'ddo_cookie_consent_v1';
    const banner = document.getElementById('cookieConsent');
    const saveButtons = document.querySelectorAll('.js-cookie-save');
    const rejectButtons = document.querySelectorAll('.js-cookie-reject');
    const settingsButtons = document.querySelectorAll('.js-cookie-settings');
    const providerInputs = document.querySelectorAll('.js-cookie-provider');
    const message = banner ? banner.querySelector('.js-cookie-consent-message') : null;

    function readConsent() {
        try {
            const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (!stored) {
                return null;
            }
            return {
                necessary: true,
                metaPixel: stored.metaPixel === true || (stored.marketing === true && stored.metaPixel !== false),
                googleAnalytics: stored.googleAnalytics === true,
                updatedAt: stored.updatedAt || ''
            };
        } catch (_) {
            return null;
        }
    }

    function writeConsent(consent) {
        const normalized = {
            necessary: true,
            metaPixel: availableProviders.metaPixel && consent.metaPixel === true,
            googleAnalytics: availableProviders.googleAnalytics && consent.googleAnalytics === true,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(storageKey, JSON.stringify(normalized));
        return normalized;
    }

    function currentFormConsent() {
        const consent = {
            metaPixel: false,
            googleAnalytics: false
        };
        providerInputs.forEach(function(input) {
            if (input.value === 'metaPixel') {
                consent.metaPixel = input.checked;
            } else if (input.value === 'googleAnalytics') {
                consent.googleAnalytics = input.checked;
            }
        });
        return consent;
    }

    function applyConsent(consent) {
        if (availableProviders.metaPixel) {
            if (consent.metaPixel) {
                loadMetaPixel(metaPixelId);
            } else {
                revokeMetaPixel();
            }
        }
        if (availableProviders.googleAnalytics) {
            if (consent.googleAnalytics) {
                loadGoogleAnalytics(googleAnalyticsId);
            } else {
                revokeGoogleAnalytics();
            }
        }
    }

    function showBanner() {
        updateBannerState();
        if (banner) {
            banner.hidden = false;
        }
    }

    function hideBanner() {
        if (banner) {
            banner.hidden = true;
        }
    }

    function saveSelectedConsent() {
        const consent = writeConsent(currentFormConsent());
        updateBannerState(consent);
        hideBanner();
        applyConsent(consent);
    }

    function rejectAllConsent() {
        const consent = writeConsent({
            metaPixel: false,
            googleAnalytics: false
        });
        updateBannerState(consent);
        hideBanner();
        applyConsent(consent);
    }

    function updateBannerState(consentOverride) {
        const consent = consentOverride || readConsent() || {
            metaPixel: false,
            googleAnalytics: false
        };
        providerInputs.forEach(function(input) {
            if (input.value === 'metaPixel') {
                input.checked = availableProviders.metaPixel && consent.metaPixel === true;
            } else if (input.value === 'googleAnalytics') {
                input.checked = availableProviders.googleAnalytics && consent.googleAnalytics === true;
            }
        });
        const selectedCount = (consent.metaPixel ? 1 : 0) + (consent.googleAnalytics ? 1 : 0);
        if (message) {
            message.textContent = selectedCount > 0
                ? 'A kijelölt mérési szolgáltatások jelenleg engedélyezettek. Itt bármikor módosíthatod vagy visszavonhatod a hozzájárulást.'
                : 'A szükséges cookie-k mellett csak az általad kiválasztott mérési szolgáltatásokat indítjuk el.';
        }
        rejectButtons.forEach(function(button) {
            button.textContent = selectedCount > 0 ? 'Összes hozzájárulás visszavonása' : 'Összes elutasítása';
        });
    }

    saveButtons.forEach(function(button) {
        button.addEventListener('click', saveSelectedConsent);
    });
    rejectButtons.forEach(function(button) {
        button.addEventListener('click', rejectAllConsent);
    });
    settingsButtons.forEach(function(button) {
        button.addEventListener('click', showBanner);
    });

    window.ddoConsent = {
        open: showBanner,
        save: saveSelectedConsent,
        rejectAll: rejectAllConsent,
        get: readConsent
    };

    const consent = readConsent();
    if (consent) {
        applyConsent(consent);
    } else {
        showBanner();
    }
}

function loadMetaPixel(pixelId) {
    if (window.ddoMetaPixelLoaded) {
        return;
    }
    window.ddoMetaPixelLoaded = true;

    runAfterLoadIdle(function() {
        /* eslint-disable */
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
		'https://connect.facebook.net/hu_HU/fbevents.js');
		/* eslint-enable */
		fbq('init', pixelId);
		fbq('consent', 'grant');
        fbq('track', 'PageView');
    });
}

function revokeMetaPixel() {
    if (typeof window.fbq === 'function') {
        try {
            window.fbq('consent', 'revoke');
        } catch (_) {}
    }
}

function loadGoogleAnalytics(measurementId) {
    if (window.ddoGoogleAnalyticsLoaded) {
        grantGoogleAnalytics();
        return;
    }
    window.ddoGoogleAnalyticsLoaded = true;

    runAfterLoadIdle(function() {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function() {
            window.dataLayer.push(arguments);
        };
        grantGoogleAnalytics();

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
        document.head.appendChild(script);

        window.gtag('js', new Date());
        window.gtag('config', measurementId, {
            anonymize_ip: true
        });
    });
}

function grantGoogleAnalytics() {
    if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
            analytics_storage: 'granted'
        });
    }
}

function revokeGoogleAnalytics() {
    if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
            analytics_storage: 'denied'
        });
    }
}

function runAfterLoadIdle(callback) {
    function idle() {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(callback, { timeout: 2000 });
            return;
        }
        window.setTimeout(callback, 1);
    }
    if (document.readyState === 'complete') {
        idle();
    } else {
        window.addEventListener('load', idle, { once: true });
    }
}

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
