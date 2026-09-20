(function () {
  'use strict';
  var cache = new Map(), opener = null, dialog;
  function close() {
    if (!dialog || dialog.classList.contains('is-closing')) return;
    var closing = dialog; closing.classList.add('is-closing');
    window.setTimeout(function () { if (closing === dialog) { closing.remove(); dialog = null; document.body.classList.remove('gallery-open'); if (opener) opener.focus(); } }, 220);
  }
  function show(images, index, title) {
    index = Math.max(0, Math.min(index, images.length - 1));
    var d = document.createElement('div'); d.className = 'gallery-overlay'; d.setAttribute('role','dialog'); d.setAttribute('aria-modal','true'); d.tabIndex = -1;
    var stage=document.createElement('div'); stage.className='gallery-overlay-stage';
    var image = document.createElement('img'); image.src=images[index].url; image.alt=images[index].alt_text || images[index].title || title || ''; stage.appendChild(image);
    var caption=document.createElement('p'); caption.className='gallery-overlay-caption'; caption.textContent=(index+1)+' / '+images.length+(title ? ' — '+title : '');
    var progress=document.createElement('span'); progress.className='gallery-overlay-progress';
    function refreshProgress(){ progress.style.setProperty('--gallery-progress',((index+1)/images.length*100)+'%'); }
    function move(delta){
      index=(index+delta+images.length)%images.length;
      stage.classList.remove('slide-next','slide-prev'); void stage.offsetWidth;
      stage.classList.add(delta > 0 ? 'slide-next' : 'slide-prev');
      image.src=images[index].url; image.alt=images[index].alt_text||images[index].title||title||'';
      caption.textContent=(index+1)+' / '+images.length+(title?' — '+title:''); refreshProgress();
    }
    var prev=document.createElement('button'); prev.type='button';prev.className='gallery-overlay-prev';prev.textContent='‹';prev.setAttribute('aria-label','Előző kép');prev.onclick=function(){move(-1)};
    var next=document.createElement('button'); next.type='button';next.className='gallery-overlay-next';next.textContent='›';next.setAttribute('aria-label','Következő kép');next.onclick=function(){move(1)};
    var x=document.createElement('button'); x.type='button';x.className='gallery-overlay-close';x.textContent='×';x.setAttribute('aria-label','Bezárás');x.onclick=close;
    refreshProgress(); d.append(x,prev,stage,next,caption,progress); d.addEventListener('click',function(e){if(e.target===d)close()});
    var startX; d.addEventListener('touchstart',function(e){startX=e.changedTouches[0].screenX},{passive:true}); d.addEventListener('touchend',function(e){var dx=e.changedTouches[0].screenX-startX;if(Math.abs(dx)>40)move(dx>0?-1:1)},{passive:true});
    d.addEventListener('keydown',function(e){if(e.key==='Escape')close();if(e.key==='ArrowLeft')move(-1);if(e.key==='ArrowRight')move(1);if(e.key==='Tab'){var f=[x,prev,next];if(e.shiftKey&&document.activeElement===x){e.preventDefault();next.focus()}else if(!e.shiftKey&&document.activeElement===next){e.preventDefault();x.focus()}}});
    document.body.appendChild(d); dialog=d; document.body.classList.add('gallery-open'); requestAnimationFrame(function(){d.classList.add('is-visible')}); x.focus();
  }
  document.addEventListener('click', function(e){ var button=e.target.closest('.content-gallery-item'); if(!button)return; opener=button; var id=button.dataset.galleryId, index=parseInt(button.dataset.galleryIndex||'0',10); var load=cache.get(id); if(!load){load=fetch('/api/galleries/'+encodeURIComponent(id)).then(function(r){if(!r.ok)throw new Error();return r.json()});cache.set(id,load)} load.then(function(g){if(g.images&&g.images.length)show(g.images,index,g.title)}).catch(function(){}); });
}());
