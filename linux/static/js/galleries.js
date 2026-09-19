(function () {
  'use strict';
  var cache = new Map(), opener = null, dialog;
  function close() { if (!dialog) return; dialog.remove(); dialog = null; document.body.classList.remove('gallery-open'); if (opener) opener.focus(); }
  function show(images, index, title) {
    index = Math.max(0, Math.min(index, images.length - 1));
    var d = document.createElement('div'); d.className = 'gallery-overlay'; d.setAttribute('role','dialog'); d.setAttribute('aria-modal','true'); d.tabIndex = -1;
    var image = document.createElement('img'); image.src=images[index].url; image.alt=images[index].alt_text || images[index].title || title || '';
    var caption=document.createElement('p'); caption.className='gallery-overlay-caption'; caption.textContent=(index+1)+' / '+images.length+(title ? ' — '+title : '');
    function move(delta){ index=(index+delta+images.length)%images.length; image.src=images[index].url; image.alt=images[index].alt_text||images[index].title||title||''; caption.textContent=(index+1)+' / '+images.length+(title?' — '+title:''); }
    var prev=document.createElement('button'); prev.type='button';prev.className='gallery-overlay-prev';prev.textContent='‹';prev.setAttribute('aria-label','Előző kép');prev.onclick=function(){move(-1)};
    var next=document.createElement('button'); next.type='button';next.className='gallery-overlay-next';next.textContent='›';next.setAttribute('aria-label','Következő kép');next.onclick=function(){move(1)};
    var x=document.createElement('button'); x.type='button';x.className='gallery-overlay-close';x.textContent='×';x.setAttribute('aria-label','Bezárás');x.onclick=close;
    d.append(x,prev,image,next,caption); d.addEventListener('click',function(e){if(e.target===d)close()});
    var startX; d.addEventListener('touchstart',function(e){startX=e.changedTouches[0].screenX},{passive:true}); d.addEventListener('touchend',function(e){var dx=e.changedTouches[0].screenX-startX;if(Math.abs(dx)>40)move(dx>0?-1:1)},{passive:true});
    d.addEventListener('keydown',function(e){if(e.key==='Escape')close();if(e.key==='ArrowLeft')move(-1);if(e.key==='ArrowRight')move(1);if(e.key==='Tab'){var f=[x,prev,next];if(e.shiftKey&&document.activeElement===x){e.preventDefault();next.focus()}else if(!e.shiftKey&&document.activeElement===next){e.preventDefault();x.focus()}}});
    document.body.appendChild(d); dialog=d; document.body.classList.add('gallery-open'); x.focus();
  }
  document.addEventListener('click', function(e){ var button=e.target.closest('.content-gallery-item'); if(!button)return; opener=button; var id=button.dataset.galleryId, index=parseInt(button.dataset.galleryIndex||'0',10); var load=cache.get(id); if(!load){load=fetch('/api/galleries/'+encodeURIComponent(id)).then(function(r){if(!r.ok)throw new Error();return r.json()});cache.set(id,load)} load.then(function(g){if(g.images&&g.images.length)show(g.images,index,g.title)}).catch(function(){}); });
}());
