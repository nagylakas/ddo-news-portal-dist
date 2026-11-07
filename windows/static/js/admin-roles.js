/* Permission matrix of the role editor: whole-module ticks, counter and filter. */
(function () {
    'use strict';

    var form = document.getElementById('role-form');
    if (!form) { return; }

    var groups = form.querySelectorAll('[data-role-group]');
    var counter = document.getElementById('role-count');
    var filter = document.getElementById('role-filter');

    function keysOf(group) { return group.querySelectorAll('[data-role-key]'); }

    function sync(group) {
        var all = group.querySelector('[data-role-all]');
        var keys = keysOf(group);
        var ticked = Array.prototype.filter.call(keys, function (key) { return key.checked; }).length;
        // The module box means "module.*", which also covers actions added later.
        // That must stay a deliberate choice: ticking every row by hand does not
        // set it, and unticking any row clears it.
        if (ticked < keys.length) { all.checked = false; }
        all.indeterminate = ticked > 0 && !all.checked;
    }

    function count() {
        counter.textContent = String(form.querySelectorAll('[data-role-key]:checked').length);
    }

    Array.prototype.forEach.call(groups, function (group) {
        var all = group.querySelector('[data-role-all]');
        all.addEventListener('change', function () {
            Array.prototype.forEach.call(keysOf(group), function (key) { key.checked = all.checked; });
            sync(group);
            count();
        });
        Array.prototype.forEach.call(keysOf(group), function (key) {
            key.addEventListener('change', function () { sync(group); count(); });
        });
        sync(group);
    });

    filter.addEventListener('input', function () {
        var term = filter.value.trim().toLowerCase();
        Array.prototype.forEach.call(groups, function (group) {
            var visible = 0;
            Array.prototype.forEach.call(group.querySelectorAll('[data-role-row]'), function (row) {
                var match = !term || row.getAttribute('data-search').indexOf(term) !== -1;
                row.classList.toggle('d-none', !match);
                if (match) { visible++; }
            });
            group.classList.toggle('d-none', visible === 0);
        });
    });

    count();
}());
