/* Admin analytics dashboard — dependency-free SVG charts + breakdown tables.
   Talks to /admin/analytics/data and /admin/analytics/realtime. */
(function () {
    'use strict';

    var root = document.getElementById('analyticsRoot');
    if (!root || root.dataset.enabled !== '1') { return; }

    var i18n = window.analyticsI18n || {};
    var locale = i18n.locale || 'en-GB';

    var state = {
        range: '7d',
        from: '',
        to: '',
        metric: 'visitors',
        compare: true,
        filter: {},
        report: null,
        tabs: {
            anAcquisition: 'channels',
            anPages: 'pages',
            anTech: 'browsers',
            anGeo: 'countries'
        }
    };

    /* ------------------------------------------------------------------ */
    /* Formatting helpers                                                   */
    /* ------------------------------------------------------------------ */

    function fmtNum(value) {
        return new Intl.NumberFormat(locale).format(value || 0);
    }

    function fmtDecimal(value) {
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }

    function fmtPct(value) {
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        }).format(value || 0) + '%';
    }

    function fmtDuration(ms) {
        var seconds = Math.round((ms || 0) / 1000);
        if (seconds < 60) { return seconds + 's'; }
        var minutes = Math.floor(seconds / 60);
        var rest = seconds % 60;
        if (minutes < 60) { return minutes + 'm ' + (rest < 10 ? '0' : '') + rest + 's'; }
        return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
    }

    /* Bucket keys are produced server-side in the site timezone, so they are
       parsed as plain components — never through Date's timezone conversion. */
    function parseBucket(bucket) {
        var datePart = bucket;
        var hour = null;
        var tIndex = bucket.indexOf('T');
        if (tIndex > 0) {
            datePart = bucket.slice(0, tIndex);
            hour = parseInt(bucket.slice(tIndex + 1), 10);
        }
        var parts = datePart.split('-');
        return {
            year: parseInt(parts[0], 10),
            month: parseInt(parts[1] || '1', 10),
            day: parseInt(parts[2] || '1', 10),
            hour: hour
        };
    }

    function formatBucket(bucket, granularity, long) {
        var parsed = parseBucket(bucket);
        var date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
        if (granularity === 'hour') {
            var hh = (parsed.hour < 10 ? '0' : '') + parsed.hour;
            if (!long) { return hh + ':00'; }
            return new Intl.DateTimeFormat(locale, {
                month: 'short', day: 'numeric', timeZone: 'UTC'
            }).format(date) + ' ' + hh + ':00';
        }
        if (granularity === 'month') {
            return new Intl.DateTimeFormat(locale, {
                year: 'numeric', month: 'short', timeZone: 'UTC'
            }).format(date);
        }
        return new Intl.DateTimeFormat(locale, long
            ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
            : { month: 'short', day: 'numeric', timeZone: 'UTC' }
        ).format(date);
    }

    function escapeHTML(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* Translate well-known dimension keys to readable labels. */
    function labelFor(table, row) {
        var key = row.key || '';
        if (table === 'channels' && i18n.channels && i18n.channels[key]) { return i18n.channels[key]; }
        if (table === 'devices' && i18n.devices && i18n.devices[key]) { return i18n.devices[key]; }
        if (table === 'page_types' && i18n.pageTypes && i18n.pageTypes[key]) { return i18n.pageTypes[key]; }
        if (table === 'countries') { return countryName(key); }
        return row.label || key;
    }

    var countryFormatter = null;
    function countryName(code) {
        if (!code) { return ''; }
        try {
            if (countryFormatter === null && typeof Intl.DisplayNames === 'function') {
                countryFormatter = new Intl.DisplayNames([locale], { type: 'region' });
            }
            if (countryFormatter) {
                return countryFormatter.of(code) + ' (' + code + ')';
            }
        } catch (err) { /* older browsers: fall through to the raw code */ }
        return code;
    }

    /* ------------------------------------------------------------------ */
    /* SVG charts                                                           */
    /* ------------------------------------------------------------------ */

    var CHART_W = 900;
    var CHART_H = 280;
    var PAD = { top: 16, right: 16, bottom: 28, left: 48 };

    function seriesValues(series, metric) {
        return (series || []).map(function (point) { return point[metric] || 0; });
    }

    /* Aligns the comparison series to the current one by index, so the two
       periods line up even when a day has no traffic at all. */
    function alignedPrev(current, previous, metric) {
        var values = seriesValues(previous, metric);
        var out = [];
        for (var i = 0; i < current.length; i++) {
            out.push(i < values.length ? values[i] : 0);
        }
        return out;
    }

    function niceMax(value) {
        if (value <= 5) { return 5; }
        var magnitude = Math.pow(10, Math.floor(Math.log10(value)));
        var normalized = value / magnitude;
        var step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
        return step * magnitude;
    }

    function buildPath(values, max, width, height, offsetX, offsetY) {
        if (!values.length) { return ''; }
        var stepX = values.length > 1 ? width / (values.length - 1) : 0;
        var parts = [];
        for (var i = 0; i < values.length; i++) {
            var x = offsetX + i * stepX;
            var y = offsetY + height - (max ? (values[i] / max) * height : 0);
            parts.push((i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1));
        }
        return parts.join(' ');
    }

    function renderMainChart() {
        var container = document.getElementById('anMainChart');
        var report = state.report;
        if (!container || !report) { return; }

        var series = report.series || [];
        if (!series.length) {
            container.innerHTML = '<div class="an-empty">' + escapeHTML(i18n.noData || 'No data') + '</div>';
            return;
        }

        var metric = state.metric === 'views' || state.metric === 'sessions' ? state.metric : 'visitors';
        var values = seriesValues(series, metric);
        var prevValues = state.compare ? alignedPrev(series, report.previous_series, metric) : [];
        var max = niceMax(Math.max.apply(null, values.concat(prevValues.length ? prevValues : [0])));

        var plotW = CHART_W - PAD.left - PAD.right;
        var plotH = CHART_H - PAD.top - PAD.bottom;
        var granularity = report.range.granularity;

        // Uniform scaling keeps axis labels legible; the aspect ratio is fixed.
        var svg = ['<svg viewBox="0 0 ' + CHART_W + ' ' + CHART_H + '" class="an-svg">'];

        // Horizontal grid + y labels
        for (var g = 0; g <= 4; g++) {
            var gy = PAD.top + plotH - (plotH / 4) * g;
            svg.push('<line class="an-grid" x1="' + PAD.left + '" y1="' + gy.toFixed(1) +
                '" x2="' + (CHART_W - PAD.right) + '" y2="' + gy.toFixed(1) + '"/>');
            svg.push('<text class="an-axis" x="' + (PAD.left - 8) + '" y="' + (gy + 4).toFixed(1) +
                '" text-anchor="end">' + fmtNum(Math.round(max / 4 * g)) + '</text>');
        }

        // Comparison line first, so the current period draws on top.
        if (prevValues.length) {
            svg.push('<path class="an-line-prev" d="' +
                buildPath(prevValues, max, plotW, plotH, PAD.left, PAD.top) + '"/>');
        }

        var linePath = buildPath(values, max, plotW, plotH, PAD.left, PAD.top);
        var stepX = values.length > 1 ? plotW / (values.length - 1) : 0;
        var areaPath = linePath +
            ' L' + (PAD.left + (values.length - 1) * stepX).toFixed(1) + ' ' + (PAD.top + plotH) +
            ' L' + PAD.left + ' ' + (PAD.top + plotH) + ' Z';
        svg.push('<path class="an-area" d="' + areaPath + '"/>');
        svg.push('<path class="an-line" d="' + linePath + '"/>');

        // X labels — at most 8, evenly spaced.
        var labelStep = Math.max(1, Math.ceil(values.length / 8));
        for (var i = 0; i < series.length; i += labelStep) {
            var lx = PAD.left + i * stepX;
            svg.push('<text class="an-axis" x="' + lx.toFixed(1) + '" y="' + (CHART_H - 8) +
                '" text-anchor="middle">' + escapeHTML(formatBucket(series[i].bucket, granularity, false)) + '</text>');
        }

        // Hover targets
        var hitW = values.length > 1 ? plotW / (values.length - 1) : plotW;
        for (var h = 0; h < values.length; h++) {
            var hx = PAD.left + h * stepX - hitW / 2;
            svg.push('<rect class="an-hit" data-index="' + h + '" x="' + Math.max(PAD.left, hx).toFixed(1) +
                '" y="' + PAD.top + '" width="' + hitW.toFixed(1) + '" height="' + plotH + '"/>');
        }
        svg.push('<line class="an-cursor" x1="0" y1="' + PAD.top + '" x2="0" y2="' + (PAD.top + plotH) + '" style="display:none"/>');
        svg.push('<circle class="an-dot" r="4" style="display:none"/>');
        svg.push('</svg>');

        container.innerHTML = svg.join('') + '<div class="an-tooltip d-none"></div>';
        wireChartHover(container, series, values, prevValues, max, plotW, plotH, granularity, metric);
    }

    function wireChartHover(container, series, values, prevValues, max, plotW, plotH, granularity, metric) {
        var svg = container.querySelector('svg');
        var tooltip = container.querySelector('.an-tooltip');
        var cursor = container.querySelector('.an-cursor');
        var dot = container.querySelector('.an-dot');
        var stepX = values.length > 1 ? plotW / (values.length - 1) : 0;
        var metricLabel = i18n[metric] || metric;

        svg.addEventListener('mousemove', function (event) {
            var target = event.target;
            if (!target.classList.contains('an-hit')) { return; }
            var index = parseInt(target.getAttribute('data-index'), 10);
            var x = PAD.left + index * stepX;
            var y = PAD.top + plotH - (max ? (values[index] / max) * plotH : 0);

            cursor.setAttribute('x1', x);
            cursor.setAttribute('x2', x);
            cursor.style.display = '';
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.style.display = '';

            var rows = '<div class="an-tt-title">' +
                escapeHTML(formatBucket(series[index].bucket, granularity, true)) + '</div>' +
                '<div class="an-tt-row"><span>' + escapeHTML(metricLabel) + '</span><b>' +
                fmtNum(values[index]) + '</b></div>';
            if (prevValues.length) {
                rows += '<div class="an-tt-row an-tt-prev"><span>' +
                    escapeHTML(i18n.vsPrevious || 'Previous') + '</span><b>' +
                    fmtNum(prevValues[index]) + '</b></div>';
            }
            tooltip.innerHTML = rows;
            tooltip.classList.remove('d-none');

            var ratio = container.clientWidth / CHART_W;
            var left = x * ratio;
            tooltip.style.left = Math.min(Math.max(left, 60), container.clientWidth - 60) + 'px';
        });

        svg.addEventListener('mouseleave', function () {
            tooltip.classList.add('d-none');
            cursor.style.display = 'none';
            dot.style.display = 'none';
        });
    }

    function renderSparkline(container, series, metric) {
        if (!container) { return; }
        var values = seriesValues(series, metric);
        if (!values.length) { container.innerHTML = ''; return; }
        var max = Math.max.apply(null, values) || 1;
        var width = 200;
        var height = 34;
        var path = buildPath(values, max, width, height - 4, 0, 2);
        var last = values.length > 1 ? width : 0;
        container.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" class="an-spark-svg" preserveAspectRatio="none">' +
            '<path class="an-spark-area" d="' + path + ' L' + last + ' ' + height + ' L0 ' + height + ' Z"/>' +
            '<path class="an-spark-line" d="' + path + '"/></svg>';
    }

    function renderRealtimeChart(points) {
        var container = document.getElementById('anRealtimeChart');
        if (!container) { return; }
        if (!points || !points.length) {
            container.innerHTML = '<div class="an-empty an-empty-sm">' + escapeHTML(i18n.noData || 'No data') + '</div>';
            return;
        }
        var values = points.map(function (point) { return point.views || 0; });
        var max = Math.max.apply(null, values) || 1;
        var width = 300;
        var height = 54;
        var barWidth = width / values.length;
        var bars = values.map(function (value, index) {
            var barHeight = Math.max(2, (value / max) * (height - 4));
            return '<rect class="an-rt-bar" x="' + (index * barWidth).toFixed(2) +
                '" y="' + (height - barHeight).toFixed(2) + '" width="' + Math.max(1, barWidth - 1).toFixed(2) +
                '" height="' + barHeight.toFixed(2) + '"><title>' + fmtNum(value) + '</title></rect>';
        }).join('');
        container.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height +
            '" class="an-svg" preserveAspectRatio="none">' + bars + '</svg>';
    }

    function renderDonut(rows) {
        var container = document.getElementById('anDeviceDonut');
        if (!container) { return; }
        var total = (rows || []).reduce(function (sum, row) { return sum + (row.visitors || 0); }, 0);
        if (!total) { container.innerHTML = ''; return; }

        var colors = { desktop: 'var(--an-c1)', mobile: 'var(--an-c2)', tablet: 'var(--an-c3)' };
        var radius = 54;
        var circumference = 2 * Math.PI * radius;
        var offset = 0;
        var segments = rows.map(function (row, index) {
            var share = (row.visitors || 0) / total;
            var length = share * circumference;
            var color = colors[row.key] || 'var(--an-c' + ((index % 5) + 1) + ')';
            var segment = '<circle class="an-donut-seg" cx="70" cy="70" r="' + radius +
                '" stroke="' + color + '" stroke-dasharray="' + length.toFixed(2) + ' ' +
                (circumference - length).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '"/>';
            offset += length;
            return segment;
        }).join('');

        var top = rows[0];
        container.innerHTML = '<svg viewBox="0 0 140 140" class="an-donut-svg">' + segments +
            '<text class="an-donut-value" x="70" y="66" text-anchor="middle">' +
            fmtPct(((top.visitors || 0) / total) * 100) + '</text>' +
            '<text class="an-donut-label" x="70" y="86" text-anchor="middle">' +
            escapeHTML(labelFor('devices', top)) + '</text></svg>';
    }

    function renderHeatmap(cells) {
        var container = document.getElementById('anHeatmap');
        if (!container) { return; }
        if (!cells || !cells.length) {
            container.innerHTML = '<div class="an-empty">' + escapeHTML(i18n.noData || 'No data') + '</div>';
            return;
        }
        var grid = {};
        var max = 0;
        cells.forEach(function (cell) {
            grid[cell.weekday + ':' + cell.hour] = cell.views;
            if (cell.views > max) { max = cell.views; }
        });

        var weekdays = i18n.weekdays || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // MongoDB $dayOfWeek is 1 = Sunday; display Monday first.
        var order = [2, 3, 4, 5, 6, 7, 1];
        var html = ['<div class="an-heat-grid">'];
        html.push('<div class="an-heat-corner"></div>');
        for (var hour = 0; hour < 24; hour++) {
            html.push('<div class="an-heat-hour">' + (hour % 3 === 0 ? hour : '') + '</div>');
        }
        order.forEach(function (weekday) {
            html.push('<div class="an-heat-day">' + escapeHTML(weekdays[weekday - 1]) + '</div>');
            for (var h = 0; h < 24; h++) {
                var value = grid[weekday + ':' + h] || 0;
                var intensity = max ? value / max : 0;
                var level = value === 0 ? 0 : Math.min(4, Math.floor(intensity * 4) + 1);
                html.push('<div class="an-heat-cell an-heat-l' + level + '" title="' +
                    escapeHTML(weekdays[weekday - 1]) + ' ' + h + ':00 — ' + fmtNum(value) + '"></div>');
            }
        });
        html.push('</div>');
        container.innerHTML = html.join('');
    }

    /* ------------------------------------------------------------------ */
    /* Breakdown tables                                                     */
    /* ------------------------------------------------------------------ */

    /* Which filter dimension a table drills down into; null = not filterable. */
    var FILTER_KEYS = {
        channels: 'channel',
        referrers: 'ref_host',
        devices: 'device',
        countries: 'country',
        categories: 'category',
        authors: 'author',
        page_types: 'page_type',
        pages: 'path',
        entry_pages: 'path',
        exit_pages: 'path'
    };

    function renderBarList(containerId, table, rows, options) {
        var container = document.getElementById(containerId);
        if (!container) { return; }
        options = options || {};
        rows = rows || [];
        if (!rows.length) {
            container.innerHTML = '<div class="an-empty">' + escapeHTML(i18n.noData || 'No data') + '</div>';
            return;
        }

        var metric = options.metric || 'views';
        var max = rows.reduce(function (best, row) {
            return Math.max(best, row[metric] || 0);
        }, 0) || 1;
        var filterKey = FILTER_KEYS[table] || null;
        var isPages = table === 'pages' || table === 'entry_pages' || table === 'exit_pages';
        var showBounce = table === 'entry_pages' || table === 'exit_pages';

        var head = '<div class="an-bar-head">' +
            '<span class="an-bar-name">&nbsp;</span>' +
            '<span class="an-bar-col">' + escapeHTML(showBounce ? (i18n.colSessions || 'Sessions') : (i18n.colVisitors || 'Visitors')) + '</span>' +
            '<span class="an-bar-col">' + escapeHTML(i18n.colViews || 'Views') + '</span>' +
            (options.compact ? '' : '<span class="an-bar-col an-bar-col-wide">' +
                escapeHTML(showBounce ? (i18n.colBounce || 'Bounce') : (i18n.colTime || 'Avg. time')) + '</span>') +
            '</div>';

        var body = rows.map(function (row) {
            var share = ((row[metric] || 0) / max) * 100;
            var label = labelFor(table, row) || '—';
            var sub = isPages && row.label && row.label !== row.key ? row.key : '';
            var extra = showBounce ? fmtPct(row.bounce_rate) : fmtDuration(row.avg_engagement_ms);
            return '<div class="an-bar' + (filterKey ? ' is-clickable' : '') + '"' +
                (filterKey ? ' data-filter-key="' + escapeHTML(filterKey) + '" data-filter-value="' + escapeHTML(row.key) + '"' : '') +
                '>' +
                '<span class="an-bar-fill" style="width:' + share.toFixed(1) + '%"></span>' +
                '<span class="an-bar-name" title="' + escapeHTML(row.key) + '">' + escapeHTML(label) +
                (sub ? '<em>' + escapeHTML(sub) + '</em>' : '') + '</span>' +
                '<span class="an-bar-col">' + fmtNum(row.visitors) + '</span>' +
                '<span class="an-bar-col">' + fmtNum(row.views) + '</span>' +
                (options.compact ? '' : '<span class="an-bar-col an-bar-col-wide">' + extra + '</span>') +
                '</div>';
        }).join('');

        container.innerHTML = (options.compact ? '' : head) + body;
    }

    function renderOutbound(rows) {
        var container = document.getElementById('anOutbound');
        if (!container) { return; }
        rows = rows || [];
        if (!rows.length) {
            container.innerHTML = '<div class="an-empty">' + escapeHTML(i18n.noData || 'No data') + '</div>';
            return;
        }
        var max = rows[0].views || 1;
        container.innerHTML = rows.map(function (row) {
            var share = ((row.views || 0) / max) * 100;
            return '<div class="an-bar">' +
                '<span class="an-bar-fill" style="width:' + share.toFixed(1) + '%"></span>' +
                '<span class="an-bar-name"><a href="' + escapeHTML(row.key) + '" target="_blank" rel="noopener nofollow">' +
                escapeHTML(row.key) + '</a></span>' +
                '<span class="an-bar-col">' + fmtNum(row.visitors) + '</span>' +
                '<span class="an-bar-col">' + fmtNum(row.views) + '</span>' +
                '</div>';
        }).join('');
    }

    /* ------------------------------------------------------------------ */
    /* KPI cards                                                            */
    /* ------------------------------------------------------------------ */

    function kpiValue(summary, metric) {
        switch (metric) {
            case 'visitors': return summary.visitors || 0;
            case 'views': return summary.views || 0;
            case 'sessions': return summary.sessions || 0;
            case 'views_per_session': return summary.views_per_session || 0;
            case 'avg_engagement': return summary.avg_engagement_ms || 0;
            case 'engagement_rate': return summary.engagement_rate || 0;
            case 'bounce_rate': return summary.bounce_rate || 0;
            case 'outbound': return summary.outbound || 0;
            default: return 0;
        }
    }

    function kpiDisplay(metric, value) {
        switch (metric) {
            case 'views_per_session': return fmtDecimal(value);
            case 'avg_engagement': return fmtDuration(value);
            case 'engagement_rate':
            case 'bounce_rate': return fmtPct(value);
            default: return fmtNum(value);
        }
    }

    function renderKpis() {
        var report = state.report;
        if (!report) { return; }
        var cards = document.querySelectorAll('#anKpis [data-metric]');

        Array.prototype.forEach.call(cards, function (card) {
            var metric = card.getAttribute('data-metric');
            var current = kpiValue(report.summary, metric);
            var previous = kpiValue(report.previous, metric);

            card.querySelector('[data-role="value"]').textContent = kpiDisplay(metric, current);

            var deltaEl = card.querySelector('[data-role="delta"]');
            if (deltaEl) {
                if (!previous) {
                    deltaEl.textContent = '';
                    deltaEl.className = 'an-delta';
                } else {
                    var change = ((current - previous) / previous) * 100;
                    var invert = deltaEl.getAttribute('data-invert') === '1';
                    var good = invert ? change <= 0 : change >= 0;
                    deltaEl.textContent = (change >= 0 ? '▲ ' : '▼ ') +
                        fmtPct(Math.abs(change)).replace('-', '');
                    deltaEl.className = 'an-delta ' + (Math.abs(change) < 0.05 ? 'is-flat' : good ? 'is-up' : 'is-down');
                    deltaEl.title = i18n.vsPrevious + ': ' + kpiDisplay(metric, previous);
                }
            }

            var spark = card.querySelector('[data-role="spark"]');
            if (spark) { renderSparkline(spark, report.series, metric); }

            var inner = card.querySelector('.an-kpi');
            if (inner) {
                inner.classList.toggle('is-selected', metric === state.metric);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Filters                                                              */
    /* ------------------------------------------------------------------ */

    function dimensionLabel(key) {
        return (i18n.dimensions && i18n.dimensions[key]) || key;
    }

    /* Shows the same readable label in the chip that the table row carried. */
    function filterValueLabel(key, value) {
        if (key === 'channel' && i18n.channels && i18n.channels[value]) { return i18n.channels[value]; }
        if (key === 'device' && i18n.devices && i18n.devices[value]) { return i18n.devices[value]; }
        if (key === 'page_type' && i18n.pageTypes && i18n.pageTypes[value]) { return i18n.pageTypes[value]; }
        if (key === 'country') { return countryName(value); }
        return value;
    }

    function renderFilters() {
        var container = document.getElementById('anFilters');
        if (!container) { return; }
        var keys = Object.keys(state.filter).filter(function (key) { return state.filter[key]; });
        if (!keys.length) {
            container.classList.add('d-none');
            container.innerHTML = '';
            return;
        }
        container.classList.remove('d-none');
        container.innerHTML = keys.map(function (key) {
            return '<span class="an-chip">' + escapeHTML(dimensionLabel(key)) + ': <b>' +
                escapeHTML(filterValueLabel(key, state.filter[key])) + '</b>' +
                '<button type="button" data-clear="' + escapeHTML(key) + '" aria-label="' +
                escapeHTML(i18n.clearFilter || 'Clear') + '">&times;</button></span>';
        }).join('') +
            '<button type="button" class="btn btn-sm btn-link text-decoration-none py-0" data-clear="*">' +
            escapeHTML(i18n.clearFilter || 'Clear') + '</button>';
    }

    /* ------------------------------------------------------------------ */
    /* Data loading                                                         */
    /* ------------------------------------------------------------------ */

    function buildQuery() {
        var params = new URLSearchParams();
        params.set('range', state.range);
        if (state.range === 'custom') {
            params.set('from', state.from);
            params.set('to', state.to);
        }
        Object.keys(state.filter).forEach(function (key) {
            if (state.filter[key]) { params.set(key, state.filter[key]); }
        });
        return params;
    }

    function setLoading(active) {
        var loader = document.getElementById('anLoading');
        if (loader) { loader.classList.toggle('d-none', !active); }
        root.classList.toggle('is-loading', active);
    }

    function loadReport() {
        setLoading(true);
        fetch('/admin/analytics/data?' + buildQuery().toString(), { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) { throw new Error('HTTP ' + response.status); }
                return response.json();
            })
            .then(function (report) {
                state.report = report;
                renderAll();
            })
            .catch(function (error) {
                console.error('analytics load failed', error);
                var chart = document.getElementById('anMainChart');
                if (chart) {
                    chart.innerHTML = '<div class="an-empty">' +
                        escapeHTML(i18n.loadError || 'Failed to load data') + '</div>';
                }
            })
            .finally(function () { setLoading(false); });
    }

    function loadRealtime() {
        fetch('/admin/analytics/realtime', { credentials: 'same-origin' })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (data) {
                if (!data) { return; }
                var active = document.getElementById('anActiveVisitors');
                if (active) { active.textContent = fmtNum(data.active_visitors); }
                renderRealtimeChart(data.per_minute);
                renderBarList('anRealtimePages', 'pages', data.top_pages, { compact: true });
            })
            .catch(function () { /* the realtime strip is best-effort */ });
    }

    function renderAll() {
        var report = state.report;
        if (!report) { return; }
        var breakdowns = report.breakdowns || {};

        renderKpis();
        renderMainChart();
        renderFilters();

        renderBarList('anAcquisition', state.tabs.anAcquisition, breakdowns[state.tabs.anAcquisition]);
        renderBarList('anPages', state.tabs.anPages, breakdowns[state.tabs.anPages]);
        renderBarList('anTech', state.tabs.anTech, breakdowns[state.tabs.anTech]);
        renderBarList('anGeo', state.tabs.anGeo, breakdowns[state.tabs.anGeo]);
        renderBarList('anEditorial', state.tabs.anEditorial || 'categories',
            breakdowns[state.tabs.anEditorial || 'categories']);
        renderBarList('anDevices', 'devices', breakdowns.devices, { compact: true });
        renderDonut(breakdowns.devices);
        renderHeatmap(report.heatmap);
        renderOutbound(breakdowns.outbound);

        var exportLink = document.getElementById('anExport');
        if (exportLink) {
            var params = buildQuery();
            params.set('table', state.tabs.anPages === 'pages' ? 'pages' : state.tabs.anPages);
            exportLink.href = '/admin/analytics/export?' + params.toString();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Events                                                               */
    /* ------------------------------------------------------------------ */

    var rangeGroup = document.getElementById('anRangeGroup');
    if (rangeGroup) {
        rangeGroup.addEventListener('click', function (event) {
            var button = event.target.closest('[data-range]');
            if (!button) { return; }
            state.range = button.getAttribute('data-range');
            Array.prototype.forEach.call(rangeGroup.querySelectorAll('[data-range]'), function (item) {
                item.classList.toggle('active', item === button);
            });
            loadReport();
        });
    }

    var customApply = document.getElementById('anCustomApply');
    if (customApply) {
        customApply.addEventListener('click', function () {
            var from = document.getElementById('anCustomFrom').value;
            var to = document.getElementById('anCustomTo').value;
            if (!from || !to) { return; }
            state.range = 'custom';
            state.from = from;
            state.to = to;
            if (rangeGroup) {
                Array.prototype.forEach.call(rangeGroup.querySelectorAll('[data-range]'), function (item) {
                    item.classList.remove('active');
                });
            }
            loadReport();
        });
    }

    var refresh = document.getElementById('anRefresh');
    if (refresh) {
        refresh.addEventListener('click', function () {
            loadReport();
            loadRealtime();
        });
    }

    var compare = document.getElementById('anCompare');
    if (compare) {
        compare.addEventListener('change', function () {
            state.compare = compare.checked;
            renderMainChart();
        });
    }

    // KPI card selects the charted metric.
    document.addEventListener('click', function (event) {
        var card = event.target.closest('#anKpis [data-metric]');
        if (card) {
            var metric = card.getAttribute('data-metric');
            if (metric === 'visitors' || metric === 'views' || metric === 'sessions') {
                state.metric = metric;
                var title = document.getElementById('anChartTitle');
                if (title) { title.textContent = i18n[metric] || metric; }
                renderKpis();
                renderMainChart();
            }
            return;
        }

        var tab = event.target.closest('.an-tab');
        if (tab) {
            var group = tab.parentElement;
            var targetId = group.getAttribute('data-target');
            Array.prototype.forEach.call(group.querySelectorAll('.an-tab'), function (item) {
                item.classList.toggle('active', item === tab);
            });
            state.tabs[targetId] = tab.getAttribute('data-key');
            var breakdowns = (state.report && state.report.breakdowns) || {};
            renderBarList(targetId, state.tabs[targetId], breakdowns[state.tabs[targetId]]);
            return;
        }

        var clear = event.target.closest('[data-clear]');
        if (clear) {
            var key = clear.getAttribute('data-clear');
            if (key === '*') { state.filter = {}; } else { delete state.filter[key]; }
            loadReport();
            return;
        }

        var bar = event.target.closest('.an-bar.is-clickable');
        if (bar) {
            state.filter[bar.getAttribute('data-filter-key')] = bar.getAttribute('data-filter-value');
            loadReport();
        }
    });

    window.addEventListener('resize', function () {
        clearTimeout(window.__anResize);
        window.__anResize = setTimeout(renderMainChart, 200);
    });

    loadReport();
    loadRealtime();
    setInterval(loadRealtime, 15000);
    setInterval(function () {
        if (!document.hidden) { loadReport(); }
    }, 300000);
})();
