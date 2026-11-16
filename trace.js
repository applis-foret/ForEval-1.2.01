// ForEval Cubage 1.2.01 — module indépendant de trace GPS.
// Ce module ne modifie pas les arbres, les calculs, les tarifs ni les exports Excel.
// 1.2.01 : écran maintenu allumé (veille.js), reprise automatique après mise en veille
// ou rechargement, découpage en segments pour ne pas relier les trous par une ligne droite.
(function(){
  let bridge = null;
  let watchId = null;
  let traceLayer = null;
  let initialized = false;
  let hiddenAt = null;
  const GAP_NEW_SEGMENT_MS = 20000; // au-delà de 20 s d'interruption, on ouvre un nouveau segment

  function ensureTrace(){
    const state = bridge?.getState?.();
    if(!state) return {points:[], minDistance:5};
    state.traceGps ||= {points:[], minDistance:5, startedAt:null, stoppedAt:null};
    state.traceGps.points = Array.isArray(state.traceGps.points) ? state.traceGps.points : [];
    state.traceGps.minDistance = Number(state.traceGps.minDistance) || 5;
    state.traceGps.segment = Number.isInteger(state.traceGps.segment) ? state.traceGps.segment : 0;
    state.traceGps.interruptions = Number(state.traceGps.interruptions) || 0;
    return state.traceGps;
  }

  function validPoints(){
    return ensureTrace().points.filter(p=>Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  }

  function haversine(a,b){
    const R=6371000;
    const toRad=x=>Number(x)*Math.PI/180;
    const lat1=toRad(a.lat), lat2=toRad(b.lat);
    const dLat=toRad(Number(b.lat)-Number(a.lat));
    const dLng=toRad(Number(b.lng)-Number(a.lng));
    const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }

  // Segments : les points sans numéro de segment (traces 1.9.x) appartiennent au segment 0.
  function segmentsOf(points=validPoints()){
    const segs=[]; let cur=null; let curSeg=null;
    points.forEach(p=>{
      const sg=Number.isInteger(p.seg)?p.seg:0;
      if(cur===null || sg!==curSeg){ cur=[]; segs.push(cur); curSeg=sg; }
      cur.push(p);
    });
    return segs;
  }

  function traceDistance(points=validPoints()){
    let total=0;
    segmentsOf(points).forEach(seg=>{ for(let i=1;i<seg.length;i++) total += haversine(seg[i-1], seg[i]); });
    return total;
  }

  function newSegment(){
    const trace=ensureTrace();
    if(trace.points.length){ trace.segment += 1; trace.interruptions += 1; }
  }

  function formatDistance(m){
    if(!Number.isFinite(m)) return '0 m';
    return m>=1000 ? `${(m/1000).toFixed(2).replace('.',',')} km` : `${Math.round(m)} m`;
  }

  function formatDuration(ms){
    if(!Number.isFinite(ms) || ms<=0) return '0 min';
    const min=Math.round(ms/60000);
    const h=Math.floor(min/60), r=min%60;
    return h ? `${h} h ${String(r).padStart(2,'0')}` : `${min} min`;
  }

  function updatePanel(){
    const trace=ensureTrace();
    const points=validPoints();
    const status=document.getElementById('traceRecordingStatus');
    if(status){
      status.textContent = watchId!==null ? 'en cours' : 'arrêtée';
      status.className = watchId!==null ? 'trace-pill recording' : 'trace-pill';
    }
    const select=document.getElementById('traceMinDistance');
    if(select && String(select.value)!==String(trace.minDistance||5)) select.value=String(trace.minDistance||5);
    const stats=document.getElementById('traceStats');
    if(stats){
      const first=points[0]?.time ? Number(points[0].time) : null;
      const last=points[points.length-1]?.time ? Number(points[points.length-1].time) : null;
      const duration=first && last ? formatDuration(last-first) : '0 min';
      const cuts = trace.interruptions ? ` — Interruptions : ${trace.interruptions}` : '';
      stats.textContent = points.length ? `Distance : ${formatDistance(traceDistance(points))} — Temps : ${duration} — Points : ${points.length}${cuts}` : 'Trace non démarrée.';
    }
    const wake=document.getElementById('traceWakeStatus');
    if(wake){
      const ws=window.EcranActif?.state?.();
      if(watchId===null){ wake.textContent=''; wake.className='trace-wake muted'; }
      else if(ws?.active){ wake.textContent='🔆 Écran maintenu allumé. Ne verrouillez pas l’iPad avec le bouton : iOS coupe alors le GPS.'; wake.className='trace-wake ok'; }
      else { wake.textContent='⚠️ Impossible de garder l’écran allumé : touchez l’écran, ou réglez Luminosité > Verrouillage auto sur « Jamais ».'; wake.className='trace-wake warn'; }
    }
  }

  function renderTrace(){
    if(!bridge || typeof L==='undefined') return;
    const map = bridge.getMap?.();
    if(!map) return;
    const show = bridge.mapOverlayChecked ? bridge.mapOverlayChecked('mapOverlayTrace', true) : true;
    if(!show){
      if(traceLayer && map.hasLayer(traceLayer)) map.removeLayer(traceLayer);
      updatePanel();
      return;
    }
    const latLngs=segmentsOf().map(seg=>seg.map(p=>[Number(p.lat),Number(p.lng)]));
    if(!traceLayer){
      traceLayer = L.polyline(latLngs, {color:'#4DA6CB', weight:4, opacity:.95, lineCap:'round', lineJoin:'round'}).addTo(map);
    }else{
      traceLayer.setLatLngs(latLngs);
      if(!map.hasLayer(traceLayer)) traceLayer.addTo(map);
    }
    updatePanel();
  }

  function recordPosition(position){
    const c=position?.coords;
    if(!c) return;
    const trace=ensureTrace();
    const point={lat:Number(c.latitude), lng:Number(c.longitude), accuracy:Number(c.accuracy)||'', time:Date.now(), seg:trace.segment};
    if(!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    const last=trace.points[trace.points.length-1];
    const minDistance=Number(trace.minDistance)||5;
    if(last && (Number.isInteger(last.seg)?last.seg:0)===point.seg && haversine(last, point) < minDistance) return;
    trace.points.push(point);
    bridge.save?.();
    renderTrace();
  }

  function startWatch(){
    if(watchId!==null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(recordPosition, err=>{
      bridge.showFeedback?.(`GPS trace : ${err?.message || 'position indisponible'}`);
    }, {enableHighAccuracy:true, maximumAge:1000, timeout:15000});
  }

  function start(){
    if(watchId!==null){ bridge.showFeedback?.('Trace déjà en cours'); return; }
    if(!navigator.geolocation){ alert('GPS indisponible sur cet appareil.'); return; }
    const trace=ensureTrace();
    trace.startedAt ||= new Date().toISOString();
    trace.stoppedAt = null;
    newSegment();               // une reprise après « Arrêter » ne relie pas les deux parcours
    if(trace.interruptions && trace.points.length) trace.interruptions -= 1; // arrêt volontaire : pas une interruption
    trace.recording = true;
    startWatch();
    window.EcranActif?.enable?.().then(updatePanel);
    bridge.save?.();
    updatePanel();
    bridge.showFeedback?.('▶ Trace démarrée');
  }

  // Reprise automatique : appli rechargée ou tuée par iOS pendant l'enregistrement.
  function resume(){
    if(watchId!==null || !navigator.geolocation) return;
    const trace=ensureTrace();
    newSegment();
    startWatch();
    window.EcranActif?.enable?.().then(updatePanel);
    bridge.save?.();
    updatePanel();
    bridge.showFeedback?.('▶ Trace reprise automatiquement');
  }

  function stop(){
    if(watchId!==null){
      navigator.geolocation.clearWatch(watchId);
      watchId=null;
      const trace=ensureTrace();
      trace.stoppedAt = new Date().toISOString();
      trace.recording = false;
      bridge.save?.();
      bridge.showFeedback?.('■ Trace arrêtée');
    }
    window.EcranActif?.disable?.();
    updatePanel();
  }

  // Fermeture de la page : on coupe le GPS mais on garde « en cours » pour reprendre au prochain lancement.
  function suspend(){
    if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  }

  function onVisibility(){
    if(document.visibilityState==='hidden'){ hiddenAt=Date.now(); return; }
    const trace=ensureTrace();
    if(!trace.recording){ hiddenAt=null; return; }
    const gap = hiddenAt ? Date.now()-hiddenAt : 0;
    hiddenAt=null;
    if(gap>GAP_NEW_SEGMENT_MS) newSegment();
    startWatch(); // iOS laisse parfois une surveillance GPS figée après la veille
    bridge.save?.();
    renderTrace();
  }

  function clear(){
    const trace=ensureTrace();
    if(trace.points.length && !confirm('Effacer la trace de parcours de cette session ?')) return;
    trace.points=[];
    trace.startedAt=watchId!==null ? new Date().toISOString() : null;
    trace.stoppedAt=null;
    trace.segment=0;
    trace.interruptions=0;
    bridge.save?.();
    renderTrace();
    bridge.showFeedback?.('Trace effacée');
  }

  function buildTraceGeoJson(){
    const state=bridge.getState?.() || {};
    const points=validPoints();
    const feature={
      type:'Feature',
      geometry:(()=>{
        const segs=segmentsOf(points).filter(sg=>sg.length>=2).map(sg=>sg.map(p=>[Number(p.lng),Number(p.lat)]));
        return segs.length===1 ? {type:'LineString', coordinates:segs[0]} : {type:'MultiLineString', coordinates:segs};
      })(),
      properties:{
        type:'trace_parcours',
        chantier:state.chantier || state.name || '',
        points:points.length,
        distance_m:Math.round(traceDistance(points)),
        segments:segmentsOf(points).length,
        interruptions:ensureTrace().interruptions||0,
        started_at:ensureTrace().startedAt || '',
        stopped_at:ensureTrace().stoppedAt || ''
      }
    };
    return JSON.stringify({type:'FeatureCollection', name:bridge.safeFileName?.(state.chantier||state.name||'Trace ForEval') || 'Trace ForEval', features:points.length>=2?[feature]:[]}, null, 2);
  }

  function buildTraceGpx(){
    const state=bridge.getState?.() || {};
    const name=bridge.xmlText?.(state.chantier || state.name || 'Trace ForEval Cubage') || 'Trace ForEval Cubage';
    const trkpt=p=>`<trkpt lat="${Number(p.lat)}" lon="${Number(p.lng)}"><time>${new Date(Number(p.time)||Date.now()).toISOString()}</time>${p.accuracy!==''?`<extensions><precision>${p.accuracy}</precision></extensions>`:''}</trkpt>`;
    const segs=segmentsOf().map(sg=>`<trkseg>${sg.map(trkpt).join('\n')}</trkseg>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ForEval Cubage" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${name}</name></metadata><trk><name>${name}</name>${segs}</trk></gpx>`;
  }

  function exportGeoJson(){
    const points=validPoints();
    if(points.length<2){ alert('Export impossible : la trace doit contenir au moins deux points.'); return; }
    bridge.downloadTextFile?.(buildTraceGeoJson(), bridge.buildExportFileName?.('trace_parcours','geojson') || 'trace_parcours.geojson', 'application/geo+json;charset=utf-8');
    bridge.showFeedback?.('Trace GeoJSON exportée');
  }

  function exportGpx(){
    const points=validPoints();
    if(points.length<2){ alert('Export impossible : la trace doit contenir au moins deux points.'); return; }
    bridge.downloadTextFile?.(buildTraceGpx(), bridge.buildExportFileName?.('trace_parcours','gpx') || 'trace_parcours.gpx', 'application/gpx+xml;charset=utf-8');
    bridge.showFeedback?.('Trace GPX exportée');
  }

  function init(b){
    if(initialized) return;
    bridge=b;
    initialized=true;
    const startBtn=document.getElementById('traceStart'); if(startBtn) startBtn.onclick=start;
    const stopBtn=document.getElementById('traceStop'); if(stopBtn) stopBtn.onclick=stop;
    const clearBtn=document.getElementById('traceClear'); if(clearBtn) clearBtn.onclick=clear;
    const geoBtn=document.getElementById('traceExportGeoJson'); if(geoBtn) geoBtn.onclick=exportGeoJson;
    const gpxBtn=document.getElementById('traceExportGpx'); if(gpxBtn) gpxBtn.onclick=exportGpx;
    const dist=document.getElementById('traceMinDistance');
    if(dist){
      dist.value=String(ensureTrace().minDistance||5);
      dist.onchange=()=>{ ensureTrace().minDistance=Number(dist.value)||5; bridge.save?.(); updatePanel(); };
    }
    const overlay=document.getElementById('mapOverlayTrace'); if(overlay) overlay.onchange=renderTrace;
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', onVisibility);
    window.EcranActif?.onChange?.(updatePanel);
    updatePanel();
    if(ensureTrace().recording) setTimeout(resume, 300);
  }

  window.TraceManager = {init, start, stop, clear, resume, renderTrace, exportGeoJson, exportGpx, buildTraceGeoJson, buildTraceGpx, segmentsOf, traceDistance, isRecording:()=>watchId!==null};
})();
