// Category mega menu filtering and focus management.
(function () {
    function normalize(value) {
        return (value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("hu-HU");
    }

    function initialize(menu) {
        var input = menu.querySelector("[data-category-menu-search]");
        var items = menu.querySelectorAll("[data-category-menu-item]");
        var empty = menu.querySelector("[data-category-menu-empty]");
        if (!input || !empty) {
            return;
        }

        input.addEventListener("input", function () {
            var query = normalize(input.value.trim());
            var visible = 0;
            items.forEach(function (item) {
                var matches = !query || normalize(item.dataset.categoryMenuName).indexOf(query) !== -1;
                item.hidden = !matches;
                if (matches) {
                    visible += 1;
                }
            });
            empty.hidden = visible !== 0;
        });

        menu.closest(".dropdown").addEventListener("shown.bs.dropdown", function () {
            input.focus();
        });
    }

    function start() {
        document.querySelectorAll(".category-mega-menu").forEach(initialize);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
}());
