// ForEval Cubage 1.2.01 — carte hors ligne.
// Préchargement des fonds IGN (Plan, Orthophotos, Cadastre) pour la zone affichée.
// Les tuiles sont rangées dans le cache « foreval-tuiles », que le service worker
// sert ensuite sans réseau. Les autres fonds (OSM, Esri, OpenTopoMap, Carto) ne sont
// pas préchargés : leurs conditions d'utilisation interdisent le téléchargement en masse.
// Ils restent disponibles hors ligne pour les zones déjà consultées.
// Ne touche ni aux arbres, ni au moteur, ni aux exports.
(function(){
  'use strict';
  const TILE_CACHE = 'foreval-tuiles';
  const MAX_TILES = 8000;
  const CONCURRENCY = 6;
  const SOURCES = {
    ignPlan:  {label:'IGN Plan', get url(){ return MAP_BASE_LAYERS.ignPlan.url; }, maxZoom:18},
    ignOrtho: {label:'IGN Orthophotos', get url(){ return MAP_BASE_LAYERS.ignOrtho.url; }, maxZoom:19},
    cadastre: {label:'Cadastre', get url(){ return CADASTRE_LAYER.url; }, maxZoom:19}
  };
  let job = null;

  const $ = id => document.getElementById(id);

  function lon2x(lon, z){ return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function lat2y(lat, z){
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }
  function tileUrl(tpl, z, x, y){ return tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y); }

  function selectedSources(){
    return Object.keys(SOURCES).filter(k => $('offline_' + k)?.checked);
  }

  function plan(){
    const map = mapState.map;
    if(!map) return null;
    const b = map.getBounds().pad(0.05);
    const zNow = Math.max(10, Math.min(Math.round(map.getZoom()), 19));
    const zMaxWanted = Number($('offlineMaxZoom')?.value) || 17;
    const urls = [];
    let count = 0;
    selectedSources().forEach(key => {
      const src = SOURCES[key];
      const zMin = Math.max(10, zNow - 2);
      const zMax = Math.min(zMaxWanted, src.maxZoom);
      for(let z = zMin; z <= zMax; z++){
        const x0 = lon2x(b.getWest(), z), x1 = lon2x(b.getEast(), z);
        const y0 = lat2y(b.getNorth(), z), y1 = lat2y(b.getSouth(), z);
        for(let x = x0; x <= x1; x++) for(let y = y0; y <= y1; y++){
          count++;
          if(count <= MAX_TILES) urls.push(tileUrl(src.url, z, x, y));
        }
      }
    });
    return {urls, count, zoom:zNow};
  }

  function setProgress(text, cls){
    const el = $('offlineProgress');
    if(el){ el.textContent = text; el.className = 'offline-progress ' + (cls || 'muted'); }
  }

  function estimate(){
    if(job) return;
    if(!mapState.map){ setProgress('Ouvrez la carte pour préparer une zone.'); return; }
    if(mapState.map.getZoom() < 12){ setProgress('Zoomez sur la propriété (niveau 12 minimum) pour préparer une zone.'); return; }
    const p = plan();
    if(!p) return;
    if(!selectedSources().length){ setProgress('Cochez au moins un fond à enregistrer.'); return; }
    const mo = Math.round(p.count * 0.025 * 10) / 10; // ~25 Ko par tuile en moyenne
    if(p.count > MAX_TILES) setProgress(`Zone trop grande : ${p.count} tuiles (maximum ${MAX_TILES}). Zoomez sur la propriété ou baissez le zoom maximal.`, 'warn');
    else setProgress(`Zone affichée : ${p.count} tuiles, environ ${String(mo).replace('.', ',')} Mo.`);
  }

  async function download(){
    if(job) return;
    if(!('caches' in window)){ alert('Ce navigateur ne permet pas de garder la carte hors ligne.'); return; }
    if(!navigator.onLine){ alert('Pas de réseau : enregistrez la zone avant de partir sur le terrain.'); return; }
    if(!initMap()) return;
    if(mapState.map.getZoom() < 12){ alert('Zoomez d’abord sur la propriété (niveau 12 minimum).'); return; }
    const p = plan();
    if(!selectedSources().length){ alert('Cochez au moins un fond à enregistrer.'); return; }
    if(p.count > MAX_TILES){ alert(`Zone trop grande (${p.count} tuiles, maximum ${MAX_TILES}).\nZoomez sur la propriété ou baissez le zoom maximal.`); return; }
    if(!confirm(`Enregistrer ${p.count} tuiles pour un usage hors ligne ?\nComptez quelques minutes en Wi-Fi.`)) return;

    job = {cancel:false, done:0, failed:0, skipped:0, total:p.urls.length};
    toggleButtons(true);
    const cache = await caches.open(TILE_CACHE);
    let i = 0;
    async function worker(){
      while(!job.cancel && i < p.urls.length){
        const url = p.urls[i++];
        try {
          if(await cache.match(url)){ job.skipped++; }
          else {
            const res = await fetch(url, {mode:'cors', credentials:'omit'});
            if(res.ok) await cache.put(url, res);
            else job.failed++;
          }
        } catch(e){ job.failed++; }
        job.done++;
        if(job.done % 20 === 0 || job.done === job.total) setProgress(`Enregistrement… ${job.done}/${job.total} tuiles${job.failed?` (${job.failed} en échec)`:''}`);
      }
    }
    await Promise.all(Array.from({length:CONCURRENCY}, worker));
    const r = job; job = null;
    toggleButtons(false);
    if(r.cancel) setProgress(`Enregistrement interrompu : ${r.done}/${r.total} tuiles traitées.`, 'warn');
    else if(r.failed) setProgress(`Zone enregistrée avec ${r.failed} tuile(s) manquante(s). Relancez pour compléter.`, 'warn');
    else setProgress(`✓ Zone enregistrée : ${r.total} tuiles disponibles hors ligne.`, 'ok');
    try { await navigator.storage?.persist?.(); } catch(e){}
    refreshCacheInfo();
  }

  function toggleButtons(running){
    const dl = $('offlineDownload'), cancel = $('offlineCancel');
    if(dl) dl.disabled = running;
    if(cancel) cancel.classList.toggle('hidden', !running);
  }

  async function clearCache(){
    if(!('caches' in window)) return;
    if(!confirm('Supprimer toutes les tuiles de carte gardées hors ligne ?\nLes sessions et les arbres ne sont pas touchés.')) return;
    await caches.delete(TILE_CACHE);
    setProgress('Cache carte vidé.');
    refreshCacheInfo();
  }

  async function refreshCacheInfo(){
    const el = $('offlineCacheInfo');
    if(!el || !('caches' in window)) return;
    try {
      const cache = await caches.open(TILE_CACHE);
      const keys = await cache.keys();
      el.textContent = keys.length ? `${keys.length} tuiles gardées sur cet appareil.` : 'Aucune tuile gardée pour l’instant.';
    } catch(e){ el.textContent = ''; }
  }

  function refreshNetwork(){
    const el = $('offlineNetwork');
    if(!el) return;
    if(navigator.onLine){ el.textContent = '🟢 En ligne'; el.className = 'net-pill online'; }
    else { el.textContent = '⚪ Hors ligne : seules les zones enregistrées ou déjà consultées s’affichent'; el.className = 'net-pill offline'; }
  }

  function init(){
    const dl = $('offlineDownload'); if(dl) dl.onclick = download;
    const cancel = $('offlineCancel'); if(cancel) cancel.onclick = () => { if(job) job.cancel = true; };
    const clear = $('offlineClear'); if(clear) clear.onclick = clearCache;
    ['offline_ignPlan','offline_ignOrtho','offline_cadastre','offlineMaxZoom'].forEach(id => { const el = $(id); if(el) el.onchange = estimate; });
    window.addEventListener('online', refreshNetwork);
    window.addEventListener('offline', refreshNetwork);
    refreshNetwork();
    refreshCacheInfo();
    // Estimation à jour quand on déplace la carte.
    const hook = setInterval(() => {
      if(mapState.map){ mapState.map.on('moveend zoomend', estimate); clearInterval(hook); estimate(); }
    }, 1000);
  }

  window.CarteHorsLigne = {init, download, estimate, clearCache, plan};
  init();
})();
