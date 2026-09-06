(function () {
    'use strict';
    var cache = new Map();
    var esc = function (s) { var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; };
    function load(id) {
        if (!cache.has(id)) cache.set(id, fetch('/api/polls/'+encodeURIComponent(id), {credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error();return r.json();}));
        return cache.get(id);
    }
    function resultHTML(p) {
        var rows=p.options.map(function(o){return '<div class="poll-result"><div class="d-flex justify-content-between"><span>'+esc(o.text)+'</span><span>'+o.count+' ('+o.percent.toFixed(1)+'%)</span></div><div class="progress" role="progressbar" aria-valuenow="'+o.percent+'" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:'+Math.min(100,o.percent)+'%"></div></div></div>';}).join('');
        return '<div class="poll-results">'+rows+'<p class="small text-muted mt-2 mb-0">Szavazók száma: '+p.voter_count+(p.mode==='multiple'?' · Több válasz is jelölhető, ezért az összeg 100% fölé kerülhet.':'')+'</p></div>';
    }
    function render(el,p) {
        var end=new Date(p.ends_at).toLocaleString();
        var h='<section class="poll-card" aria-labelledby="poll-title-'+p.id+'"><h3 id="poll-title-'+p.id+'">'+esc(p.title)+'</h3>'+(p.description?'<p>'+esc(p.description)+'</p>':'')+'<p class="small text-muted">Zárás: '+esc(end)+'</p>';
        if (p.status==='scheduled') h+='<div class="alert alert-info">A szavazás még nem indult el.</div>';
        else if (p.can_vote) {
            h+='<form class="poll-form"><fieldset><legend class="visually-hidden">'+esc(p.title)+'</legend>';
            p.options.forEach(function(o){var checked=(p.selected||[]).indexOf(o.id)>=0?' checked':'';var type=p.mode==='single'?'radio':'checkbox';h+='<div class="form-check"><input class="form-check-input" type="'+type+'" name="poll-option" value="'+o.id+'" id="poll-'+p.id+'-'+o.id+'"'+checked+'><label class="form-check-label" for="poll-'+p.id+'-'+o.id+'">'+esc(o.text)+'</label></div>';});
            if(p.mode==='multiple')h+='<p class="small text-muted mt-2">Jelöljön meg legalább '+p.min_choices+', legfeljebb '+p.max_choices+' választ.</p>';
            h+='<button class="btn btn-primary mt-2" type="submit">'+(p.has_voted?'Szavazat módosítása':'Szavazás')+'</button><div class="poll-message mt-2" aria-live="polite"></div></fieldset></form>';
        } else if (!p.logged_in && p.status==='active') h+='<a class="btn btn-primary" href="'+esc(p.login_url)+'">Bejelentkezés a szavazáshoz</a>';
        if(p.results_visible)h+=resultHTML(p); else if(p.status==='closed')h+='<div class="alert alert-secondary">A szavazás lezárult.</div>';
        h+='</section>';el.innerHTML=h;
        var form=el.querySelector('form');if(form)form.addEventListener('submit',function(ev){ev.preventDefault();submit(el,p,form);});
    }
    function submit(el,p,form){var selected=Array.prototype.map.call(form.querySelectorAll('input:checked'),function(x){return x.value;});var msg=form.querySelector('.poll-message');if(selected.length<p.min_choices||selected.length>p.max_choices){msg.textContent='A kijelölt válaszok száma nem megfelelő.';return;}var btn=form.querySelector('button');btn.disabled=true;fetch('/api/polls/'+p.id+'/vote',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({option_ids:selected})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Hiba');return j;});}).then(function(next){cache.set(p.id,Promise.resolve(next));document.querySelectorAll('.poll-embed[data-poll-id="'+p.id+'"]').forEach(function(node){render(node,next);});}).catch(function(e){msg.textContent=e.message;btn.disabled=false;});}
    document.querySelectorAll('.poll-embed[data-poll-id]').forEach(function(el){load(el.dataset.pollId).then(function(p){render(el,p);}).catch(function(){el.innerHTML='<div class="alert alert-secondary">Ez a szavazás nem érhető el.</div>';});});
})();
