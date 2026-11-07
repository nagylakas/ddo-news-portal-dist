/* Re-ordering and removing rows on the admin home page editor. */
(function () {
    'use strict';

    var list = document.getElementById('home-slots');
    if (!list) { return; }

    function renumber() {
        Array.prototype.forEach.call(list.querySelectorAll('[data-home-slot]'), function (row, index) {
            var position = row.querySelector('[data-position]');
            if (position) { position.textContent = String(index + 1); }
            row.classList.toggle('home-slot-lead', index === 0);
            var lead = row.querySelector('[data-lead-badge]');
            if (lead) { lead.classList.toggle('d-none', index !== 0); }
        });
    }

    list.addEventListener('click', function (event) {
        var button = event.target.closest('[data-move], [data-remove]');
        if (!button) { return; }
        var row = button.closest('[data-home-slot]');
        if (button.hasAttribute('data-remove')) {
            row.remove();
        } else if (button.getAttribute('data-move') === 'up' && row.previousElementSibling) {
            list.insertBefore(row, row.previousElementSibling);
        } else if (button.getAttribute('data-move') === 'down' && row.nextElementSibling) {
            list.insertBefore(row.nextElementSibling, row);
        }
        renumber();
    });

    renumber();
}());
