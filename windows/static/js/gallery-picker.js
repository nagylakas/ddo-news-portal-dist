(function () {
  'use strict';
  function insert(target, id) {
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    var text = '```gallery\n' + id + '\n[1-4]\n```';
    var start = el.selectionStart || el.value.length, end = el.selectionEnd || start;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.focus(); el.selectionStart = el.selectionEnd = start + text.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function esc(v) { var e=document.createElement('span'); e.textContent=v||''; return e.innerHTML; }
  window.openGalleryPicker = function (target) {
    var root = document.createElement('div'); root.className = 'modal fade'; root.tabIndex = -1;
    root.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Galéria beszúrása</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><input class="form-control mb-3" type="search" placeholder="Galéria keresése"><div class="list-group"><div class="text-muted">Betöltés…</div></div></div></div></div>';
    document.body.appendChild(root);
    var modal = new bootstrap.Modal(root), list = root.querySelector('.list-group'), search = root.querySelector('input'), galleries = [];
    function draw() {
      var q=search.value.toLowerCase().trim(), visible=galleries.filter(function(g){return !q || (g.title||'').toLowerCase().indexOf(q)>=0;});
      list.innerHTML = visible.length ? visible.map(function(g){var preview=(g.images||[]).slice(0,4).map(function(i){return '<img src="'+esc(i.url)+'" alt="" class="gallery-picker-thumb">';}).join(''); return '<button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-3" data-id="'+esc(g.id)+'"><span class="gallery-picker-previews">'+preview+'</span><span><strong>'+esc(g.title)+'</strong><small class="d-block text-muted">'+(g.images||[]).length+' kép · előnézet: 1–4</small></span></button>';}).join('') : '<div class="text-muted">Nincs találat.</div>';
    }
    search.addEventListener('input', draw);
    list.addEventListener('click', function(e){var row=e.target.closest('[data-id]');if(!row)return;insert(target,row.dataset.id);modal.hide();});
    root.addEventListener('hidden.bs.modal',function(){root.remove();}); modal.show();
    fetch('/admin/galleries/picker').then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(data){galleries=data||[];draw();search.focus();}).catch(function(){list.innerHTML='<div class="text-danger">A galériák nem tölthetők be.</div>';});
  };
}());
