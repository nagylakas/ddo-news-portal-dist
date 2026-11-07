/* Selection and action bar of the admin article list. */
(function () {
    'use strict';

    var form = document.getElementById('bulk-form');
    if (!form) { return; }

    var bar = document.getElementById('bulk-bar');
    var count = document.getElementById('bulk-count');
    var action = document.getElementById('bulk-action');
    var submit = document.getElementById('bulk-submit');
    var all = document.getElementById('bulk-select-all');
    var boxes = document.querySelectorAll('.bulk-select');
    var fields = form.querySelectorAll('[data-bulk-field]');

    function selected() {
        return Array.prototype.filter.call(boxes, function (box) { return box.checked; }).length;
    }

    function refresh() {
        var n = selected();
        count.textContent = String(n);
        bar.classList.toggle('d-none', n === 0);
        all.checked = n > 0 && n === boxes.length;
        all.indeterminate = n > 0 && n < boxes.length;
        Array.prototype.forEach.call(fields, function (field) {
            var active = field.getAttribute('data-bulk-field') === action.value;
            field.classList.toggle('d-none', !active);
            var input = field.querySelector('select, input');
            if (input) { input.required = active; }
        });
        submit.disabled = n === 0 || !action.value;
    }

    all.addEventListener('change', function () {
        Array.prototype.forEach.call(boxes, function (box) { box.checked = all.checked; });
        refresh();
    });
    Array.prototype.forEach.call(boxes, function (box) { box.addEventListener('change', refresh); });
    action.addEventListener('change', refresh);

    form.addEventListener('submit', function (event) {
        var message = action.value === 'delete'
            ? form.getAttribute('data-confirm-delete')
            : form.getAttribute('data-confirm');
        if (!window.confirm(message.replace('%d', String(selected())))) { event.preventDefault(); }
    });

    refresh();
}());
