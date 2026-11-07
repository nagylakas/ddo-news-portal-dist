/* Hides the menu items the account cannot open. This only tidies the menu: the
   server decides on every request, whatever is visible here. */
(function () {
    'use strict';

    var nav = document.querySelector('nav');
    if (!nav || !window.fetch) { return; }

    var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="/admin"]'));
    var paths = links.map(function (link) { return link.getAttribute('href'); });

    fetch('/admin/account/visible-links', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ paths: paths })
    }).then(function (response) {
        return response.ok ? response.json() : { hidden: [] };
    }).then(function (result) {
        var hidden = {};
        (result.hidden || []).forEach(function (path) { hidden[path] = true; });
        links.forEach(function (link) {
            if (hidden[link.getAttribute('href')]) {
                var item = link.closest('li') || link;
                item.classList.add('d-none');
            }
        });
        Array.prototype.forEach.call(nav.querySelectorAll('.dropdown'), function (dropdown) {
            var items = dropdown.querySelectorAll('.dropdown-menu > li');
            var visible = Array.prototype.filter.call(items, function (item) { return !item.classList.contains('d-none'); });
            if (items.length > 0 && visible.length === 0) { dropdown.classList.add('d-none'); }
        });
    }).catch(function () { /* the menu simply stays complete */ });
}());
