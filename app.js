// ForEval Cubage — base saine avec feuille Tarifs dédiée et moteur de cubage sécurisé.
// 1.2.01 : carte hors ligne, stockage IndexedDB, mises à jour maîtrisées, trace GPS résistante à la veille.
// Moteur de cubage, tarifs et exports inchangés depuis 1.9.6.
const APP_VERSION = 'foreval-cubage-1.2.01';
const SESSION_SCHEMA_VERSION = 17;
const ESSENCE_GROUPS = Object.freeze({ FEUILLU:'feuillu', RESINEUX:'resineux' });
const CUBAGE_METHODS = Object.freeze({
  ADRIAN_II:'adrianII',
  ADRIAN_I:'adrianI',
  SCHAEFFER_RAPIDE:'schaefferRapide',
  TABLE_CUBAGE:'tableCubage'
});

// --- CORE / FILENAME MANAGER ---
function safeFileName(name){
  return String(name || 'ForEval_Cubage')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._ -]/g,'_')
    .replace(/\s+/g,'_')
    .replace(/_+/g,'_')
    .replace(/^[_ .-]+|[_ .-]+$/g,'')
    .slice(0,80) || 'ForEval_Cubage';
}
function buildExportFileName(suffix, extension){
  const base=safeFileName(state?.chantier || state?.name || 'cubage');
  return `ForEval_Cubage_${base}_${suffix}.${extension}`;
}
// Tarifs Schaeffer rapides : détermination par V45, session par session.
// V45 est le volume moyen d'un arbre de 45 cm, estimé à partir de la hauteur moyenne de découpe :
// V45 = 0,4 × 0,45² × H = 0,081 × H.
const FEUILLUS_TARIFF_CATALOG = Object.freeze({
  ADRIAN_I:{label:'Adrian I', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js ; utilisée notamment pour la qualité supérieure du chêne.'},
  ADRIAN_II:{label:'Adrian II', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js ; tarif feuillu par défaut.'},
  ADRIAN_IV:{label:'Adrian IV', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js.'},
  CHAUDE_8:{label:'Chaudé 8', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js.'},
  CHAUDE_9:{label:'Chaudé 9', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js.'},
  CHAUDE_10:{label:'Chaudé 10', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js.'},
  CHAUDE_11:{label:'Chaudé 11', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js.'},
  CHAUDE_12:{label:'Chaudé 12', status:'active', input:'diametre_hauteur', note:'Table intégrée dans tarifs.js.'}
});
const SCHAEFFER_V45_TABLE = Object.freeze(Array.from({length:20},(_,i)=>({tariffNumber:i+1, v45:Number((0.9+i*0.1).toFixed(1))})));
const DEFAULT_RESINEUX_HEIGHT45 = Object.freeze({});
function emptyResineuxSettings(){return Object.fromEntries(RESINEUX.map(e=>[e,{method:CUBAGE_METHODS.SCHAEFFER_RAPIDE, tableTariffKey:'ADRIAN_II', height45:null, autoV45:null, v45:null, autoTariffNumber:null, manualTariffNumber:null, tariffNumber:null}]));}
function emptyFeuillusTarifs(){return Object.fromEntries(FEUILLUS.map(e=>[e,'ADRIAN_II']));}
const FEUILLUS = Object.freeze([
  "Alisier torminal",
  "Aulne glutineux",
  "Bouleau",
  "Charme",
  "Châtaignier",
  "Chêne",
  "Chêne rouge d’Amérique",
  "Cormier",
  "Érable champêtre",
  "Érable plane",
  "Érable sycomore",
  "Frêne",
  "Hêtre",
  "Merisier",
  "Noyer",
  "Orme",
  "Peuplier",
  "Robinier faux-acacia",
  "Saule",
  "Sorbier des oiseleurs",
  "Tilleul",
  "Tremble"
]);
const RESINEUX = Object.freeze([
  "Cèdre de l’Atlas",
  "Cèdre de l’Himalaya",
  "Cyprès de Lawson",
  "Douglas",
  "Épicéa commun",
  "Épicéa de Sitka",
  "Mélèze d’Europe",
  "Mélèze hybride",
  "Mélèze du Japon",
  "Pin laricio",
  "Pin maritime",
  "Pin noir d’Autriche",
  "Pin sylvestre",
  "Pin Weymouth",
  "Sapin de Nordmann",
  "Sapin grandis",
  "Sapin pectiné",
  "Séquoia géant",
  "Séquoia toujours vert",
  "Thuya géant"
]);
const ALL_ESSENCES = Object.freeze([...FEUILLUS, ...RESINEUX]);
const ESSENCE_ALIASES = Object.freeze({
  "Pin Laricio":"Pin laricio",
  "Sapin de Vancouver":"Sapin grandis",
  "Sapin de Vancouver / Sapin grandis":"Sapin grandis"
});
function canonicalEssenceName(essence){return ESSENCE_ALIASES[essence] || essence;}
function sanitizeProjectEssences(list, trees=[]){
  const incoming=(list||[]).map(canonicalEssenceName).filter(e=>ALL_ESSENCES.includes(e));
  const used=(trees||[]).map(t=>canonicalEssenceName(t?.essence)).filter(e=>ALL_ESSENCES.includes(e));
  // Si une ancienne version d’essai a affiché toute la bibliothèque, on nettoie la session.
  // Sinon, on conserve les essences ajoutées volontairement via le bouton +.
  const source = incoming.length>12 ? DEFAULT_PROJECT_ESSENCES : incoming;
  const keep=new Set([...DEFAULT_PROJECT_ESSENCES, ...source, ...used]);
  return Array.from(keep);
}
const ESSENCE_CONFIG = Object.freeze(Object.fromEntries([
  ...FEUILLUS.map(label=>[label,{label, group:ESSENCE_GROUPS.FEUILLU, cubageType:'doubleEntry'}]),
  ...RESINEUX.map(label=>[label,{label, group:ESSENCE_GROUPS.RESINEUX, cubageType:'configurable', cubageMethod:CUBAGE_METHODS.SCHAEFFER_RAPIDE}])
]));
const DEFAULT_PROJECT_ESSENCES = ["Chêne","Frêne","Châtaignier"];
const DEFAULT_QUALITES = ["déclassé","sec","chauffage","câblage","chablis volis","bordure","Gélif"];
const DEFAULT_VISIBLE_QUALITES = ["déclassé","sec","chauffage"];
const DIAMETRES = [15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120,125];
const HAUTEURS = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,20,22,24,26,28];
const SUP_HAUTEURS = [2,3,4,5,6,7,8,9,10,12];
const TEMPLATE_FILE = 'modele-cubage-feuillus.xlsx';
const RESINEUX_TEMPLATE_FILE = 'modele-cubage-resineux.xlsx';
const XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const SESSIONS_KEY='forevalCubageSessionsV1';
const ACTIVE_SESSION_KEY='forevalCubageActiveSessionV1';
const GLOVE_MODE_KEY='forevalCubageRainMode';
const BIG_FINGERS_MODE_KEY='forevalCubageBigFingersMode';
const GPS_MODE_KEY='forevalCubageGpsEnabled';
const KEEP_DIMENSIONS_MODE_KEY='forevalCubageKeepDimensionsMode';
function uid(){return 's_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}
function blankSession(name='Nouvelle session'){
  const now=new Date().toISOString();
  return {id:uid(), schemaVersion:SESSION_SCHEMA_VERSION, appVersion:APP_VERSION, name, chantier:name, martelage:'', observations:'', libre:'', parcelles:[], trees:[], traceGps:{points:[], minDistance:5, startedAt:null, stoppedAt:null}, locked:false, exportHistory:[], projectEssences:[...DEFAULT_PROJECT_ESSENCES], customQualites:[], resineuxSettings:emptyResineuxSettings(), feuillusTarifs:emptyFeuillusTarifs(), createdAt:now, updatedAt:now};
}
function normalizeSession(st){
  st ||= blankSession();
  st.schemaVersion = SESSION_SCHEMA_VERSION;
  st.appVersion = APP_VERSION;
  st.trees ||= [];
  st.traceGps ||= {points:[], minDistance:5, startedAt:null, stoppedAt:null};
  st.traceGps.points = Array.isArray(st.traceGps.points) ? st.traceGps.points.filter(p=>Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng))) : [];
  st.traceGps.minDistance = Number(st.traceGps.minDistance) || 5;
  st.projectEssences = sanitizeProjectEssences(st.projectEssences, st.trees);
  st.customQualites ||= [];
  st.parcelles ||= [];
  st.resineuxSettings = normalizeResineuxSettings(st.resineuxSettings);
  st.feuillusTarifs = normalizeFeuillusTarifs(st.feuillusTarifs);
  st.locked = !!st.locked;
  st.exportHistory ||= [];
  st.martelage ||= '';
  st.observations ||= '';
  st.libre ||= '';
  st.chantier ||= st.name || '';
  st.name ||= st.chantier || 'Session sans nom';
  st.trees.forEach((t,i)=>{ if(!t.numero) t.numero=i+1; t.essence = canonicalEssenceName(t.essence); t.commentaire = t.commentaire || ''; normalizeTreeGps(t); });
  return st;
}
function loadSessions(){
  let list=[];
  // 1.2.01 : les sessions viennent d'abord du stockage durable (storage.js, IndexedDB + miroir).
  if(Array.isArray(window.FEStore?.bootSessions) && window.FEStore.bootSessions.length){
    list=window.FEStore.bootSessions;
  }else{
    // Lecture directe : si le contenu est illisible, il a déjà été mis en quarantaine par storage.js.
    try{list=JSON.parse(localStorage.getItem(SESSIONS_KEY)||'[]')||[];}catch(e){list=[];}
    if(!Array.isArray(list)) list=[];
  }
  if(!list.length){
    let old=null;
    try{old=JSON.parse(localStorage.getItem('cubageV12') || localStorage.getItem('cubageV11') || localStorage.getItem('cubageV10') || localStorage.getItem('cubageV9') || '{}');}catch(e){old=null;}
    if(old && (old.trees?.length || old.chantier)){old.id=uid(); old.name=old.chantier||'Ancienne session'; old.createdAt=old.createdAt||new Date().toISOString(); old.updatedAt=new Date().toISOString(); list=[normalizeSession(old)];}
    else list=[blankSession('Nouvelle session')];
  }
  return list.map(normalizeSession);
}
function makeEmptySelection(){return {parcelle:null, essence:null, diametre:null, hauteur:null, qualite:[], commentaire:'', hasSup:false, supHauteur:null};}
function normalizeSelection(sel={}){return {...makeEmptySelection(), ...sel, qualite:normalizeQualites(sel.qualite)};}
const appState={selection:makeEmptySelection(), editingTreeIndex:null};
function setSelection(next){appState.selection=normalizeSelection(next); current=appState.selection; return current;}
function patchSelection(patch){return setSelection({...appState.selection, ...patch});}
function setEditIndex(index){appState.editingTreeIndex=index; editIndex=index;}
function resetSelection(){setSelection(makeEmptySelection()); setEditIndex(null);}
function getEssenceMeta(essence){const canonical=canonicalEssenceName(essence); return ESSENCE_CONFIG[canonical] || {label:canonical||'', group:ESSENCE_GROUPS.FEUILLU, cubageType:'doubleEntry'};}
function isFeuilluEssence(essence){return getEssenceMeta(essence).group===ESSENCE_GROUPS.FEUILLU;}
function isResineuxEssence(essence){return getEssenceMeta(essence).group===ESSENCE_GROUPS.RESINEUX;}
function normalizeResineuxSettings(settings={}){
  const out=emptyResineuxSettings();
  RESINEUX.forEach(e=>{
    const src=settings?.[e] || {};
    const method=src.method===CUBAGE_METHODS.TABLE_CUBAGE ? CUBAGE_METHODS.TABLE_CUBAGE : CUBAGE_METHODS.SCHAEFFER_RAPIDE;
    const tableTariffKey=FEUILLUS_TARIFF_CATALOG[src.tableTariffKey] ? src.tableTariffKey : 'ADRIAN_II';
    const h=src.height45 ?? src.hauteur45 ?? null;
    const normalized=computeSchaefferFromHeight45(h);
    const manualRaw=src.manualTariffNumber ?? src.manualTariff ?? null;
    const manual=isSchaefferTariffNumber(Number(manualRaw)) ? Number(manualRaw) : null;
    const activeTariff=manual || normalized.tariffNumber || null;
    const manualV45=manual ? schaefferV45FromTariffNumber(manual) : null;
    const activeV45=manualV45 || normalized.v45 || null;
    out[e]={method, tableTariffKey, height45:normalized.height45, autoV45:normalized.autoV45 || normalized.v45 || null, v45:activeV45, autoTariffNumber:normalized.tariffNumber, manualTariffNumber:manual, tariffNumber:activeTariff};
  });
  return out;
}
function getResineuxSetting(essence){
  state.resineuxSettings = normalizeResineuxSettings(state.resineuxSettings);
  return state.resineuxSettings?.[essence] || emptyResineuxSettings()[essence];
}
function getResineuxCubageMethod(essence){return getResineuxSetting(essence)?.method || CUBAGE_METHODS.SCHAEFFER_RAPIDE;}
function isResineuxSchaefferMode(essence){return getResineuxCubageMethod(essence)===CUBAGE_METHODS.SCHAEFFER_RAPIDE;}
function isResineuxTableMode(essence){return getResineuxCubageMethod(essence)===CUBAGE_METHODS.TABLE_CUBAGE;}
function getResineuxTableTarif(essence){return getResineuxSetting(essence)?.tableTariffKey || 'ADRIAN_II';}
function setResineuxCubageMethod(essence, value){
  if(guardLocked('modifier le mode de cubage résineux')) return;
  state.resineuxSettings = normalizeResineuxSettings(state.resineuxSettings);
  const st=state.resineuxSettings[essence] || {};
  st.method=value===CUBAGE_METHODS.TABLE_CUBAGE ? CUBAGE_METHODS.TABLE_CUBAGE : CUBAGE_METHODS.SCHAEFFER_RAPIDE;
  state.resineuxSettings[essence]=st;
  save(); render();
}
function setResineuxTableTarif(essence, value){
  if(guardLocked('modifier le tarif résineux')) return;
  state.resineuxSettings = normalizeResineuxSettings(state.resineuxSettings);
  const st=state.resineuxSettings[essence] || {};
  st.tableTariffKey=FEUILLUS_TARIFF_CATALOG[value] ? value : 'ADRIAN_II';
  state.resineuxSettings[essence]=st;
  save(); render();
}
function normalizeFeuillusTarifs(settings={}){
  const out=emptyFeuillusTarifs();
  FEUILLUS.forEach(e=>{
    const key=settings?.[e] || 'ADRIAN_II';
    out[e]=FEUILLUS_TARIFF_CATALOG[key] ? key : 'ADRIAN_II';
  });
  return out;
}
function getFeuillusTarif(essence){
  state.feuillusTarifs = normalizeFeuillusTarifs(state.feuillusTarifs);
  return state.feuillusTarifs?.[essence] || 'ADRIAN_II';
}
function setFeuillusTarif(essence, value){
  if(guardLocked('modifier les tarifs feuillus')) return;
  state.feuillusTarifs = normalizeFeuillusTarifs(state.feuillusTarifs);
  state.feuillusTarifs[essence]=FEUILLUS_TARIFF_CATALOG[value] ? value : 'ADRIAN_II';
  save();
  render();
}
function computeSchaefferFromHeight45(height45){
  const h=Number(String(height45 ?? '').replace(',','.'));
  if(!Number.isFinite(h) || h<=0) return {height45:null, v45:null, tariffNumber:null, autoV45:null};
  const v45=0.4*Math.pow(0.45,2)*h;
  const nearest=SCHAEFFER_V45_TABLE.reduce((best,row)=>Math.abs(row.v45-v45)<Math.abs(best.v45-v45)?row:best,SCHAEFFER_V45_TABLE[0]);
  return {height45:h, v45:Number(v45.toFixed(3)), autoV45:Number(v45.toFixed(3)), tariffNumber:nearest.tariffNumber, autoTariffNumber:nearest.tariffNumber};
}
function schaefferV45FromTariffNumber(tariffNumber){
  const row=SCHAEFFER_V45_TABLE.find(r=>r.tariffNumber===Number(tariffNumber));
  return row ? row.v45 : null;
}
function resineuxTariffForEssence(essence){
  if(!isResineuxEssence(essence) || !isResineuxSchaefferMode(essence)) return null;
  const setting=getResineuxSetting(essence);
  if(!setting || !isSchaefferTariffNumber(setting.tariffNumber)) return null;
  return {method:CUBAGE_METHODS.SCHAEFFER_RAPIDE, tariffNumber:setting.tariffNumber, height45:setting.height45, v45:setting.v45, autoV45:setting.autoV45, manualTariffNumber:setting.manualTariffNumber, label:`Schaeffer rapide n°${setting.tariffNumber} — V45 actif ${m3(setting.v45)} m³${setting.manualTariffNumber?' — correction manuelle':''}`};
}
function resineuxTableTariffForEssence(essence){
  if(!isResineuxEssence(essence) || !isResineuxTableMode(essence)) return null;
  const key=getResineuxTableTarif(essence);
  const meta=FEUILLUS_TARIFF_CATALOG[key] || FEUILLUS_TARIFF_CATALOG.ADRIAN_II;
  return {method:CUBAGE_METHODS.TABLE_CUBAGE, tariffKey:key, label:`${meta.label} — table diamètre × hauteur`};
}
function setResineuxHeight45(essence, value){
  if(guardLocked('modifier les tarifs résineux')) return;
  state.resineuxSettings = normalizeResineuxSettings(state.resineuxSettings);
  const prev=state.resineuxSettings[essence] || {};
  const computed=computeSchaefferFromHeight45(value);
  const manual=prev.manualTariffNumber || null;
  const manualV45=manual ? schaefferV45FromTariffNumber(manual) : null;
  state.resineuxSettings[essence]={height45:computed.height45, autoV45:computed.autoV45 || computed.v45, v45:manualV45 || computed.v45 || null, autoTariffNumber:computed.tariffNumber, manualTariffNumber:manual, tariffNumber:manual || computed.tariffNumber || null};
  save();
  render();
}
function setResineuxManualTariff(essence, value){
  if(guardLocked('modifier les tarifs résineux')) return;
  state.resineuxSettings = normalizeResineuxSettings(state.resineuxSettings);
  const prev=state.resineuxSettings[essence] || {};
  const manual=isSchaefferTariffNumber(Number(value)) ? Number(value) : null;
  const manualV45=manual ? schaefferV45FromTariffNumber(manual) : null;
  state.resineuxSettings[essence]={...prev, manualTariffNumber:manual, tariffNumber:manual || prev.autoTariffNumber || null, v45:manualV45 || prev.autoV45 || prev.v45 || null};
  save();
  render();
}
function isSchaefferTariffNumber(n){return Number.isInteger(Number(n)) && Number(n)>=1 && Number(n)<=20;}
function feuillusTrees(){return (state.trees||[]).filter(t=>!isResineuxEssence(t.essence));}
function resineuxTrees(){return (state.trees||[]).filter(t=>isResineuxEssence(t.essence));}
function doubleEntryExportTrees(){return (state.trees||[]).filter(t=>t.cubageType==='doubleEntry' || !isResineuxEssence(t.essence));}
function resineuxSchaefferTrees(){return resineuxTrees().filter(t=>t.cubageMethod===CUBAGE_METHODS.SCHAEFFER_RAPIDE || t.cubageType==='singleEntry');}
let sessions=loadSessions();
let activeSessionId=(window.FEStore?.bootActiveId) || safeLocalGet(ACTIVE_SESSION_KEY) || sessions[0].id;
let state=sessions.find(s=>s.id===activeSessionId) || sessions[0];
activeSessionId=state.id;
let current = appState.selection;
let editIndex = appState.editingTreeIndex;
function save(){state.schemaVersion=SESSION_SCHEMA_VERSION; state.appVersion=APP_VERSION; state.updatedAt=new Date().toISOString(); state.chantier=String(state.chantier||state.name||'Session sans nom').trim(); state.name=state.chantier; sessions=sessions.map(s=>s.id===state.id?state:s); persistSessions();}
// 1.2.01 : écriture via storage.js (IndexedDB + miroir localStorage). Jamais d'exception silencieuse.
function persistSessions(){
  if(window.FEStore?.saveSessions){ window.FEStore.saveSessions(sessions, state.id); return; }
  try{localStorage.setItem(SESSIONS_KEY,JSON.stringify(sessions)); localStorage.setItem(ACTIVE_SESSION_KEY,state.id);}
  catch(e){const el=document.getElementById('storageAlert'); if(el){const t=el.querySelector('.banner-text'); if(t)t.textContent='⚠️ Stockage plein : les dernières saisies ne sont PAS enregistrées. Exportez la session en JSON.'; el.classList.remove('hidden');}}
}
function safeLocalGet(key){try{return localStorage.getItem(key);}catch(e){return null;}}
function isLocked(){return !!state.locked;}
function guardLocked(action='modifier cette session'){if(isLocked()){alert('Session verrouillée : déverrouillez-la pour '+action+'.'); return true;} return false;}
function setInputsDisabled(){const locked=isLocked(); document.querySelectorAll('#parametrages input,#parametrages textarea,#tarifs input,#tarifs select,#tarifs button,#saisie button,#saisie input,#saisie select,#saisie textarea').forEach(el=>{ if(el.id==='exportModele'||el.id==='exportCsv'||el.id==='printPdf'||el.id==='gloveToggle'||el.id==='bigFingerToggle') return; el.disabled=locked; }); const badge=document.getElementById('lockStatus'); if(badge){badge.textContent=sessionStatusText(state); badge.className=locked?'status locked':'status open';} const btn=document.getElementById('toggleLock'); if(btn) btn.textContent=locked?'Déverrouiller la session':'Verrouiller la session';}
function toggleGloveMode(){document.body.classList.toggle('glove-mode'); localStorage.setItem(GLOVE_MODE_KEY, document.body.classList.contains('glove-mode')?'1':'0'); const b=document.getElementById('gloveToggle'); if(b)b.textContent=document.body.classList.contains('glove-mode')?'🌧️ Pluie activée':'🌧️ Pluie';}
function toggleBigFingersMode(){document.body.classList.toggle('big-fingers-mode'); localStorage.setItem(BIG_FINGERS_MODE_KEY, document.body.classList.contains('big-fingers-mode')?'1':'0'); const b=document.getElementById('bigFingerToggle'); if(b)b.textContent=document.body.classList.contains('big-fingers-mode')?'🖐️ Gros doigts activé':'🖐️ Gros doigts';}
function showFeedback(message){const el=document.getElementById('feedbackToast'); if(!el)return; el.textContent=message; el.classList.remove('hidden'); clearTimeout(window.__forevalCubageFeedbackTimer); window.__forevalCubageFeedbackTimer=setTimeout(()=>el.classList.add('hidden'),1400);}

// --- GPS MANAGER : optionnel, indépendant du moteur de cubage ---
const gpsState={enabled:false, watchId:null, position:null, status:'off', error:'', accuracy:null};
function gpsSupported(){return typeof navigator!=='undefined' && !!navigator.geolocation;}
function gpsRound(value, digits=6){const n=Number(value); return Number.isFinite(n)?Number(n.toFixed(digits)):'';}
function normalizeTreeGps(t){
  t.gpsLat = t.gpsLat ?? t.latitude ?? '';
  t.gpsLng = t.gpsLng ?? t.longitude ?? '';
  t.gpsAccuracy = t.gpsAccuracy ?? t.precisionGps ?? '';
  t.gpsStatus = t.gpsStatus || (t.gpsLat && t.gpsLng ? 'ok' : 'absent');
  return t;
}
function gpsStatusLabel(status){
  if(status==='ok') return 'GPS ok';
  if(status==='imprecis') return 'GPS imprécis';
  if(status==='absent') return 'GPS absent';
  if(status==='searching') return 'GPS recherche…';
  if(status==='error') return 'GPS erreur';
  return 'GPS désactivé';
}
function currentGpsSnapshot(){
  if(!gpsState.enabled) return {gpsLat:'', gpsLng:'', gpsAccuracy:'', gpsStatus:'désactivé'};
  const p=gpsState.position;
  if(!p) return {gpsLat:'', gpsLng:'', gpsAccuracy:'', gpsStatus:gpsState.status==='searching'?'absent':'absent'};
  const accuracy=Number(p.accuracy);
  const status=Number.isFinite(accuracy) && accuracy<=15 ? 'ok' : 'imprecis';
  return {gpsLat:gpsRound(p.lat), gpsLng:gpsRound(p.lng), gpsAccuracy:Number.isFinite(accuracy)?Math.round(accuracy):'', gpsStatus:status};
}
function currentGpsFields(t){return {gpsLat:t?.gpsLat||'', gpsLng:t?.gpsLng||'', gpsAccuracy:t?.gpsAccuracy||'', gpsStatus:t?.gpsStatus||''};}
function renderGpsStatus(){
  const btn=document.getElementById('gpsToggle');
  const status=document.getElementById('gpsStatus');
  if(btn) btn.textContent=gpsState.enabled?'📍 GPS activé':'📍 GPS';
  if(status){
    const txt=gpsState.enabled
      ? (gpsState.position ? `${gpsStatusLabel(currentGpsSnapshot().gpsStatus)} — ± ${Math.round(gpsState.position.accuracy)} m` : gpsStatusLabel(gpsState.status))
      : 'GPS désactivé';
    status.textContent=txt;
    status.className='gps-status '+(gpsState.enabled?(gpsState.position?'gps-on':'gps-search'):'gps-off');
  }
}
function startGps(){
  if(!gpsSupported()){alert('GPS indisponible sur cet appareil ou dans ce navigateur.'); return;}
  if(gpsState.watchId!==null) return;
  gpsState.enabled=true; gpsState.status='searching'; gpsState.error='';
  localStorage.setItem(GPS_MODE_KEY,'1'); renderGpsStatus(); updateLiveGpsMarker();
  gpsState.watchId=navigator.geolocation.watchPosition(pos=>{
    gpsState.position={lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy};
    gpsState.accuracy=pos.coords.accuracy; gpsState.status='ok'; gpsState.error='';
    renderGpsStatus(); updateLiveGpsMarker();
  }, err=>{
    gpsState.position=null; gpsState.accuracy=null; gpsState.status='error'; gpsState.error=err?.message||'Erreur GPS';
    renderGpsStatus(); updateLiveGpsMarker();
  }, {enableHighAccuracy:true, maximumAge:3000, timeout:15000});
}
function stopGps(){
  if(gpsState.watchId!==null && gpsSupported()) navigator.geolocation.clearWatch(gpsState.watchId);
  gpsState.watchId=null; gpsState.enabled=false; gpsState.status='off'; gpsState.position=null; gpsState.accuracy=null; gpsState.error='';
  localStorage.setItem(GPS_MODE_KEY,'0'); renderGpsStatus(); updateLiveGpsMarker();
}
function toggleGps(){gpsState.enabled?stopGps():startGps();}
function initGpsFromPreference(){if(localStorage.getItem(GPS_MODE_KEY)==='1') startGps(); else renderGpsStatus();}
function gpsDisplay(t){
  if(!t?.gpsLat || !t?.gpsLng) return '';
  const acc=t.gpsAccuracy?` ±${t.gpsAccuracy} m`:'';
  return `${t.gpsLat}, ${t.gpsLng}${acc}`;
}
function renderSessionBadge(){const el=document.getElementById('sessionBadge'); if(!el)return; const nb=(state?.trees||[]).length; el.textContent=`${sessionStatusText(state)} — ${state?.name||state?.chantier||'Session'} — ${nb} arbre${nb>1?'s':''}`;}
// --- MOTEUR DE CUBAGE ISOLÉ ---
function adrianII(d,h){const a=97,b=1,k=0; return Math.pow((a-b*h-k*d)/100,2)*Math.PI*d*d/40000*h;}
function adrianI(d,h){return Math.PI*d*d/40000*h;}
function tariffLibrary(){return window.FOREVAL_CUBAGE_TARIFF_LIBRARY || null;}
function feuillusVolumeByTarif(tariffKey, diametre, hauteur){
  const lib=tariffLibrary();
  const fromTable=lib?.lookup?.(tariffKey, diametre, hauteur);
  if(Number.isFinite(fromTable)) return fromTable;
  // Fallback de sécurité : il ne doit servir que si tarifs.js n'est pas chargé.
  if(tariffKey==='ADRIAN_I') return adrianI(diametre, hauteur);
  return adrianII(diametre, hauteur);
}
function cubageFeuillu(selection){
  if(!selection.essence||!selection.diametre||!selection.hauteur)return null;
  const tariffKey=getFeuillusTarif(selection.essence);
  const tariffMeta=FEUILLUS_TARIFF_CATALOG[tariffKey] || FEUILLUS_TARIFF_CATALOG.ADRIAN_II;
  const total = feuillusVolumeByTarif(tariffKey,selection.diametre,selection.hauteur);
  let sup=0, sciage=total;
  if(selection.essence==='Chêne'&&selection.hasSup&&selection.supHauteur){
    // La qualité supérieure ne doit pas modifier le volume total de l'arbre.
    // Elle sert uniquement à isoler une bille de plus-value ; le total BO reste le cubage du tarif choisi pour la hauteur complète.
    sup=feuillusVolumeByTarif('ADRIAN_I',selection.diametre,selection.supHauteur);
    sciage=Math.max(0,total-sup);
  }
  return {sup,sciage,totalBO:total,cubageGroup:ESSENCE_GROUPS.FEUILLU,cubageType:'doubleEntry',tariffKey,tariffLabel:tariffMeta?.label||'Adrian II'};
}
function schaefferRapideVolume(diametre, v45){
  const d=Number(diametre);
  const m=Number(v45);
  if(!Number.isFinite(d) || d<10 || !Number.isFinite(m) || m<=0) return null;
  // Schaeffer rapide exact : V = V45 × (D-5) × (D-10) / 1400, avec D en cm.
  return m * (d-5) * (d-10) / 1400;
}
function cubageResineux(selection){
  if(!selection.essence||!selection.diametre)return null;
  if(isResineuxTableMode(selection.essence)){
    if(!selection.hauteur)return null;
    const tariff=resineuxTableTariffForEssence(selection.essence);
    if(!tariff)return null;
    const sciage=feuillusVolumeByTarif(tariff.tariffKey, selection.diametre, selection.hauteur);
    if(sciage===null)return null;
    return {sup:0,sciage,totalBO:sciage,cubageGroup:ESSENCE_GROUPS.RESINEUX,cubageType:'doubleEntry',cubageMethod:CUBAGE_METHODS.TABLE_CUBAGE,tariffKey:tariff.tariffKey,tariffLabel:tariff.label};
  }
  const tariff=resineuxTariffForEssence(selection.essence);
  if(!tariff || tariff.method!==CUBAGE_METHODS.SCHAEFFER_RAPIDE || !isSchaefferTariffNumber(tariff.tariffNumber)) return null;
  const sciage=schaefferRapideVolume(selection.diametre, tariff.v45);
  if(sciage===null)return null;
  return {sup:0,sciage,totalBO:sciage,cubageGroup:ESSENCE_GROUPS.RESINEUX,cubageType:'singleEntry',cubageMethod:tariff.method,tariffNumber:tariff.tariffNumber,tariffLabel:tariff.label,height45:tariff.height45,v45:tariff.v45};
}
function calculateTreeVolume(selection){
  return isResineuxEssence(selection.essence) ? cubageResineux(selection) : cubageFeuillu(selection);
}
function euro(n){return (n||0).toLocaleString('fr-FR',{maximumFractionDigits:0});}
function m3(n){return (n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function scrollToParcelle(){const el=document.getElementById('parcelleCard'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'});}
function scrollToEssence(){const el=document.getElementById('essenceCard'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'});}
function xmlEscape(s){return String(s ?? '').replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[m]));}
function normalizeQualites(q){
  if(Array.isArray(q)) return q.filter(Boolean);
  if(!q) return [];
  return String(q).split(' + ').map(x=>x.trim()).filter(Boolean);
}
function qualiteLabel(q){return normalizeQualites(q).join(' + ');}
function currentQualites(){current.qualite=normalizeQualites(current.qualite); return current.qualite;}
function hasQualite(q){return currentQualites().some(x=>x.toLowerCase()===String(q).toLowerCase());}
function toggleQualite(q){
  const arr=currentQualites();
  const found=arr.find(x=>x.toLowerCase()===String(q).toLowerCase());
  current.qualite = found ? arr.filter(x=>x!==found) : [...arr, q];
}
function validateSupHeight(show=true){
  if(current.essence==='Chêne' && current.supHauteur && current.hauteur && Number(current.supHauteur)>Number(current.hauteur)){
    if(show) alert('⚠️ La hauteur supérieure ne peut pas dépasser la hauteur totale');
    return false;
  }
  return true;
}
function sessionStatusText(s=state){
  if(s?.locked) return '🔒 Verrouillée';
  if((s?.exportHistory||[]).length) return '📤 Exportée';
  return '🟢 En cours';
}

function renderButtons(id, arr, key){const el=document.getElementById(id);el.innerHTML='';arr.forEach(v=>{const b=document.createElement('button');b.textContent=v;b.className=current[key]===v?'selected':'';b.onclick=()=>{const wasSelected=current[key]===v; if(key==='supHauteur' && !wasSelected && current.hauteur && Number(v)>Number(current.hauteur)){alert('⚠️ La hauteur supérieure ne peut pas dépasser la hauteur totale'); return;} current[key]=wasSelected?null:v; if(key==='essence'&&v!=='Chêne'){current.hasSup=false;current.supHauteur=null;} if(key==='supHauteur'){current.hasSup=!!current.supHauteur;} render();};el.appendChild(b);});}
function renderEssences(){const el=document.getElementById('essences'); el.innerHTML=''; state.projectEssences.forEach(e=>{const b=document.createElement('button');b.textContent=e;b.className=current.essence===e?'selected':'';b.onclick=()=>{current.essence=current.essence===e?null:e;if(e!=='Chêne'){current.hasSup=false;current.supHauteur=null;}render();};el.appendChild(b);}); const blank=document.createElement('button'); blank.textContent='+'; blank.title='Ajouter une essence'; blank.className='blank'; blank.onclick=()=>toggleEssencePicker(true); el.appendChild(blank); fillEssenceSelect();}
function fillEssenceSelect(){const s=document.getElementById('essenceSelect'); if(!s)return; const available=ALL_ESSENCES.filter(e=>!state.projectEssences.includes(e)); s.innerHTML=available.map(e=>`<option value="${xmlEscape(e)}">${xmlEscape(e)}</option>`).join('') || '<option value="">Toutes les essences sont déjà affichées</option>';}
function toggleEssencePicker(show){document.getElementById('essencePicker').className=show?'picker':'picker hidden';}
function confirmEssence(){if(guardLocked('ajouter une essence'))return; const e=document.getElementById('essenceSelect').value; if(!e)return; if(!state.projectEssences.includes(e)) state.projectEssences.push(e); current.essence=e; toggleEssencePicker(false); save(); render();}
function allQualites(){return [...DEFAULT_QUALITES, ...(state.customQualites||[]).filter(q=>!DEFAULT_QUALITES.includes(q))];}
function visibleQualites(){const extras=(state.customQualites||[]).filter(q=>!DEFAULT_VISIBLE_QUALITES.includes(q)); return [...DEFAULT_VISIBLE_QUALITES, ...extras];}
function renderQualites(){const el=document.getElementById('qualites');el.innerHTML='';visibleQualites().forEach(q=>{const b=document.createElement('button');b.textContent=q;b.className=hasQualite(q)?'selected':'';b.onclick=()=>{toggleQualite(q);render();};el.appendChild(b);}); const add=document.createElement('button'); add.textContent='+'; add.title='Ajouter un état / une qualité'; add.className='blank'; add.onclick=()=>toggleQualitePicker(true); el.appendChild(add); fillQualiteSelect(); const label=document.getElementById('qualiteResume'); if(label) label.textContent=qualiteLabel(current.qualite)||'sain';}
function fillQualiteSelect(){const s=document.getElementById('qualiteSelect'); if(!s)return; const available=allQualites().filter(q=>!visibleQualites().some(v=>v.toLowerCase()===q.toLowerCase())); s.innerHTML='<option value="">Choisir dans la liste…</option>'+available.map(q=>`<option value="${xmlEscape(q)}">${xmlEscape(q)}</option>`).join('');}
function toggleQualitePicker(show){const p=document.getElementById('qualitePicker'); if(p)p.className=show?'picker':'picker hidden';}
function confirmQualite(){if(guardLocked('ajouter une qualité'))return; const sel=(document.getElementById('qualiteSelect')?.value||'').trim(); const typed=(document.getElementById('qualiteInput')?.value||'').trim(); const q=typed||sel; if(!q)return; state.customQualites ||= []; const exists=visibleQualites().some(x=>x.toLowerCase()===q.toLowerCase()); if(!exists && !DEFAULT_VISIBLE_QUALITES.some(x=>x.toLowerCase()===q.toLowerCase())) state.customQualites.push(q); if(!hasQualite(q)) current.qualite=[...currentQualites(), q]; if(document.getElementById('qualiteInput'))document.getElementById('qualiteInput').value=''; toggleQualitePicker(false); save(); render();}
function validateTreeInput(selection){
  const errors=[];
  if(!selection.essence) errors.push('Choisissez une essence.');
  if(!selection.diametre) errors.push('Choisissez un diamètre.');
  const isResineux=selection.essence && isResineuxEssence(selection.essence);
  const needsHeight=!isResineux || (isResineux && isResineuxTableMode(selection.essence));
  if(needsHeight && !selection.hauteur) errors.push('Choisissez une hauteur.');
  if(selection.diametre && !DIAMETRES.includes(Number(selection.diametre))) errors.push(`Diamètre hors grille : ${selection.diametre} cm.`);
  if(needsHeight && selection.hauteur && !HAUTEURS.includes(Number(selection.hauteur))) errors.push(`Hauteur hors grille : ${selection.hauteur} m.`);
  if(isResineux && isResineuxSchaefferMode(selection.essence) && !resineuxTariffForEssence(selection.essence)) errors.push(`Indiquez la hauteur moyenne de découpe des Ø45 ou un tarif Schaeffer manuel pour ${selection.essence} dans Tarifs.`);
  if(selection.essence==='Chêne' && selection.hasSup){
    if(!selection.supHauteur) errors.push('Indiquez la hauteur de qualité supérieure du chêne.');
    if(selection.supHauteur && !SUP_HAUTEURS.includes(Number(selection.supHauteur))) errors.push(`Hauteur supérieure hors grille : ${selection.supHauteur} m.`);
    if(selection.supHauteur && selection.hauteur && Number(selection.supHauteur)>Number(selection.hauteur)) errors.push('La hauteur supérieure ne peut pas dépasser la hauteur totale.');
  }
  return errors;
}
function calcCurrent(showAlert=false){
  const errors=validateTreeInput(current);
  if(errors.length){ if(showAlert) alert(errors.join('\n')); return null; }
  if(!validateSupHeight(showAlert)) return null;
  return calculateTreeVolume(current);
}
function currentSessionTotals(){
  const trees=state.trees||[];
  return {nb:trees.length, totalBO:trees.reduce((s,t)=>s+(Number(t.totalBO)||0),0)};
}
function renderPreview(){
  const p=document.getElementById('preview');
  const c=calcCurrent();
  const totals=currentSessionTotals();
  if(!c){
    const msg=isResineuxEssence(current.essence) && isResineuxSchaefferMode(current.essence) ? 'Sélectionnez une essence résineuse et un diamètre.' : 'Sélectionnez une essence, un diamètre et une hauteur.';
    p.textContent=msg;return;
  }
  const isRes=isResineuxEssence(current.essence);
  const tariff=isRes?(resineuxTariffForEssence(current.essence)||resineuxTableTariffForEssence(current.essence)):null;
  const qty=readTreeQuantity(false) || 1;
  const projected=totals.totalBO + (Number(c.totalBO)||0)*qty;
  p.innerHTML=`<div>Qualité supérieure : <strong>${m3(c.sup)} m³</strong></div><div>Sciage courant : <strong>${m3(c.sciage)} m³</strong></div><div>Total bois d’œuvre unitaire : <strong>${m3(c.totalBO)} m³</strong></div>${qty>1?`<div>Total du lot : <strong>${m3((Number(c.totalBO)||0)*qty)} m³</strong></div>`:''}<div class="preview-cumul">Cumul session après ajout : <strong>${totals.nb+qty} arbre(s)</strong> — <strong>${m3(projected)} m³</strong></div><p class="muted">Type : ${isRes?`résineux / ${c.cubageType==='singleEntry'?'entrée simple':'double entrée'} — ${xmlEscape(tariff?.label||'tarif non défini')}`:'feuillu / double entrée'}. ${isRes&&c.cubageType==='singleEntry'?'Export séparé dans le tableur résineux Schaeffer.':'Export vers le modèle double entrée par diamètre et hauteur.'}</p>`;
}
function renderCommentField(){const el=document.getElementById('treeComment'); if(el && el.value !== (current.commentaire||'')) el.value=current.commentaire||'';}
function positionCommentCard(){
  const commentCard=document.getElementById('commentCard');
  if(!commentCard) return;
  const target = current.essence === 'Chêne' ? document.getElementById('cheneSupCard') : document.getElementById('hauteurCard');
  if(target && target.nextElementSibling !== commentCard){
    target.insertAdjacentElement('afterend', commentCard);
  }
}
function readTreeQuantity(showAlert=false){
  if(editIndex!==null) return 1;
  const el=document.getElementById('treeQuantity');
  const n=Number.parseInt(el?.value||'1',10);
  if(!Number.isFinite(n) || n<1 || n>500){
    if(showAlert) alert('Indiquez un nombre d’arbres identiques compris entre 1 et 500.');
    return null;
  }
  return n;
}
function renderQuantityField(){
  updateKeepDimensionsUI();
  const el=document.getElementById('treeQuantity');
  if(!el)return;
  if(editIndex!==null){el.value=1; el.disabled=true; return;}
  el.disabled=isLocked();
  if(!el.value || Number(el.value)<1) el.value=1;
}
function resetQuantityField(){const el=document.getElementById('treeQuantity'); if(el)el.value=1;}
function nextTreeNumber(){return state.trees.reduce((max,t)=>Math.max(max, Number(t.numero)||0),0)+1;}
function isKeepDimensionsMode(){return localStorage.getItem(KEEP_DIMENSIONS_MODE_KEY)==='1';}
function updateKeepDimensionsUI(){const el=document.getElementById('keepDimensionsMode'); if(el)el.checked=isKeepDimensionsMode();}
function toggleKeepDimensionsMode(){localStorage.setItem(KEEP_DIMENSIONS_MODE_KEY, document.getElementById('keepDimensionsMode')?.checked?'1':'0');}
function resetAfterSave(){
  const keepDims=isKeepDimensionsMode();
  patchSelection(keepDims
    ? {hasSup:false, supHauteur:null, qualite:[], commentaire:''}
    : {diametre:null, hauteur:null, hasSup:false, supHauteur:null, qualite:[], commentaire:''}
  );
  setEditIndex(null);
  resetQuantityField();
}

function addTree(){
  if(guardLocked('ajouter un arbre'))return;
  const commentEl=document.getElementById('treeComment');
  if(commentEl) current.commentaire=commentEl.value.trim();
  const qty=readTreeQuantity(true);
  if(!qty)return;
  const c=calcCurrent(true);
  if(!c)return;
  readParamFields();
  const wasEdit=editIndex!==null;
  if(wasEdit){
    const previousNumero=state.trees[editIndex]?.numero;
    const previousGps=state.trees[editIndex]?currentGpsFields(state.trees[editIndex]):{};
    const tree={...current, commentaire:(current.commentaire||'').trim(), qualite:qualiteLabel(current.qualite)||null, ...c, ...previousGps, numero:previousNumero||nextTreeNumber(), date:new Date().toISOString()};
    state.trees[editIndex]=tree;
    save(); resetAfterSave(); render(); showFeedback(`✅ Arbre #${tree.numero} modifié`); scrollToParcelle();
    return;
  }
  const added=[];
  const gps=currentGpsSnapshot();
  for(let i=0;i<qty;i++){
    const tree={...current, commentaire:(current.commentaire||'').trim(), qualite:qualiteLabel(current.qualite)||null, ...c, ...gps, numero:nextTreeNumber(), date:new Date().toISOString()};
    state.trees.push(tree);
    added.push(tree.numero);
  }
  save(); resetAfterSave(); render();
  showFeedback(qty===1?`✅ Arbre #${added[0]} ajouté`:`✅ ${qty} arbres ajoutés (#${added[0]} à #${added[added.length-1]})`);
  scrollToParcelle();
}
function editTree(i){if(guardLocked('modifier un arbre'))return; const t=state.trees[i]; if(!t)return; if(t.parcelle && !state.parcelles.includes(t.parcelle)) state.parcelles.push(t.parcelle); if(!state.projectEssences.includes(t.essence))state.projectEssences.push(t.essence); setSelection({parcelle:t.parcelle||null, essence:t.essence, diametre:t.diametre, hauteur:t.hauteur, qualite:normalizeQualites(t.qualite), commentaire:t.commentaire||'', hasSup:!!t.hasSup, supHauteur:t.supHauteur||null}); setEditIndex(i); render(); scrollToParcelle();}
function deleteTree(i){if(guardLocked('supprimer un arbre'))return; if(confirm('Confirmer la suppression de cet arbre ?')){state.trees.splice(i,1); if(editIndex===i)setEditIndex(null); save(); render();}}
function undoLastTree(){if(guardLocked('annuler le dernier arbre'))return; if(!state.trees.length){showFeedback('Aucun arbre à annuler'); return;} const t=state.trees.pop(); setEditIndex(null); save(); render(); showFeedback(`↩️ Arbre #${t.numero||''} annulé`); scrollToParcelle();}

function cancelEdit(){resetAfterSave(); render();}
function renderLast(){const el=document.getElementById('lastTrees'); const last=state.trees.map((t,i)=>({...t,i})).slice(-10).reverse(); el.innerHTML=last.map(t=>{const res=isResineuxEssence(t.essence); const dims=(res&&t.cubageType==='singleEntry')?`${t.diametre} cm — ${xmlEscape(t.tariffLabel||'Schaeffer rapide')}`:`${t.diametre} cm × ${t.hauteur} m — ${xmlEscape(t.tariffLabel||'tarif')}`; return `<div class="tree"><span><strong>#${t.numero||t.i+1} — ${t.parcelle?xmlEscape(t.parcelle)+' — ':''}${t.essence}</strong> ${dims} ${qualiteLabel(t.qualite)?'— '+xmlEscape(qualiteLabel(t.qualite)):''}<br><span class="muted">BO ${m3(t.totalBO)} m³${t.sup?` — Sup. ${m3(t.sup)} m³`:''}${t.commentaire?` — ${xmlEscape(t.commentaire)}`:''}</span></span><span class="tree-actions"><button class="mini" onclick="editTree(${t.i})">Modifier</button><button class="mini danger" onclick="deleteTree(${t.i})">×</button></span></div>`}).join('')||'<p class="muted">Aucun arbre saisi.</p>';}

function uniqueSorted(values){return [...new Set(values.filter(v=>String(v||'').trim()).map(v=>String(v).trim()))].sort((a,b)=>a.localeCompare(b,'fr'));}
function listRowMatches(t, q){if(!q)return true; const hay=[t.numero,t.parcelle,t.essence,t.diametre,t.hauteur,qualiteLabel(t.qualite),t.commentaire,t.tariffLabel,m3(t.totalBO),gpsDisplay(t),t.gpsStatus].join(' ').toLowerCase(); return hay.includes(q.toLowerCase());}
function renderListFilters(){
  const parc=document.getElementById('listFilterParcelle');
  const ess=document.getElementById('listFilterEssence');
  if(!parc || !ess)return;
  const selectedParc=parc.value || '';
  const selectedEss=ess.value || '';
  const parcels=uniqueSorted((state.trees||[]).map(t=>t.parcelle||'Sans parcelle'));
  const essences=uniqueSorted((state.trees||[]).map(t=>t.essence));
  parc.innerHTML='<option value="">Toutes les parcelles</option>'+parcels.map(v=>`<option value="${xmlEscape(v)}">${xmlEscape(v)}</option>`).join('');
  ess.innerHTML='<option value="">Toutes les essences</option>'+essences.map(v=>`<option value="${xmlEscape(v)}">${xmlEscape(v)}</option>`).join('');
  parc.value=parcels.includes(selectedParc)?selectedParc:'';
  ess.value=essences.includes(selectedEss)?selectedEss:'';
}
function filteredTreeEntries(){
  const parc=document.getElementById('listFilterParcelle')?.value || '';
  const ess=document.getElementById('listFilterEssence')?.value || '';
  const q=document.getElementById('listSearch')?.value?.trim() || '';
  return (state.trees||[]).map((t,i)=>({...t,i})).filter(t=>(!parc || (t.parcelle||'Sans parcelle')===parc) && (!ess || t.essence===ess) && listRowMatches(t,q));
}
function updateTreeComment(i,value){
  if(guardLocked('modifier le commentaire'))return;
  if(!state.trees[i])return;
  state.trees[i].commentaire=String(value||'').trim();
  save();
  renderLast(); renderTreeList(); renderSummary(); renderExportPlan();
}
function editTreeFromList(i){editTree(i); setActiveTab('saisie');}
function duplicateTreeFromList(i){
  if(guardLocked('dupliquer un arbre'))return;
  const t=state.trees[i]; if(!t)return;
  const base={parcelle:t.parcelle||null, essence:t.essence, diametre:t.diametre, hauteur:t.hauteur, qualite:normalizeQualites(t.qualite), commentaire:t.commentaire||'', hasSup:!!t.hasSup, supHauteur:t.supHauteur||null};
  const c=calculateTreeVolume(base); if(!c){alert('Impossible de recalculer cet arbre. Vérifiez les paramètres de tarif.'); return;}
  const tree={...base, commentaire:(base.commentaire||'').trim(), qualite:qualiteLabel(base.qualite)||null, ...c, ...currentGpsSnapshot(), numero:nextTreeNumber(), date:new Date().toISOString()};
  state.trees.push(tree); save(); render(); showFeedback(`📋 Arbre #${tree.numero} dupliqué`);
}
function renderTreeList(){
  renderListFilters();
  const el=document.getElementById('treeList');
  const stats=document.getElementById('treeListStats');
  if(!el)return;
  const rows=filteredTreeEntries();
  const total=rows.reduce((s,t)=>s+(Number(t.totalBO)||0),0);
  if(stats)stats.innerHTML=`${rows.length} arbre(s) affiché(s) sur ${(state.trees||[]).length} — volume affiché : <strong>${m3(total)} m³</strong>`;
  if(!rows.length){el.innerHTML='<p class="muted">Aucun arbre à afficher.</p>';return;}
  el.innerHTML=`<table class="tree-list"><thead><tr><th>N°</th><th>Parcelle</th><th>Essence</th><th>Ø</th><th>H</th><th>Tarif</th><th>Volume</th><th>Qualité</th><th>Qualité sup. chêne</th><th>GPS</th><th>Précision</th><th>Commentaire</th><th>Actions</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${t.numero||t.i+1}</td><td>${xmlEscape(t.parcelle||'')}</td><td>${xmlEscape(t.essence||'')}</td><td>${t.diametre||''}</td><td>${t.hauteur||''}</td><td>${xmlEscape(t.tariffLabel||'')}</td><td>${m3(t.totalBO)}</td><td>${xmlEscape(qualiteLabel(t.qualite)||'')}</td><td>${xmlEscape(listingCheneSupValue(t))}</td><td>${xmlEscape(gpsDisplay(t))}</td><td>${t.gpsAccuracy?`${t.gpsAccuracy} m`:''}</td><td><textarea class="list-comment" ${isLocked()?'disabled':''} onchange="updateTreeComment(${t.i}, this.value)" placeholder="Commentaire">${xmlEscape(t.commentaire||'')}</textarea></td><td class="list-actions"><button class="mini" onclick="editTreeFromList(${t.i})">Modifier</button><button class="mini" onclick="duplicateTreeFromList(${t.i})">Dupliquer</button><button class="mini danger" onclick="deleteTree(${t.i})">×</button></td></tr>`).join('')}</tbody></table>`;
}
function parcelLabel(parcelle){return String(parcelle||'Sans parcelle').trim() || 'Sans parcelle';}
function displayEssence(t){return `${parcelLabel(t.parcelle)} — ${t.essence}`;}
function treeGroupKey(t){return [parcelLabel(t.parcelle), t.essence||'Essence inconnue', qualiteLabel(t.qualite)||'sain'].join('|');}
function groupLabel(g){const q=(g.qualite||'sain')==='sain'?'':` - ${g.qualite}`; return `${parcelLabel(g.parcelle)} — ${g.essence}${q}`;}
function groupedEssence(){const g={}; state.trees.forEach(t=>{const q=qualiteLabel(t.qualite)||'sain'; const key=treeGroupKey(t); g[key] ||= {parcelle:parcelLabel(t.parcelle), essence:t.essence, qualite:q, label:groupLabel({parcelle:t.parcelle, essence:t.essence, qualite:q}), nb:0,sup:0,sciage:0,totalBO:0,diametreSum:0}; g[key].nb++; g[key].sup+=Number(t.sup)||0; g[key].sciage+=Number(t.sciage)||0; g[key].totalBO+=Number(t.totalBO)||0; g[key].diametreSum+=Number(t.diametre)||0;}); return g;}
function exportGroups(){const groups={}; doubleEntryExportTrees().forEach(t=>{const q=qualiteLabel(t.qualite)||'sain'; const h=saisieHeightForTree(t); if(!h || h<=0) return; const key=treeGroupKey(t); groups[key] ||= {parcelle:parcelLabel(t.parcelle), essence:t.essence, qualite:q, nb:0, sup:0, sciage:0, totalBO:0, trees:[]}; const g=groups[key]; const vol=Number(t.totalBO)||0; g.nb++; g.sciage+=vol; g.totalBO+=vol; g.trees.push(t);}); return Object.values(groups).sort((a,b)=>parcelLabel(a.parcelle).localeCompare(parcelLabel(b.parcelle),'fr') || String(a.essence).localeCompare(String(b.essence),'fr') || String(a.qualite).localeCompare(String(b.qualite),'fr'));}
function exportSheetName(index){return index===0?'Saisie ligne 1':String(index+1);}

function isCheneSupTree(t){return t.essence==='Chêne' && !!t.hasSup && !!t.supHauteur;}
function saisieHeightForTree(t){return t.hauteur;}
function countsForTreesWithHeight(trees, heightFn){const counts={}; trees.forEach(t=>{const h=heightFn(t); if(!h || h<=0) return; const key=`${t.diametre}|${h}`; counts[key]=(counts[key]||0)+1;}); return counts;}
function getSheetByName(entries, name){return entries.find(e=>(e.name||'')===name) || null;}
function plusValueTrees(){return state.trees.filter(isCheneSupTree);}
function renderSummary(){
  const g=groupedEssence();
  const rows=Object.entries(g)
    .sort((a,b)=>b[1].totalBO-a[1].totalBO)
    .map(([e,v])=>{
      const volumeUnitaire = v.nb ? v.totalBO / v.nb : 0;
      const diametreMoyen = v.nb ? v.diametreSum / v.nb : 0;
      return `<tr><td>${xmlEscape(v.label||e)}</td><td>${v.nb}</td><td>${diametreMoyen.toFixed(0)} cm</td><td>${m3(volumeUnitaire)}</td><td>${m3(v.sup)}</td><td>${m3(v.totalBO)}</td></tr>`;
    })
    .join('');
  document.getElementById('summary').innerHTML=`<p><strong>Nom du fichier :</strong> ${state.chantier||''}</p><table><thead><tr><th>Essence</th><th>Nb</th><th>Ø</th><th>Vol. unitaire</th><th>Sup.</th><th>Total BO</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTerrainResume(){
  const el=document.getElementById('terrainResume');
  if(!el)return;
  const parcels={};
  (state.trees||[]).forEach(t=>{
    const p=parcelLabel(t.parcelle);
    parcels[p] ||= {nb:0,totalBO:0,feuillus:0,resineux:0,items:{}};
    parcels[p].nb++; parcels[p].totalBO+=Number(t.totalBO)||0;
    if(isResineuxEssence(t.essence)) parcels[p].resineux++; else parcels[p].feuillus++;
    const key=`${t.essence}${qualiteLabel(t.qualite)?' - '+qualiteLabel(t.qualite):''}`;
    parcels[p].items[key] ||= {nb:0,totalBO:0}; parcels[p].items[key].nb++; parcels[p].items[key].totalBO+=Number(t.totalBO)||0;
  });
  const blocks=Object.entries(parcels).sort((a,b)=>a[0].localeCompare(b[0],'fr')).map(([p,v])=>{
    const lines=Object.entries(v.items).sort((a,b)=>b[1].totalBO-a[1].totalBO).map(([k,x])=>`<li>${xmlEscape(k)} : ${x.nb} arbre(s), ${m3(x.totalBO)} m³</li>`).join('');
    return `<div class="terrain-card"><strong>${xmlEscape(p)}</strong><br><span class="muted">${v.nb} arbre(s) — ${m3(v.totalBO)} m³ — ${v.feuillus} feuillu(s), ${v.resineux} résineux</span><ul>${lines}</ul></div>`;
  });
  el.innerHTML=blocks.join('')||'<p class="muted">Aucune donnée terrain.</p>';
}
function renderStandAnalysis(){
  const el=document.getElementById('standAnalysis');
  if(!el)return;
  const trees=state.trees||[];
  if(!trees.length){el.innerHTML='<p class="muted">Aucune donnée à analyser.</p>';return;}
  const total=trees.reduce((s,t)=>s+(Number(t.totalBO)||0),0);
  const avg=total/trees.length;
  const diamCounts={}; trees.forEach(t=>{diamCounts[t.diametre]=(diamCounts[t.diametre]||0)+1;});
  const diamRows=Object.entries(diamCounts).sort((a,b)=>Number(a[0])-Number(b[0])).map(([d,n])=>`<tr><td>${d} cm</td><td>${n}</td></tr>`).join('');
  el.innerHTML=`<p><strong>${trees.length}</strong> arbre(s) — <strong>${m3(total)} m³</strong> — volume moyen <strong>${m3(avg)} m³/arbre</strong></p><table><thead><tr><th>Diamètre</th><th>Nombre</th></tr></thead><tbody>${diamRows}</tbody></table>`;
}
function renderFeuillusTariffPreparation(){
  const el=document.getElementById('feuillusTariffsPrep');
  if(!el)return;
  el.innerHTML=Object.values(FEUILLUS_TARIFF_CATALOG).map(t=>`<div class="tariff-prep ${t.status==='active'?'active':'prepared'}"><strong>${xmlEscape(t.label)}</strong><span>${t.status==='active'?'Actif':'Préparé / désactivé'}</span><p>${xmlEscape(t.note)}</p></div>`).join('');
}
function renderExportPlan(){const el=document.getElementById('exportPlan'); const feuillus=exportGroups(); const pv=plusValueTrees(); const resGroups=resineuxExportGroups(); const feuillusRows=feuillus.map((g,i)=>`<div class="export-sheet"><strong>${exportSheetName(i)} — ${xmlEscape(groupLabel(g))}</strong><br><span class="muted">${g.nb} arbre(s) — ${m3(g.totalBO)} m³ BO courant — export double entrée</span></div>`); if(pv.length){const parcels=[...new Set(pv.map(t=>parcelLabel(t.parcelle)))]; const pvLabel=parcels.length===1?`${parcels[0]} — Chêne - Qualité supérieure`:`Parcelles multiples — Chêne - Qualité supérieure`; feuillusRows.push(`<div class="export-sheet"><strong>Plus-value qualité 1 — ${xmlEscape(pvLabel)}</strong><br><span class="muted">${pv.length} bille(s) de qualité supérieure — export feuillus</span></div>`);} const resRows=resGroups.map((g,i)=>`<div class="export-sheet"><strong>${resineuxExportSheetName(i)} — ${xmlEscape(groupLabel(g))}</strong><br><span class="muted">${g.nb} arbre(s) — ${m3(g.totalBO)} m³ — tarif ${g.tariffNumber||'—'} — export résineux</span></div>`); if(!feuillusRows.length && !resRows.length){el.innerHTML='<p class="muted">Aucune donnée à exporter.</p>'; return;} el.innerHTML=`<div class="export-section"><h3>🌳 Export double entrée (feuillus + résineux Adrian/Chaudé)</h3>${feuillusRows.join('')||'<p class="muted">Aucun feuillu à exporter.</p>'}</div><div class="export-section"><h3>🌲 Export résineux Schaeffer</h3>${resRows.join('')||'<p class="muted">Aucun résineux à exporter.</p>'}</div>`;}

function resetProject(){if(guardLocked('réinitialiser la session'))return; state.trees=[]; state.parcelles=[]; state.projectEssences=[...DEFAULT_PROJECT_ESSENCES]; resetSelection(); save(); render(); scrollToParcelle();}
function confirmReset(){if(confirm('⚠️ Réinitialiser le projet ? Tous les arbres saisis seront supprimés.')) resetProject();}
function recordExport(type, fileName){state.exportHistory ||= []; state.exportHistory.unshift({type, fileName, trees:(state.trees||[]).length, date:new Date().toISOString()}); save();}
function afterExport(type='Export', fileName=''){recordExport(type,fileName); render(); setTimeout(()=>{ if(confirm('Export lancé et enregistré dans l’historique. Voulez-vous verrouiller cette session ?')){state.locked=true; save(); render(); alert('Session verrouillée. Vous pourrez la déverrouiller depuis l’onglet Synthèse.');} else {alert('La session reste modifiable et conservée par sécurité.');}},300);}
function toggleLock(){state.locked=!state.locked; save(); render(); alert(state.locked?'Session verrouillée.':'Session déverrouillée.');}
function colToNum(col){return col.split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);}
function colFromNum(n){let s=''; while(n>0){let m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s;}
function cellRef(col,row){return `${col}${row}`;}
function cellRow(ref){return parseInt(ref.match(/\d+/)?.[0] || '0',10);}
function cellColNum(ref){return colToNum(ref.match(/[A-Z]+/)?.[0] || 'A');}
function getChildrenByTag(parent, tag){return Array.from(parent.getElementsByTagName(tag));}
function findSheetEntries(zip, workbookXml, relsXml){
  const parser=new DOMParser();
  const wb=parser.parseFromString(workbookXml,'application/xml');
  const rels=parser.parseFromString(relsXml,'application/xml');
  const relMap={};
  Array.from(rels.getElementsByTagName('Relationship')).forEach(r=>{relMap[r.getAttribute('Id')]=r.getAttribute('Target');});
  return Array.from(wb.getElementsByTagName('sheet')).map(s=>{const rid=s.getAttribute('r:id') || s.getAttribute('id'); let target=relMap[rid] || ''; if(target && !target.startsWith('xl/')) target='xl/'+target.replace(/^\.\.\//,''); return {name:s.getAttribute('name'), path:target};});
}
function getSaisieSheets(entries){const wanted=['Saisie ligne 1',...Array.from({length:11},(_,i)=>String(i+2))]; return wanted.map((name,idx)=>{const found=entries.find(e=>(e.name||'')===name); return found?{...found,num:idx+1}:null;}).filter(Boolean);}
function ensureRow(doc, sheetData, rowNum){let row=Array.from(sheetData.getElementsByTagName('row')).find(r=>parseInt(r.getAttribute('r'),10)===rowNum); if(row) return row; row=doc.createElementNS(XLSX_NS,'row'); row.setAttribute('r',String(rowNum)); const rows=Array.from(sheetData.getElementsByTagName('row')); const next=rows.find(r=>parseInt(r.getAttribute('r'),10)>rowNum); sheetData.insertBefore(row,next||null); return row;}
function removeCell(row, addr){Array.from(row.getElementsByTagName('c')).forEach(c=>{if(c.getAttribute('r')===addr) row.removeChild(c);});}
function setCellNumber(doc, sheetData, addr, value){const rowNum=cellRow(addr); const row=ensureRow(doc,sheetData,rowNum); removeCell(row,addr); const c=doc.createElementNS(XLSX_NS,'c'); c.setAttribute('r',addr); const v=doc.createElementNS(XLSX_NS,'v'); v.textContent=String(value); c.appendChild(v); const cells=Array.from(row.getElementsByTagName('c')); const n=cellColNum(addr); const next=cells.find(x=>cellColNum(x.getAttribute('r'))>n); row.insertBefore(c,next||null);}
function setCellText(doc, sheetData, addr, text){const rowNum=cellRow(addr); const row=ensureRow(doc,sheetData,rowNum); removeCell(row,addr); const c=doc.createElementNS(XLSX_NS,'c'); c.setAttribute('r',addr); c.setAttribute('t','inlineStr'); const is=doc.createElementNS(XLSX_NS,'is'); const t=doc.createElementNS(XLSX_NS,'t'); t.textContent=text; is.appendChild(t); c.appendChild(is); const cells=Array.from(row.getElementsByTagName('c')); const n=cellColNum(addr); const next=cells.find(x=>cellColNum(x.getAttribute('r'))>n); row.insertBefore(c,next||null);}
function clearRange(doc, sheetData, startCol, endCol, startRow, endRow){for(let r=startRow;r<=endRow;r++){const row=Array.from(sheetData.getElementsByTagName('row')).find(x=>parseInt(x.getAttribute('r'),10)===r); if(!row) continue; Array.from(row.getElementsByTagName('c')).forEach(c=>{const ref=c.getAttribute('r'); const cn=cellColNum(ref); if(cn>=colToNum(startCol)&&cn<=colToNum(endCol)) row.removeChild(c);});}}
function countsForGroup(g){return countsForTreesWithHeight(g.trees, saisieHeightForTree);}
function excelAddressFor(diametre, hauteur){const row = 5 + ((diametre - 15) / 5); const hIndex = HAUTEURS.indexOf(hauteur); if(!Number.isInteger(row) || row<5 || row>27 || hIndex<0) return null; const col = colFromNum(colToNum('D') + hIndex); return `${col}${row}`;}
async function forceWorkbookRecalculation(zip){
  const parser=new DOMParser(); const serializer=new XMLSerializer();
  const workbookXml=await zip.file('xl/workbook.xml').async('string');
  const doc=parser.parseFromString(workbookXml,'application/xml');
  const wb=doc.documentElement;
  let calcPr=doc.getElementsByTagName('calcPr')[0];
  if(!calcPr){calcPr=doc.createElementNS(XLSX_NS,'calcPr'); wb.appendChild(calcPr);}
  calcPr.setAttribute('calcMode','auto');
  calcPr.setAttribute('fullCalcOnLoad','1');
  calcPr.setAttribute('forceFullCalc','1');
  calcPr.setAttribute('calcOnSave','1');
  calcPr.setAttribute('iterate','0');
  zip.file('xl/workbook.xml', serializer.serializeToString(doc));
}

// --- CONTRÔLES DE NON-RÉGRESSION EXPORT ---
function validateTreeForExport(t){
  const errors=[];
  if(isResineuxEssence(t.essence)) return errors;
  if(!t.essence) errors.push('essence manquante');
  if(!t.diametre) errors.push('diamètre manquant');
  const h=saisieHeightForTree(t);
  if(!h || h<=0) errors.push('hauteur export nulle ou manquante');
  if(t.diametre && h && !excelAddressFor(Number(t.diametre), Number(h))) errors.push(`hors grille Excel (${t.diametre} cm × ${h} m)`);
  if(isCheneSupTree(t) && !excelAddressFor(Number(t.diametre), Number(t.supHauteur))) errors.push(`plus-value hors grille Excel (${t.diametre} cm × ${t.supHauteur} m)`);
  return errors;
}
function validateWorkbookTemplate(zip, entries){
  const errors=[];
  const saisie=getSaisieSheets(entries);
  if(saisie.length<12) errors.push(`modèle incomplet : ${saisie.length}/12 feuilles de saisie trouvées`);
  if(!getSheetByName(entries,'Plus-value qualité 1')) errors.push('feuille "Plus-value qualité 1" introuvable');
  for(const sh of saisie){ if(!sh.path || !zip.file(sh.path)) errors.push(`feuille introuvable dans le fichier : ${sh.name}`); }
  const pv=getSheetByName(entries,'Plus-value qualité 1');
  if(pv && (!pv.path || !zip.file(pv.path))) errors.push('fichier XML de la feuille "Plus-value qualité 1" introuvable');
  return {ok:errors.length===0, errors, saisieSheets:saisie, pvSheet:pv};
}
function validateExportBeforeWriting(groups, pvTrees, sheets){
  const errors=[];
  if(groups.length>sheets.length) errors.push(`${groups.length} groupes essence/qualité pour ${sheets.length} feuilles disponibles.`);
  feuillusTrees().forEach((t,i)=>{
    const treeErrors=validateTreeForExport(t);
    if(treeErrors.length) errors.push(`Arbre #${t.numero||i+1} : ${treeErrors.join(', ')}`);
  });
  return errors;
}

function escXml(s){return String(s ?? '').replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[m]));}
function simpleCellXml(addr, value){
  if(typeof value==='number' && Number.isFinite(value)) return `<c r="${addr}"><v>${value}</v></c>`;
  return `<c r="${addr}" t="inlineStr"><is><t>${escXml(value)}</t></is></c>`;
}
function simpleRowXml(r, values){
  return `<row r="${r}">${values.map((v,i)=>simpleCellXml(`${colFromNum(i+1)}${r}`,v)).join('')}</row>`;
}
async function buildSimpleXlsxBlob(sheetName, rows){
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.folder('xl').file('workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXml(sheetName).slice(0,31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.folder('xl').folder('_rels').file('workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  const sheetRows=rows.map((row,i)=>simpleRowXml(i+1,row)).join('');
  zip.folder('xl').folder('worksheets').file('sheet1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}


// --- EXPORT MANAGER : listing indépendant et ajout de feuille non bloquant ---
function listingTariffLabel(t){
  if(!t) return '';
  if(t.tariffLabel) return t.tariffLabel;
  if(t.tariffKey){
    const meta=FEUILLUS_TARIFF_CATALOG?.[t.tariffKey];
    return meta?.label || t.tariffKey;
  }
  if(t.tariffNumber) return `Schaeffer rapide n°${t.tariffNumber}`;
  return '';
}
function listingVolumeValue(t){
  const v=Number(t?.totalBO);
  return Number.isFinite(v) ? Number(v.toFixed(3)) : '';
}
function listingCheneSupValue(t){
  if(!t || t.essence!=='Chêne' || !t.hasSup || !t.supHauteur) return '';
  return `${t.supHauteur} m`;
}
function listingRows(trees=state.trees){
  return [['Numéro','Parcelle','Essence','Diamètre','Hauteur de découpe','Qualité','Qualité supérieure chêne','Latitude','Longitude','Précision GPS (m)','Statut GPS','Commentaire','Tarif utilisé','Volume BO (m³)'], ...trees.map((t,i)=>[
    t.numero || i+1,
    t.parcelle || '',
    t.essence || '',
    t.diametre || '',
    t.cubageType==='singleEntry' ? '' : (t.hauteur || ''),
    qualiteLabel(t.qualite) || '',
    listingCheneSupValue(t),
    t.gpsLat || '',
    t.gpsLng || '',
    t.gpsAccuracy || '',
    t.gpsStatus || '',
    t.commentaire || '',
    listingTariffLabel(t),
    listingVolumeValue(t)
  ])];
}
function csvEscape(value){
  const txt=String(value ?? '');
  const escaped=txt.replace(/"/g,'""');
  return /[;"\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}
function listingCsv(trees=state.trees){return listingRows(trees).map(row=>row.map(csvEscape).join(';')).join('\n');}
function exportDiagnosticsPush(kind, message, ok=true){console[ok?'info':'warn'](`[ForEval Export] ${kind} — ${message}`);}
function ensureContentTypeOverride(zip, partName){
  const path='[Content_Types].xml';
  const xmlFile=zip.file(path);
  if(!xmlFile) return Promise.resolve(false);
  return xmlFile.async('string').then(xml=>{
    if(xml.includes(`PartName="${partName}"`)) return true;
    const override=`<Override PartName="${partName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    zip.file(path, xml.replace('</Types>', `${override}</Types>`));
    return true;
  });
}
async function addListingWorksheetSafe(zip, sheetName='Listing', trees=state.trees){
  try{
    if(!zip || !zip.file) return false;
    const workbookFile=zip.file('xl/workbook.xml');
    const relsFile=zip.file('xl/_rels/workbook.xml.rels');
    if(!workbookFile || !relsFile) return false;
    const parser=new DOMParser(); const serializer=new XMLSerializer();
    const workbookXml=await workbookFile.async('string');
    const relsXml=await relsFile.async('string');
    const wbDoc=parser.parseFromString(workbookXml,'application/xml');
    const sheets=wbDoc.getElementsByTagName('sheets')[0];
    const existing=Array.from(wbDoc.getElementsByTagName('sheet')).find(x=>x.getAttribute('name')===sheetName);
    if(existing) return true;
    const relsDoc=parser.parseFromString(relsXml,'application/xml');
    const relsRoot=relsDoc.documentElement;
    const rels=Array.from(relsDoc.getElementsByTagName('Relationship'));
    const ridNums=rels.map(r=>(r.getAttribute('Id')||'').match(/^rId(\d+)$/)).filter(Boolean).map(m=>Number(m[1]));
    const newRid=`rId${Math.max(0,...ridNums)+1}`;
    const sheetIds=Array.from(wbDoc.getElementsByTagName('sheet')).map(s=>Number(s.getAttribute('sheetId'))||0);
    const newSheetId=Math.max(0,...sheetIds)+1;
    const partPath='xl/worksheets/listing.xml';
    const rows=listingRows(trees).map((row,i)=>simpleRowXml(i+1,row)).join('');
    zip.file(partPath,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
    const rel=relsDoc.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships','Relationship');
    rel.setAttribute('Id',newRid);
    rel.setAttribute('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet');
    rel.setAttribute('Target','worksheets/listing.xml');
    relsRoot.appendChild(rel);
    const sheet=wbDoc.createElementNS(XLSX_NS,'sheet');
    sheet.setAttribute('name',sheetName.slice(0,31));
    sheet.setAttribute('sheetId',String(newSheetId));
    sheet.setAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','r:id',newRid);
    sheets.appendChild(sheet);
    zip.file('xl/workbook.xml',serializer.serializeToString(wbDoc));
    zip.file('xl/_rels/workbook.xml.rels',serializer.serializeToString(relsDoc));
    await ensureContentTypeOverride(zip,'/xl/worksheets/listing.xml');
    exportDiagnosticsPush('Listing Excel','feuille Listing ajoutée');
    return true;
  }catch(e){
    exportDiagnosticsPush('Listing Excel',`non ajouté : ${e.message}`,false);
    return false;
  }
}
async function downloadListingWorkbook(){
  if(!state.trees.length)return alert('Aucune donnée à exporter.');
  if(typeof JSZip==='undefined')return alert('Le module Excel n’est pas chargé. Rechargez la page.');
  const blob=await buildSimpleXlsxBlob('Listing',listingRows(state.trees));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=buildExportFileName('listing','xlsx');
  a.click();
  afterExport('Excel listing',a.download);
}
const ExportManager={
  async exportExcel(){
    try{
      if(!state.trees.length)return alert('Aucune donnée à exporter.');
      if(typeof JSZip==='undefined')return alert('Le module Excel n’est pas chargé. Rechargez la page.');
      exportDiagnosticsPush('Contrôle','session valide');
      return await legacyExportToTemplate();
    }catch(e){
      console.error('[ForEval Export] erreur export Excel', e);
      alert(`Export impossible : ${e.message || e}`);
      return null;
    }
  },
  exportCsvListing(){return exportCsv();},
  async exportListingWorkbook(){return downloadListingWorkbook();}
};

function resineuxExportSheetName(index){return index===0?'Saisie ligne 1':String(index+1);}
function resineuxExportGroups(){
  const groups={};
  resineuxSchaefferTrees().forEach(t=>{
    const q=qualiteLabel(t.qualite)||'sain';
    const key=treeGroupKey(t);
    groups[key] ||= {parcelle:parcelLabel(t.parcelle), essence:t.essence, qualite:q, nb:0, totalBO:0, trees:[], tariffNumber:t.tariffNumber, v45:t.v45, height45:t.height45, tariffLabel:t.tariffLabel};
    const g=groups[key];
    g.nb++;
    g.totalBO += Number(t.totalBO)||0;
    g.trees.push(t);
  });
  return Object.values(groups).sort((a,b)=>parcelLabel(a.parcelle).localeCompare(parcelLabel(b.parcelle),'fr') || String(a.essence).localeCompare(String(b.essence),'fr') || String(a.qualite).localeCompare(String(b.qualite),'fr'));
}
function resineuxExcelAddressFor(diametre, tariffNumber){
  const d=Number(diametre), t=Number(tariffNumber);
  const row = 5 + ((d - 20) / 5);
  if(!Number.isInteger(row) || row<5 || row>21) return null;
  if(!isSchaefferTariffNumber(t)) return null;
  return `${colFromNum(3 + t)}${row}`; // D=tarif 1, W=tarif 20.
}
function countsForResineuxGroup(g){
  const out={};
  g.trees.forEach(t=>{
    const tariff=Number(t.tariffNumber);
    const key=`${Number(t.diametre)}|${tariff}`;
    out[key]=(out[key]||0)+1;
  });
  return out;
}
function validateResineuxBeforeWriting(groups, sheets){
  const errors=[];
  if(groups.length>sheets.length) errors.push(`${groups.length} groupes essence/qualité résineux pour ${sheets.length} feuilles disponibles.`);
  groups.forEach((g,gi)=>{
    g.trees.forEach(t=>{
      if(!resineuxExcelAddressFor(t.diametre,t.tariffNumber)) errors.push(`${groupLabel(g)} : diamètre ${t.diametre} cm ou tarif ${t.tariffNumber} hors grille résineux.`);
      if(!Number.isFinite(Number(t.v45)) || Number(t.v45)<=0) errors.push(`${groupLabel(g)} : V45 manquant.`);
    });
  });
  return errors;
}
async function exportResineuxWorkbook(){
  const groups=resineuxExportGroups();
  if(!groups.length) return null;
  const res=await fetch(RESINEUX_TEMPLATE_FILE);
  if(!res.ok)return alert('Modèle Excel résineux introuvable dans l’application.');
  const buffer=await res.arrayBuffer();
  const zip=await JSZip.loadAsync(buffer);
  const workbookXml=await zip.file('xl/workbook.xml').async('string');
  const relsXml=await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const entries=findSheetEntries(zip,workbookXml,relsXml);
  const saisieSheets=entries.filter(e=>/^Saisie ligne 1$|^(2|3|4|5|6|7|8|9|10|11|12)$/.test(e.name)).sort((a,b)=>resineuxSheetOrder(a.name)-resineuxSheetOrder(b.name));
  if(saisieSheets.length<12){alert('Export résineux impossible : le modèle ne contient pas toutes les feuilles Saisie ligne 1 à 12.'); return null;}
  const errors=validateResineuxBeforeWriting(groups, saisieSheets);
  if(errors.length){alert('Export résineux impossible :\n' + errors.slice(0,10).join('\n') + (errors.length>10?'\n…':'')); return null;}
  const parser=new DOMParser(); const serializer=new XMLSerializer();
  for(let i=0;i<saisieSheets.length;i++){
    const sheet=saisieSheets[i];
    const xml=await zip.file(sheet.path).async('string');
    const doc=parser.parseFromString(xml,'application/xml');
    const sheetData=doc.getElementsByTagName('sheetData')[0];
    clearRange(doc,sheetData,'D','W',5,21);
    if(i<groups.length){
      const g=groups[i];
      setCellText(doc,sheetData,'B2',groupLabel(g));
      setCellText(doc,sheetData,'B3','Schaeffer-rapide');
      setCellNumber(doc,sheetData,'N3',Number(g.tariffNumber)||Number(g.trees[0]?.tariffNumber)||0);
      const counts=countsForResineuxGroup(g);
      Object.entries(counts).forEach(([key,count])=>{
        const [d,t]=key.split('|').map(Number);
        const addr=resineuxExcelAddressFor(d,t);
        if(addr) setCellNumber(doc,sheetData,addr,count);
      });
    } else {
      setCellText(doc,sheetData,'B2','');
      setCellText(doc,sheetData,'B3','Schaeffer-rapide');
    }
    zip.file(sheet.path,serializer.serializeToString(doc));
  }
  await addListingWorksheetSafe(zip,'Listing',resineuxSchaefferTrees());
  if(zip.file('xl/calcChain.xml')) zip.remove('xl/calcChain.xml');
  await forceWorkbookRecalculation(zip);
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); const safe=(state.chantier||'cubage').replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ -]/gi,'').replace(/\s+/g,'_'); a.download=`ForEval_Cubage_${safe}_resineux.xlsx`; a.click();
  recordExport('Excel résineux',a.download);
  return a.download;
}
function resineuxSheetOrder(name){return name==='Saisie ligne 1'?1:Number(name);}


// --- SERVICE D’EXPORT ISOLÉ ---
async function legacyExportToTemplate(){
  if(!state.trees.length)return alert('Aucune donnée à exporter.');
  if(typeof JSZip==='undefined')return alert('Le module Excel n’est pas chargé. Rechargez la page.');
  const groups=exportGroups();
  const resin=resineuxSchaefferTrees();
  if(!groups.length && resin.length){await exportResineuxWorkbook(); render(); alert('Export résineux Schaeffer généré dans un tableur séparé.'); return;}
  const pvTrees=plusValueTrees();
  const res=await fetch(TEMPLATE_FILE);
  if(!res.ok)return alert('Modèle Excel introuvable dans l’application.');
  const buffer=await res.arrayBuffer();
  const zip=await JSZip.loadAsync(buffer);
  const workbookXml=await zip.file('xl/workbook.xml').async('string');
  const relsXml=await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const entries=findSheetEntries(zip,workbookXml,relsXml);
  const templateCheck=validateWorkbookTemplate(zip, entries);
  if(!templateCheck.ok){alert('Export impossible : modèle Excel non conforme.\n' + templateCheck.errors.join('\n')); return;}
  const sheets=templateCheck.saisieSheets;
  const pvSheet=templateCheck.pvSheet;
  const exportErrors=validateExportBeforeWriting(groups, pvTrees, sheets);
  if(exportErrors.length){alert('Export impossible : données hors grille ou incomplètes.\n' + exportErrors.slice(0,8).join('\n') + (exportErrors.length>8?'\n…':'')); return;}
  const parser=new DOMParser(); const serializer=new XMLSerializer();
  for(let i=0;i<sheets.length;i++){
    const sheet=sheets[i]; const xml=await zip.file(sheet.path).async('string'); const doc=parser.parseFromString(xml,'application/xml'); const sheetData=doc.getElementsByTagName('sheetData')[0];
    clearRange(doc,sheetData,'D','X',5,27);
    if(i<groups.length){
      const g=groups[i]; setCellText(doc,sheetData,'B2',groupLabel(g));
      const counts=countsForGroup(g);
      for(const [key, count] of Object.entries(counts)){const [d,h]=key.split('|').map(Number); const addr=excelAddressFor(d,h); if(!addr){alert(`Arbre non exporté : diamètre ${d} cm, hauteur ${h} m hors grille Excel.`); continue;} setCellNumber(doc,sheetData,addr,count);}
    } else {
      setCellText(doc,sheetData,'B2','');
    }
    zip.file(sheet.path,serializer.serializeToString(doc));
  }
  if(pvSheet){
    const xml=await zip.file(pvSheet.path).async('string'); const doc=parser.parseFromString(xml,'application/xml'); const sheetData=doc.getElementsByTagName('sheetData')[0];
    clearRange(doc,sheetData,'D','X',5,27);
    if(pvTrees.length){
      const pvParcels=[...new Set(pvTrees.map(t=>parcelLabel(t.parcelle)))]; setCellText(doc,sheetData,'B2',pvParcels.length===1?`${pvParcels[0]} — Chêne - Qualité supérieure`:'Parcelles multiples — Chêne - Qualité supérieure');
      const counts=countsForTreesWithHeight(pvTrees, t=>t.supHauteur);
      for(const [key, count] of Object.entries(counts)){const [d,h]=key.split('|').map(Number); const addr=excelAddressFor(d,h); if(!addr){alert(`Qualité supérieure non exportée : diamètre ${d} cm, hauteur ${h} m hors grille Excel.`); continue;} setCellNumber(doc,sheetData,addr,count);}
    } else {
      setCellText(doc,sheetData,'B2','');
    }
    zip.file(pvSheet.path,serializer.serializeToString(doc));
  }
  await addListingWorksheetSafe(zip,'Listing',doubleEntryExportTrees());
  if(zip.file('xl/calcChain.xml')) zip.remove('xl/calcChain.xml');
  await writeParametragesSheet(zip);
  await forceWorkbookRecalculation(zip);
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); const safe=(state.chantier||'cubage').replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ -]/gi,'').replace(/\s+/g,'_'); a.download=`ForEval_Cubage_${safe}_feuillus.xlsx`; a.click(); recordExport('Excel feuillus',a.download);
  if(resin.length) await exportResineuxWorkbook();
  render(); setTimeout(()=>{ if(confirm('Export lancé et enregistré dans l’historique. Voulez-vous verrouiller cette session ?')){state.locked=true; save(); render(); alert('Session verrouillée. Vous pourrez la déverrouiller depuis l’onglet Synthèse.');} else {alert('La session reste modifiable et conservée par sécurité.');}},300);
}
async function exportToTemplate(){return ExportManager.exportExcel();}
function exportCsv(){
  try{
    if(!state.trees.length)return alert('Aucune donnée à exporter.');
    const trees=[...(state.trees||[])]; // ordre terrain strict : aucun tri, aucun regroupement.
    const csv='\ufeff'+listingCsv(trees);
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=buildExportFileName('listing','csv');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    recordExport('CSV listing',a.download);
    render();
    showFeedback('📄 CSV listing exporté');
  }catch(e){
    console.error('[ForEval CSV]', e);
    alert('Export CSV impossible : '+(e?.message||e));
  }
}

// --- SIG EXPORT MANAGER ---
const SIG_COLOR_BY_ESSENCE = Object.freeze({
  'Chêne':'8B5A2B','Hêtre':'2F80ED','Frêne':'2EAD4F','Châtaignier':'A05A2C','Tilleul':'6FCF97','Peuplier':'56CCF2','Érable sycomore':'9B51E0','Érable champêtre':'BB6BD9','Tremble':'27AE60','Merisier':'EB5757','Érable plane':'9B51E0','Bouleau':'F2C94C','Charme':'219653',
  'Douglas':'F2994A','Épicéa commun':'27AE60','Épicéa de Sitka':'219653','Sapin pectiné':'6FCF97','Sapin de Vancouver':'1F8A70','Pin sylvestre':'EB5757','Pin Laricio':'D35400','Pin maritime':'C0392B'
});
function sigTrees(){return (state.trees||[]).filter(t=>Number.isFinite(Number(t.gpsLat)) && Number.isFinite(Number(t.gpsLng)));}
function sigColorHex(essence){return SIG_COLOR_BY_ESSENCE[essence] || '236A46';}
function kmlColor(hex, alpha='ff'){
  const h=String(hex||'236A46').replace('#','').padStart(6,'0').slice(0,6);
  return `${alpha}${h.slice(4,6)}${h.slice(2,4)}${h.slice(0,2)}`; // KML = AABBGGRR
}
function xmlText(value){return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function sigLabel(t,i){return String(t.numero || i+1);}
function sigDescriptionHtml(t,i){
  const rows=[
    ['Numéro',sigLabel(t,i)],['Parcelle',t.parcelle||''],['Essence',t.essence||''],['Diamètre',t.diametre?`${t.diametre} cm`:'' ],['Hauteur',t.hauteur?`${t.hauteur} m`:'' ],['Qualité',qualiteLabel(t.qualite)||''],['Qualité supérieure chêne',listingCheneSupValue(t)],['Tarif utilisé',listingTariffLabel(t)],['Volume BO',listingVolumeValue(t)?`${listingVolumeValue(t)} m³`:'' ],['Commentaire',t.commentaire||''],['Précision GPS',t.gpsAccuracy?`${t.gpsAccuracy} m`:'' ]
  ].filter(([,v])=>String(v||'').length);
  return '<table>'+rows.map(([k,v])=>`<tr><td><strong>${xmlText(k)}</strong></td><td>${xmlText(v)}</td></tr>`).join('')+'</table>';
}
function sigProperties(t,i){
  return {
    numero:t.numero || i+1,
    label:sigLabel(t,i),
    parcelle:t.parcelle || '',
    essence:t.essence || '',
    diametre_cm:t.diametre || '',
    hauteur_m:t.cubageType==='singleEntry' ? '' : (t.hauteur || ''),
    qualite:qualiteLabel(t.qualite)||'',
    qualite_sup_chene:listingCheneSupValue(t),
    tarif_utilise:listingTariffLabel(t),
    volume_bo_m3:listingVolumeValue(t),
    commentaire:t.commentaire || '',
    latitude:Number(t.gpsLat),
    longitude:Number(t.gpsLng),
    precision_gps_m:t.gpsAccuracy || '',
    statut_gps:t.gpsStatus || '',
    couleur:sigColorHex(t.essence)
  };
}
function downloadTextFile(content, filename, mime){
  const blob=new Blob([content],{type:mime});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  recordExport(filename.split('.').pop().toUpperCase(),filename);
  render();
}
function ensureSigData(){
  if(!state.trees.length){alert('Aucun arbre saisi.'); return null;}
  const trees=sigTrees();
  if(!trees.length){alert('Export SIG impossible : aucun arbre ne possède de coordonnées GPS.'); return null;}
  return trees;
}
function buildGeoJson(trees=sigTrees()){
  return JSON.stringify({
    type:'FeatureCollection',
    name:safeFileName(state.chantier||state.name||'ForEval Cubage'),
    features:trees.map((t,i)=>({type:'Feature', geometry:{type:'Point', coordinates:[Number(t.gpsLng), Number(t.gpsLat)]}, properties:sigProperties(t,i)}))
  },null,2);
}
function buildKml(trees=sigTrees()){
  const styles=[...new Set(trees.map(t=>sigColorHex(t.essence)))].map(hex=>`<Style id="ess_${hex}"><IconStyle><color>${kmlColor(hex)}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><color>ff000000</color><scale>0.85</scale></LabelStyle></Style>`).join('\n');
  const placemarks=trees.map((t,i)=>`<Placemark><name>${xmlText(sigLabel(t,i))}</name><styleUrl>#ess_${sigColorHex(t.essence)}</styleUrl><description><![CDATA[${sigDescriptionHtml(t,i)}]]></description><ExtendedData>${Object.entries(sigProperties(t,i)).map(([k,v])=>`<Data name="${xmlText(k)}"><value>${xmlText(v)}</value></Data>`).join('')}</ExtendedData><Point><coordinates>${Number(t.gpsLng)},${Number(t.gpsLat)},0</coordinates></Point></Placemark>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlText(state.chantier||state.name||'ForEval Cubage')}</name>${styles}\n${placemarks}</Document></kml>`;
}
function buildGpx(trees=sigTrees()){
  const waypoints=trees.map((t,i)=>`<wpt lat="${Number(t.gpsLat)}" lon="${Number(t.gpsLng)}"><name>${xmlText(sigLabel(t,i))}</name><desc>${xmlText(`Arbre ${sigLabel(t,i)} — ${t.essence||''} — Ø ${t.diametre||''} — ${listingVolumeValue(t)||''} m³${t.commentaire?' — '+t.commentaire:''}`)}</desc><sym>Tree</sym><type>${xmlText(t.essence||'Arbre')}</type></wpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ForEval Cubage" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlText(state.chantier||state.name||'ForEval Cubage')}</name></metadata>${waypoints}</gpx>`;
}
function buildCsvXY(trees=sigTrees()){
  const header=['Numéro','Longitude','Latitude','Précision GPS (m)','Parcelle','Essence','Diamètre','Hauteur','Qualité','Qualité supérieure chêne','Tarif utilisé','Volume BO (m³)','Commentaire','Couleur'];
  const rows=trees.map((t,i)=>[sigLabel(t,i),t.gpsLng,t.gpsLat,t.gpsAccuracy||'',t.parcelle||'',t.essence||'',t.diametre||'',t.cubageType==='singleEntry'?'':(t.hauteur||''),qualiteLabel(t.qualite)||'',listingCheneSupValue(t),listingTariffLabel(t),listingVolumeValue(t),t.commentaire||'',sigColorHex(t.essence)]);
  return '\ufeff'+[header,...rows].map(r=>r.map(csvEscape).join(';')).join('\n');
}
function exportGeoJson(){const trees=ensureSigData(); if(!trees)return; downloadTextFile(buildGeoJson(trees),buildExportFileName('points_arbres','geojson'),'application/geo+json;charset=utf-8'); showFeedback('🗺️ GeoJSON exporté');}
function exportKml(){const trees=ensureSigData(); if(!trees)return; downloadTextFile(buildKml(trees),buildExportFileName('points_arbres','kml'),'application/vnd.google-earth.kml+xml;charset=utf-8'); showFeedback('🗺️ KML exporté');}
function exportGpx(){const trees=ensureSigData(); if(!trees)return; downloadTextFile(buildGpx(trees),buildExportFileName('points_arbres','gpx'),'application/gpx+xml;charset=utf-8'); showFeedback('🗺️ GPX exporté');}
function exportCsvXY(){const trees=ensureSigData(); if(!trees)return; downloadTextFile(buildCsvXY(trees),buildExportFileName('points_xy','csv'),'text/csv;charset=utf-8'); showFeedback('🗺️ CSV XY exporté');}
function exportSigAll(){
  const trees=ensureSigData(); if(!trees)return;
  exportGeoJson(); setTimeout(exportKml,150); setTimeout(exportGpx,300); setTimeout(exportCsvXY,450);
}

// --- CARTE INTERACTIVE : lecture terrain, indépendante du moteur de cubage ---
const MAP_BASE_LAYER_KEY = 'forevalCubageMapBaseLayer';
// 1.2.01 : les tuiles consultées sont mises en cache par le service worker ; les zones IGN peuvent être préchargées (carte-hors-ligne.js).
const MAP_BASE_LAYERS = Object.freeze({
  osm:{label:'OpenStreetMap', url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', options:{maxZoom:20, attribution:'© OpenStreetMap'}},
  satellite:{label:'Orthophoto / satellite', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', options:{maxZoom:20, attribution:'Tiles © Esri'}},
  topo:{label:'OpenTopoMap', url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', options:{maxZoom:17, attribution:'© OpenTopoMap contributors'}},
  cartoLight:{label:'Carto clair', url:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', options:{maxZoom:20, subdomains:'abcd', attribution:'© OpenStreetMap © CARTO'}},
  ignOrtho:{label:'IGN Orthophotos', url:'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', options:{maxZoom:20, maxNativeZoom:19, attribution:'© IGN / Géoplateforme'}},
  ignPlan:{label:'IGN Plan', url:'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', options:{maxZoom:20, attribution:'© IGN / Géoplateforme'}}
});
const CADASTRE_LAYER = Object.freeze({
  url:'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI%20vecteur&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  options:{maxZoom:20, opacity:.72, attribution:'© IGN / DGFiP Cadastre'}
});
const mapState={map:null, baseLayer:null, cadastreLayer:null, treeLayer:null, gpsLayer:null, initialized:false, selectedTreeIndex:null};
function mapReady(){return typeof L!=='undefined' && !!document.getElementById('treeMap');}
function selectedMapBaseLayerKey(){
  const raw=safeLocalGet(MAP_BASE_LAYER_KEY) || 'osm';
  return MAP_BASE_LAYERS[raw] ? raw : 'osm';
}
function createMapBaseLayer(key){
  const cfg=MAP_BASE_LAYERS[key] || MAP_BASE_LAYERS.osm;
  return L.tileLayer(cfg.url, cfg.options || {});
}
function setMapBaseLayer(key){
  if(!mapState.map || !MAP_BASE_LAYERS[key])return;
  if(mapState.baseLayer) mapState.map.removeLayer(mapState.baseLayer);
  mapState.baseLayer=createMapBaseLayer(key).addTo(mapState.map);
  try{localStorage.setItem(MAP_BASE_LAYER_KEY,key);}catch(e){}
  const select=document.getElementById('mapBaseLayer');
  if(select && select.value!==key) select.value=key;
  refreshMapStatus();
}
function mapOverlayChecked(id, fallback=true){
  const el=document.getElementById(id);
  return el ? !!el.checked : fallback;
}
function updateCadastreLayer(){
  if(!mapState.map || typeof L==='undefined')return;
  const enabled=mapOverlayChecked('mapOverlayCadastre',false);
  if(enabled && !mapState.cadastreLayer){
    mapState.cadastreLayer=L.tileLayer(CADASTRE_LAYER.url, CADASTRE_LAYER.options || {}).addTo(mapState.map);
    mapState.cadastreLayer.setZIndex(420);
  }else if(!enabled && mapState.cadastreLayer){
    mapState.map.removeLayer(mapState.cadastreLayer);
    mapState.cadastreLayer=null;
  }
}
function refreshMapStatus(){
  const status=document.getElementById('mapStatus');
  if(!status)return;
  const key=selectedMapBaseLayerKey();
  const base=MAP_BASE_LAYERS[key]?.label || 'OpenStreetMap';
  const all=mapValidTrees();
  const filtered=mapFilterTrees(all);
  const cadastre=mapOverlayChecked('mapOverlayCadastre',false) ? ' — cadastre actif' : '';
  status.textContent=`Fond : ${base}${cadastre} — ${filtered.length}/${all.length} arbre(s) GPS affiché(s).`;
}
function mapColor(essence){return sigColorHex(essence || 'Arbre');}
function mapValidTrees(){return (state.trees||[]).map((t,i)=>({...t,i})).filter(t=>t.gpsLat && t.gpsLng && Number.isFinite(Number(t.gpsLat)) && Number.isFinite(Number(t.gpsLng)));}
function mapFilterTrees(trees=mapValidTrees()){
  const parc=document.getElementById('mapFilterParcelle')?.value || '';
  const ess=document.getElementById('mapFilterEssence')?.value || '';
  const q=(document.getElementById('mapSearch')?.value || '').trim().toLowerCase();
  return trees.filter(t=>{
    if(parc && t.parcelle!==parc) return false;
    if(ess && t.essence!==ess) return false;
    if(q){
      const hay=[t.numero,t.parcelle,t.essence,t.diametre,t.hauteur,t.commentaire,qualiteLabel(t.qualite),listingTariffLabel(t)].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}
function renderMapFilters(){
  const p=document.getElementById('mapFilterParcelle');
  const e=document.getElementById('mapFilterEssence');
  if(!p||!e)return;
  const oldP=p.value, oldE=e.value;
  const parcels=[...new Set((state.trees||[]).map(t=>t.parcelle).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'fr'));
  const ess=[...new Set((state.trees||[]).map(t=>t.essence).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'fr'));
  p.innerHTML='<option value="">Toutes</option>'+parcels.map(x=>`<option value="${xmlEscape(x)}">${xmlEscape(x)}</option>`).join('');
  e.innerHTML='<option value="">Toutes</option>'+ess.map(x=>`<option value="${xmlEscape(x)}">${xmlEscape(x)}</option>`).join('');
  p.value=parcels.includes(oldP)?oldP:''; e.value=ess.includes(oldE)?oldE:'';
}
function treePopupHtml(t,i){
  const rows=[
    ['Arbre', sigLabel(t,i)],
    ['Parcelle', t.parcelle||''],
    ['Essence', t.essence||''],
    ['Ø', t.diametre?`${t.diametre} cm`:'' ],
    ['Hauteur', t.cubageType==='singleEntry'?'':(t.hauteur?`${t.hauteur} m`:'')],
    ['QS chêne', listingCheneSupValue(t)],
    ['Qualité', qualiteLabel(t.qualite)||''],
    ['Tarif', listingTariffLabel(t)],
    ['Volume', listingVolumeValue(t)?`${listingVolumeValue(t)} m³`:'' ],
    ['GPS', gpsDisplay(t)],
    ['Commentaire', t.commentaire||'']
  ].filter(([,v])=>String(v||'').length);
  return `<div class="map-popup"><h3>Arbre ${xmlEscape(sigLabel(t,i))}</h3><table>${rows.map(([k,v])=>`<tr><td><strong>${xmlEscape(k)}</strong></td><td>${xmlEscape(v)}</td></tr>`).join('')}</table><button class="mini" onclick="editTree(${t.i});setActiveTab('saisie')">Modifier</button></div>`;
}
function treeMapIcon(t,i){
  const color=mapColor(t.essence);
  const showNumbers=mapOverlayChecked('mapOverlayNumbers',true);
  const label=showNumbers ? xmlEscape(sigLabel(t,i)) : '';
  return L.divIcon({className:`tree-map-icon${showNumbers?'':' no-number'}`, html:`<div style="--tree-color:${color}">${label}</div>`, iconSize:[34,34], iconAnchor:[17,17], popupAnchor:[0,-18]});
}
function initMap(){
  if(!mapReady())return false;
  if(mapState.initialized)return true;
  const el=document.getElementById('treeMap');
  mapState.map=L.map(el,{zoomControl:true, attributionControl:true});
  const key=selectedMapBaseLayerKey();
  const select=document.getElementById('mapBaseLayer');
  if(select) select.value=key;
  mapState.baseLayer=createMapBaseLayer(key).addTo(mapState.map);
  mapState.treeLayer=L.layerGroup().addTo(mapState.map);
  mapState.gpsLayer=L.layerGroup().addTo(mapState.map);
  updateCadastreLayer();
  mapState.map.setView([46.6,2.4],6);
  mapState.initialized=true;
  setTimeout(()=>mapState.map.invalidateSize(),100);
  return true;
}
function updateLiveGpsMarker(){
  if(!mapState.initialized || !mapState.gpsLayer)return;
  mapState.gpsLayer.clearLayers();
  if(!mapOverlayChecked('mapOverlayGps',true) || !gpsState.position)return;
  const p=gpsState.position;
  const marker=L.circleMarker([p.lat,p.lng],{radius:7,color:'#1f4ed8',weight:3,fillColor:'#5aa2ff',fillOpacity:.55}).bindPopup(`Position GPS<br>Précision : ± ${Math.round(p.accuracy)} m`);
  const circle=L.circle([p.lat,p.lng],{radius:p.accuracy||0,color:'#1f4ed8',weight:1,fillOpacity:.06});
  mapState.gpsLayer.addLayer(circle); mapState.gpsLayer.addLayer(marker);
}
function refreshMap(){
  renderMapFilters();
  const status=document.getElementById('mapStatus');
  if(!mapReady()){if(status)status.textContent='Carte indisponible : la bibliothèque cartographique n’est pas chargée.'; return;}
  if(!initMap())return;
  mapState.treeLayer.clearLayers();
  const all=mapValidTrees();
  const trees=mapFilterTrees(all);
  if(mapOverlayChecked('mapOverlayTrees',true)){
    trees.forEach((t,idx)=>{
      const marker=L.marker([Number(t.gpsLat),Number(t.gpsLng)],{icon:treeMapIcon(t,idx)}).bindPopup(treePopupHtml(t,idx));
      mapState.treeLayer.addLayer(marker);
    });
  }
  updateCadastreLayer(); updateLiveGpsMarker(); if(window.TraceManager?.renderTrace) window.TraceManager.renderTrace(); refreshMapStatus();
  setTimeout(()=>mapState.map.invalidateSize(),60);
}
function mapFitTrees(){
  if(!initMap())return;
  const trees=mapFilterTrees();
  if(!trees.length){showFeedback('Aucun arbre GPS à afficher'); return;}
  const bounds=L.latLngBounds(trees.map(t=>[Number(t.gpsLat),Number(t.gpsLng)]));
  mapState.map.fitBounds(bounds,{padding:[25,25],maxZoom:18});
}
function mapCenterGps(){
  if(!initMap())return;
  if(!gpsState.position){showFeedback('Position GPS indisponible'); return;}
  mapState.map.setView([gpsState.position.lat,gpsState.position.lng],18);
}
function setupMapEvents(){
  const ids=['mapFilterParcelle','mapFilterEssence','mapSearch'];
  ids.forEach(id=>{const el=document.getElementById(id); if(el) el.oninput=refreshMap;});
  const base=document.getElementById('mapBaseLayer'); if(base) base.onchange=()=>setMapBaseLayer(base.value);
  ['mapOverlayTrees','mapOverlayNumbers','mapOverlayGps','mapOverlayTrace','mapOverlayCadastre'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.onchange=refreshMap;
  });
  const center=document.getElementById('mapCenterGps'); if(center) center.onclick=mapCenterGps;
  const fit=document.getElementById('mapFitTrees'); if(fit) fit.onclick=mapFitTrees;
}

function buildPrintArea(){const groups=exportGroups(); const rows=groups.map((g,i)=>`<div class="print-page"><h1>${exportSheetName(i)} — ${xmlEscape(groupLabel(g))}</h1><p><strong>Nom du fichier :</strong> ${xmlEscape(state.chantier||'')}</p><table><thead><tr><th>Diamètre</th><th>Hauteur</th><th>Nombre</th></tr></thead><tbody>${Object.entries(countsForGroup(g)).sort().map(([key,n])=>{const [d,h]=key.split('|'); return `<tr><td>${d}</td><td>${h}</td><td>${n}</td></tr>`}).join('')}</tbody></table><div class="totals">${g.nb} arbre(s) — ${m3(g.totalBO)} m³ BO courant</div></div>`); const pv=plusValueTrees(); if(pv.length){const counts=countsForTreesWithHeight(pv,t=>t.supHauteur); rows.push(`<div class="print-page"><h1>Plus-value qualité 1 — Chêne - Qualité supérieure</h1><p><strong>Nom du fichier :</strong> ${xmlEscape(state.chantier||'')}</p><table><thead><tr><th>Diamètre</th><th>Hauteur</th><th>Nombre</th></tr></thead><tbody>${Object.entries(counts).sort().map(([key,n])=>{const [d,h]=key.split('|'); return `<tr><td>${d}</td><td>${h}</td><td>${n}</td></tr>`}).join('')}</tbody></table></div>`);} document.getElementById('printArea').innerHTML=rows.join('');}
function printPdf(){if(!state.trees.length)return alert('Aucune donnée à exporter.'); buildPrintArea(); window.print(); afterExport('PDF','Impression PDF');}


function exportSessionJson(){
  readParamFields(); save();
  const data={exportedAt:new Date().toISOString(), appVersion:APP_VERSION, schemaVersion:SESSION_SCHEMA_VERSION, session:state};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  const safe=(state.chantier||state.name||'session').replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ -]/gi,'').replace(/\s+/g,'_');
  a.download=`ForEval_Cubage_${safe}_sauvegarde.json`;
  a.click();
  showFeedback('💾 Sauvegarde JSON exportée');
}
function importSessionJsonFromFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=JSON.parse(reader.result);
      const imported=normalizeSession(parsed.session || parsed);
      imported.id=uid();
      imported.name=(imported.name||imported.chantier||'Session importée') + ' (import)';
      imported.chantier=imported.name.replace(/ \(import\)$/,'');
      imported.locked=false;
      sessions.unshift(imported);
      state=imported; activeSessionId=state.id; resetSelection(); save(); render(); setActiveTab('saisie');
      alert('Session JSON importée avec succès.');
    }catch(e){alert('Import impossible : fichier JSON non valide.');}
  };
  reader.readAsText(file);
}

function fmtDate(iso){try{return new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return ''}}
function setActiveTab(id){document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.remove('active')); const b=document.querySelector(`nav button[data-tab="${id}"]`); if(b)b.classList.add('active'); const t=document.getElementById(id); if(t)t.classList.add('active'); render(); if(id==='carte') setTimeout(()=>{refreshMap(); mapFitTrees();},120); if(id==='sessions'){window.FEStore?.refreshEstimate?.().then(renderDataSafety); renderBackups();}}
function renderFeuillusTarifs(){
  const el=document.getElementById('feuillusTarifs');
  if(!el) return;
  state.feuillusTarifs = normalizeFeuillusTarifs(state.feuillusTarifs);
  const options=Object.entries(FEUILLUS_TARIFF_CATALOG).map(([key,t])=>`<option value="${key}">${xmlEscape(t.label)}${t.status==='prepared'?' — préparé':''}</option>`);
  el.innerHTML=FEUILLUS.map(e=>{
    const current=getFeuillusTarif(e);
    const meta=FEUILLUS_TARIFF_CATALOG[current] || FEUILLUS_TARIFF_CATALOG.ADRIAN_II;
    const select=options.map(o=>o.includes(`value="${current}"`)?o.replace('<option','<option selected'):o).join('');
    return `<div class="tariff-row feuillus-tariff-row"><label>${xmlEscape(e)}</label><select onchange="setFeuillusTarif('${xmlEscape(e)}', this.value)">${select}</select><div class="tariff-result"><strong>${xmlEscape(meta.label)}</strong><span>${meta.status==='active'?'actif':'préparé / calcul non activé'}</span></div></div>`;
  }).join('');
}
function renderResineuxTariffs(){
  const el=document.getElementById('resineuxTarifs');
  if(!el) return;
  state.resineuxSettings = normalizeResineuxSettings(state.resineuxSettings);
  const schaefferOptions=['<option value="">Auto</option>', ...SCHAEFFER_V45_TABLE.map(r=>`<option value="${r.tariffNumber}">n°${r.tariffNumber} — V45 ${m3(r.v45)} m³</option>`)];
  const tableOptions=Object.entries(FEUILLUS_TARIFF_CATALOG).map(([key,t])=>`<option value="${key}">${xmlEscape(t.label)}</option>`);
  el.innerHTML = RESINEUX.map(e=>{
    const st=state.resineuxSettings[e] || {};
    const method=st.method || CUBAGE_METHODS.SCHAEFFER_RAPIDE;
    const v=st.v45 ? `${m3(st.v45)} m³` : '—';
    const auto=st.autoTariffNumber ? `auto n°${st.autoTariffNumber}${st.autoV45?` / ${m3(st.autoV45)} m³`:''}` : 'auto —';
    const active=st.tariffNumber ? `n°${st.tariffNumber}` : '—';
    const schSelect=schaefferOptions.map(o=> st.manualTariffNumber && o.includes(`value="${st.manualTariffNumber}"`) ? o.replace('<option','<option selected') : o).join('');
    const tableSelect=tableOptions.map(o=>o.includes(`value="${st.tableTariffKey||'ADRIAN_II'}"`)?o.replace('<option','<option selected'):o).join('');
    const schaefferBlock=`<input type="number" min="8" max="40" step="0.5" inputmode="decimal" value="${st.height45 ?? ''}" placeholder="Hauteur Ø45 en m" onchange="setResineuxHeight45('${xmlEscape(e)}', this.value)"><select onchange="setResineuxManualTariff('${xmlEscape(e)}', this.value)">${schSelect}</select><div class="tariff-result"><strong>${active}</strong><span>V45 ${v} — ${auto}${st.manualTariffNumber?' — corrigé manuellement':''}</span></div>`;
    const tableBlock=`<select onchange="setResineuxTableTarif('${xmlEscape(e)}', this.value)">${tableSelect}</select><div class="tariff-result"><strong>${xmlEscape((FEUILLUS_TARIFF_CATALOG[st.tableTariffKey]||FEUILLUS_TARIFF_CATALOG.ADRIAN_II).label)}</strong><span>diamètre × hauteur — hauteur obligatoire en saisie</span></div>`;
    return `<div class="tariff-row tariff-row-v173 resineux-method-row"><label>${xmlEscape(e)}</label><select onchange="setResineuxCubageMethod('${xmlEscape(e)}', this.value)"><option value="${CUBAGE_METHODS.SCHAEFFER_RAPIDE}" ${method===CUBAGE_METHODS.SCHAEFFER_RAPIDE?'selected':''}>Schaeffer rapide</option><option value="${CUBAGE_METHODS.TABLE_CUBAGE}" ${method===CUBAGE_METHODS.TABLE_CUBAGE?'selected':''}>Adrian / Chaudé</option></select>${method===CUBAGE_METHODS.SCHAEFFER_RAPIDE?schaefferBlock:tableBlock}</div>`;
  }).join('');
}
function readParamFields(){
  const c=document.getElementById('chantier'); const m=document.getElementById('martelage'); const o=document.getElementById('observations'); const l=document.getElementById('libre');
  if(c) state.chantier=c.value.trim(); if(m) state.martelage=m.value.trim(); if(o) state.observations=o.value; if(l) state.libre=l.value;
  state.chantier=state.chantier||state.name||'Session sans nom';
  state.name=state.chantier;
}
function renderParamFields(){
  const c=document.getElementById('chantier'); const m=document.getElementById('martelage'); const o=document.getElementById('observations'); const l=document.getElementById('libre');
  if(c && c.value!==state.chantier)c.value=state.chantier||''; if(m && m.value!==state.martelage)m.value=state.martelage||''; if(o && o.value!==state.observations)o.value=state.observations||''; if(l && l.value!==state.libre)l.value=state.libre||'';
}
function createSession(){const name=(prompt('Nom du fichier / session ?','Nom du fichier')||'').trim(); if(!name)return; readParamFields(); save(); const s=normalizeSession(blankSession(name)); s.name=name; s.chantier=name; sessions.unshift(s); state=s; activeSessionId=s.id; resetSelection(); save(); renderParamFields(); setActiveTab('parametrages');}
function resumeSession(id){readParamFields(); save(); const s=sessions.find(x=>x.id===id); if(!s)return; state=normalizeSession(s); activeSessionId=state.id; resetSelection(); save(); setActiveTab('saisie');}
function deleteSession(id){if(sessions.length<=1)return alert('Il faut conserver au moins une session.'); const s=sessions.find(x=>x.id===id); if(!confirm(`Supprimer la session “${s?.name||''}” ?`))return; sessions=sessions.filter(x=>x.id!==id); if(state.id===id){state=sessions[0]; activeSessionId=state.id;} save(); render();}
function exportSession(id){resumeSession(id); setActiveTab('synthese');}
function renderSessions(){const el=document.getElementById('sessionsList'); if(!el)return; el.innerHTML=sessions.map(s=>`<div class="tree"><span><strong>${xmlEscape(s.name||s.chantier||'Session sans nom')}</strong>${s.locked?' <span class="status locked">Verrouillée</span>':' <span class="status open">En cours</span>'}${s.id===state.id?' <span class="muted">(active)</span>':''}<br><span class="muted">${(s.trees||[]).length} arbre(s) — ${((s.exportHistory||[]).length)} export(s) — dernière modification : ${fmtDate(s.updatedAt)}</span></span><span class="tree-actions"><button class="mini" onclick="resumeSession('${s.id}')">Reprendre</button><button class="mini" onclick="exportSession('${s.id}')">Exporter</button><button class="mini danger" onclick="deleteSession('${s.id}')">×</button></span></div>`).join('');}
function renderExportHistory(){const el=document.getElementById('exportHistory'); if(!el)return; const hist=state.exportHistory||[]; if(!hist.length){el.innerHTML='<p class="muted">Aucun export enregistré pour cette session.</p>';return;} el.innerHTML=hist.map(x=>`<div class="export-sheet"><strong>${xmlEscape(x.type||'Export')} — ${fmtDate(x.date)}</strong><br><span class="muted">${xmlEscape(x.fileName||'')} — ${x.trees||0} arbre(s)</span></div>`).join('');}
function renderParcelles(){const el=document.getElementById('parcelles'); if(!el)return; el.innerHTML=''; (state.parcelles||[]).forEach((parc,idx)=>{const wrap=document.createElement('div'); wrap.className='parcel-wrap'; const b=document.createElement('button'); b.textContent=parc; b.className=current.parcelle===parc?'selected':''; b.onclick=()=>{current.parcelle=current.parcelle===parc?null:parc; render();}; const edit=document.createElement('button'); edit.textContent='✎'; edit.className='mini'; edit.onclick=()=>{const nv=(prompt('Modifier la parcelle',parc)||'').trim(); if(!nv)return; state.parcelles[idx]=nv; state.trees.forEach(t=>{if(t.parcelle===parc)t.parcelle=nv;}); if(current.parcelle===parc)current.parcelle=nv; save(); render();}; const del=document.createElement('button'); del.textContent='×'; del.className='mini danger'; del.onclick=()=>{if(confirm(`Supprimer la parcelle “${parc}” ? Les arbres déjà saisis conserveront leur libellé.`)){state.parcelles.splice(idx,1); if(current.parcelle===parc)current.parcelle=null; save(); render();}}; wrap.appendChild(b); wrap.appendChild(edit); wrap.appendChild(del); el.appendChild(wrap);}); if(!state.parcelles.length) el.innerHTML='<p class="muted one-line">Aucune parcelle ajoutée. La saisie peut rester sans parcelle.</p>';}
function addParcelle(){if(guardLocked('ajouter une parcelle'))return; const name=(prompt('Ajouter une parcelle forestière','PF ')||'').trim(); if(!name)return; if(!state.parcelles.includes(name))state.parcelles.push(name); current.parcelle=name; save(); render();}
function sheetXmlTemplate(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${XLSX_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>`;}
async function writeParametragesSheet(zip){
  const parser=new DOMParser(); const serializer=new XMLSerializer();
  let workbookXml=await zip.file('xl/workbook.xml').async('string');
  let relsXml=await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const wb=parser.parseFromString(workbookXml,'application/xml');
  const rels=parser.parseFromString(relsXml,'application/xml');
  const entries=findSheetEntries(zip,workbookXml,relsXml);
  let entry=entries.find(e=>e.name==='Paramétrages');
  if(!entry){
    const relNodes=Array.from(rels.getElementsByTagName('Relationship'));
    const maxRid=Math.max(0,...relNodes.map(r=>parseInt((r.getAttribute('Id')||'').replace('rId',''),10)).filter(Number.isFinite));
    const rid='rId'+(maxRid+1);
    const wsNums=entries.map(e=>parseInt((e.path||'').match(/sheet(\d+)\.xml/)?.[1]||'0',10)).filter(Boolean);
    const sheetNum=Math.max(0,...wsNums)+1;
    const target=`worksheets/sheet${sheetNum}.xml`;
    const path=`xl/${target}`;
    const rel=rels.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships','Relationship');
    rel.setAttribute('Id',rid); rel.setAttribute('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'); rel.setAttribute('Target',target); rels.documentElement.appendChild(rel);
    const sheets=wb.getElementsByTagName('sheets')[0];
    const maxSheetId=Math.max(0,...Array.from(wb.getElementsByTagName('sheet')).map(sh=>parseInt(sh.getAttribute('sheetId'),10)).filter(Number.isFinite));
    const sh=wb.createElementNS(XLSX_NS,'sheet'); sh.setAttribute('name','Paramétrages'); sh.setAttribute('sheetId',String(maxSheetId+1)); sh.setAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','r:id',rid); sheets.insertBefore(sh,sheets.firstChild);
    zip.file('xl/workbook.xml',serializer.serializeToString(wb));
    zip.file('xl/_rels/workbook.xml.rels',serializer.serializeToString(rels));
    const ct=parser.parseFromString(await zip.file('[Content_Types].xml').async('string'),'application/xml');
    const ov=ct.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types','Override'); ov.setAttribute('PartName',`/${path}`); ov.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'); ct.documentElement.appendChild(ov); zip.file('[Content_Types].xml',serializer.serializeToString(ct));
    zip.file(path,sheetXmlTemplate()); entry={name:'Paramétrages',path};
  }
  const xml=await zip.file(entry.path).async('string'); const doc=parser.parseFromString(xml,'application/xml'); const sheetData=doc.getElementsByTagName('sheetData')[0];
  ['A1','A3','B3','A5','B5','A7','B7','A9','B9','T25','A82','A83','A84'].forEach(addr=>{const row=Array.from(sheetData.getElementsByTagName('row')).find(r=>parseInt(r.getAttribute('r'),10)===cellRow(addr)); if(row) removeCell(row,addr);});
  setCellText(doc,sheetData,'A1','Paramétrages');
  setCellText(doc,sheetData,'A3','Nom du fichier'); setCellText(doc,sheetData,'B3',state.chantier||'');
  setCellText(doc,sheetData,'A5','Martelage / estimation'); setCellText(doc,sheetData,'B5',state.martelage||'');
  setCellText(doc,sheetData,'A7','Observations / points importants'); setCellText(doc,sheetData,'B7',state.observations||'');
  setCellText(doc,sheetData,'A9','Entrée libre'); setCellText(doc,sheetData,'B9',state.libre||'');
  setCellText(doc,sheetData,'T25',state.martelage||'');
  setCellText(doc,sheetData,'A82',state.martelage||'');
  setCellText(doc,sheetData,'A83',state.observations||'');
  setCellText(doc,sheetData,'A84',state.libre||'');
  zip.file(entry.path,serializer.serializeToString(doc));
}

function duplicateLastTree(){
  if(guardLocked('dupliquer un arbre'))return;
  const t=(state.trees||[])[state.trees.length-1];
  if(!t){showFeedback('Aucun arbre à dupliquer'); return;}
  if(t.parcelle && !state.parcelles.includes(t.parcelle)) state.parcelles.push(t.parcelle);
  if(!state.projectEssences.includes(t.essence)) state.projectEssences.push(t.essence);
  setSelection({parcelle:t.parcelle||null, essence:t.essence, diametre:t.diametre, hauteur:t.hauteur, qualite:normalizeQualites(t.qualite), commentaire:t.commentaire||'', hasSup:!!t.hasSup, supHauteur:t.supHauteur||null});
  setEditIndex(null);
  render();
  showFeedback('🔁 Dernier arbre repris');
  scrollToParcelle();
}

function addSameAsLastTree(){
  if(guardLocked('ajouter un arbre identique'))return;
  const last=(state.trees||[])[state.trees.length-1];
  if(!last){showFeedback('Aucun arbre à reprendre'); return;}
  const base={parcelle:last.parcelle||null, essence:last.essence, diametre:last.diametre, hauteur:last.hauteur, qualite:normalizeQualites(last.qualite), commentaire:last.commentaire||'', hasSup:!!last.hasSup, supHauteur:last.supHauteur||null};
  const c=calculateTreeVolume(base);
  if(!c){alert('Impossible de recalculer le dernier arbre. Vérifiez les paramètres.'); return;}
  const tree={...base, commentaire:(base.commentaire||'').trim(), qualite:qualiteLabel(base.qualite)||null, ...c, ...currentGpsSnapshot(), numero:nextTreeNumber(), date:new Date().toISOString()};
  state.trees.push(tree);
  save();
  render();
  showFeedback(`⚡ Arbre #${tree.numero} ajouté à l’identique`);
}
function runSelfTests(){
  const results=[];
  const test=(name, ok)=>results.push({test:name, ok:!!ok});
  const previous={
    resineuxSettings:state.resineuxSettings,
    feuillusTarifs:state.feuillusTarifs,
    trees:state.trees,
    projectEssences:state.projectEssences,
    parcelles:state.parcelles
  };
  try{
    test('clé gros doigts définie', typeof BIG_FINGERS_MODE_KEY==='string' && BIG_FINGERS_MODE_KEY.length>0);
    test('aucune configuration prix active', typeof DEFAULT_PRICES==='undefined');
    test('Chêne classé feuillu', isFeuilluEssence('Chêne'));
    test('Douglas classé résineux', isResineuxEssence('Douglas'));

    const feuillu=calculateTreeVolume({essence:'Châtaignier',diametre:40,hauteur:10});
    test('bibliothèque tarifs chargée', !!tariffLibrary() && tariffLibrary().has('ADRIAN_II') && tariffLibrary().has('CHAUDE_12'));
    test('Adrian II table D40 H10 = 0,95', Math.abs(tariffLibrary().lookup('ADRIAN_II',40,10)-0.95)<0.000001);
    test('Chaudé 12 table D125 H28 = 15,42', Math.abs(tariffLibrary().lookup('CHAUDE_12',125,28)-15.42)<0.000001);
    test('cubage feuillu renvoie un volume depuis table', feuillu && Math.abs(feuillu.totalBO-tariffLibrary().lookup('ADRIAN_II',40,10))<0.000001 && feuillu.cubageType==='doubleEntry');

    const cheneSup=calculateTreeVolume({essence:'Chêne',diametre:50,hauteur:12,hasSup:true,supHauteur:4});
    test('chêne supérieur sépare sup et sciage sans modifier le total', cheneSup && cheneSup.sup>0 && cheneSup.sciage>0 && Math.abs(cheneSup.totalBO-feuillusVolumeByTarif('ADRIAN_II',50,12))<0.000001);

    state.feuillusTarifs=normalizeFeuillusTarifs({'Chêne':'ADRIAN_IV'});
    const cheneAdrianIvPrepared=calculateTreeVolume({essence:'Chêne',diametre:40,hauteur:10});
    test('tarif feuillu Adrian IV actif via table', cheneAdrianIvPrepared && cheneAdrianIvPrepared.tariffKey==='ADRIAN_IV' && Math.abs(cheneAdrianIvPrepared.totalBO-tariffLibrary().lookup('ADRIAN_IV',40,10))<0.000001);

    state.resineuxSettings=normalizeResineuxSettings({'Douglas':{height45:28}});
    const resinAuto=calculateTreeVolume({essence:'Douglas',diametre:40});
    test('résineux auto H45 routé vers Schaeffer rapide entrée simple', resinAuto && resinAuto.cubageGroup===ESSENCE_GROUPS.RESINEUX && resinAuto.cubageType==='singleEntry' && resinAuto.cubageMethod===CUBAGE_METHODS.SCHAEFFER_RAPIDE && resinAuto.tariffNumber===15 && Math.abs(resinAuto.v45-2.268)<0.01);

    state.resineuxSettings=normalizeResineuxSettings({'Douglas':{height45:28,manualTariffNumber:12}});
    const resinManual=calculateTreeVolume({essence:'Douglas',diametre:45});
    test('correction manuelle Schaeffer utilise le V45 du tarif manuel', resinManual && resinManual.tariffNumber===12 && Math.abs(resinManual.v45-2.0)<0.000001 && Math.abs(resinManual.totalBO-2.0)<0.000001);
    state.resineuxSettings=normalizeResineuxSettings({'Douglas':{method:CUBAGE_METHODS.TABLE_CUBAGE,tableTariffKey:'CHAUDE_10'}});
    const resinChaude=calculateTreeVolume({essence:'Douglas',diametre:40,hauteur:10});
    test('résineux cubé avec tarif Chaudé demande une hauteur et utilise la table', resinChaude && resinChaude.cubageMethod===CUBAGE_METHODS.TABLE_CUBAGE && resinChaude.cubageType==='doubleEntry' && resinChaude.tariffKey==='CHAUDE_10' && Math.abs(resinChaude.totalBO-0.89)<0.000001);
    test('listing CSV contient les colonnes enrichies', listingCsv([{numero:1,parcelle:'P1',essence:'Chêne',diametre:40,hauteur:10,qualite:'sec',hasSup:true,supHauteur:4,commentaire:'test',tariffLabel:'Adrian II',totalBO:0.95}]).split('\n')[0]==='Numéro;Parcelle;Essence;Diamètre;Hauteur de découpe;Qualité;Qualité supérieure chêne;Latitude;Longitude;Précision GPS (m);Statut GPS;Commentaire;Tarif utilisé;Volume BO (m³)');
    test('listing CSV contient tarif et volume par arbre', listingCsv([{numero:1,essence:'Chêne',diametre:40,hauteur:10,tariffLabel:'Adrian II',totalBO:0.95}]).split('\n')[1].includes('Adrian II;0.95'));
    test('listing CSV contient la qualité supérieure chêne', listingCsv([{numero:1,essence:'Chêne',diametre:50,hauteur:12,hasSup:true,supHauteur:4}]).split('\n')[1].includes(';4 m;'));
    const csvOrder=listingCsv([{numero:1,essence:'Chêne',diametre:40,hauteur:10},{numero:2,essence:'Douglas',diametre:45,cubageType:'singleEntry'},{numero:3,essence:'Hêtre',diametre:35,hauteur:8}]).split('\n');
    test('listing CSV conserve l’ordre terrain feuillus/résineux', csvOrder[1].includes('Chêne') && csvOrder[2].includes('Douglas') && csvOrder[3].includes('Hêtre'));
    test('safeFileName disponible pour CSV', safeFileName('Forêt / PF 12: Chêne')==='Foret_PF_12_Chene');
    test('listing CSV échappe les commentaires avec point-virgule', listingCsv([{numero:1,essence:'Chêne',commentaire:'à revoir; urgent'}]).includes('\"à revoir; urgent\"'));
    const oldTrees=state.trees, oldEdit=editIndex; state.trees=[]; setEditIndex(null); const nBefore=nextTreeNumber(); state.trees.push({numero:nBefore}); state.trees.push({numero:nextTreeNumber()}); test('numérotation lot successive', state.trees[0].numero+1===state.trees[1].numero); state.trees=oldTrees; setEditIndex(oldEdit);
    test('ExportManager présent en parallèle', !!ExportManager && typeof ExportManager.exportExcel==='function' && typeof legacyExportToTemplate==='function');


    test('Schaeffer rapide exact à 45 cm', Math.abs(schaefferRapideVolume(45,2.2)-2.2)<0.000001);
    test('adresse Excel feuillus stable', excelAddressFor(15,2)==='D5' && excelAddressFor(40,10)==='L10');
    test('adresse Excel résineux stable', resineuxExcelAddressFor(45,12)==='O10');
    test('validation saisie bloque hauteur sup incohérente', validateTreeInput({essence:'Chêne',diametre:40,hauteur:4,hasSup:true,supHauteur:6}).length>0);
    test('validation export détecte hors grille feuillus', validateTreeForExport({essence:'Chêne',diametre:130,hauteur:10}).length>0);
    test('validation export détecte hors grille résineux', validateResineuxBeforeWriting([{parcelle:'P1',essence:'Douglas',qualite:'sain',trees:[{diametre:115,tariffNumber:12,v45:2}]}],[{name:'Saisie ligne 1'}]).length>0);

    state.trees=[
      {essence:'Chêne',parcelle:'P1',qualite:'sain',diametre:40,hauteur:10,totalBO:1,sciage:1,sup:0},
      {essence:'Chêne',parcelle:'P2',qualite:'sain',diametre:40,hauteur:10,totalBO:1,sciage:1,sup:0},
      {essence:'Douglas',parcelle:'P1',qualite:'sec',diametre:45,totalBO:2,sciage:2,sup:0,tariffNumber:12,v45:2,cubageType:'singleEntry',cubageMethod:CUBAGE_METHODS.SCHAEFFER_RAPIDE}
    ];
    const fg=exportGroups();
    const rg=resineuxExportGroups();
    test('groupes feuillus séparés par parcelle + essence + qualité', fg.length===2 && fg.some(g=>g.parcelle==='P1') && fg.some(g=>g.parcelle==='P2'));
    test('groupes résineux séparés par parcelle + essence + qualité', rg.length===1 && rg[0].parcelle==='P1' && rg[0].qualite==='sec');

    const normalized=normalizeSession({name:'Import test',trees:[{essence:'Chêne'}]});
    test('normalisation session importée complète les structures', normalized.schemaVersion===SESSION_SCHEMA_VERSION && normalized.resineuxSettings && normalized.feuillusTarifs && Array.isArray(normalized.trees));

    test('libellé groupe associe parcelle et essence', groupLabel({parcelle:'P1', essence:'Douglas', qualite:'sain'})==='P1 — Douglas');
    test('version session définie', APP_VERSION==='foreval-cubage-1.2.01' && SESSION_SCHEMA_VERSION===17);
    const gpsTestTree={numero:1,essence:'Chêne',diametre:50,hauteur:12,totalBO:1.7,gpsLat:48.8566,gpsLng:2.3522,gpsAccuracy:5,gpsStatus:'ok'};
    test('GeoJSON SIG contient un point', JSON.parse(buildGeoJson([gpsTestTree])).features.length===1);
    test('KML SIG contient le numéro', buildKml([gpsTestTree]).includes('<name>1</name>'));
    test('GPX SIG contient un waypoint', buildGpx([gpsTestTree]).includes('<wpt')); 
    test('carte : extraction arbres GPS', mapValidTrees().length>=0);
    test('liste conserve l’ordre state.trees', state.trees[0].essence==='Chêne' && state.trees[2].essence==='Douglas');
    const summaryTest=groupedEssence();
    const summaryP1=summaryTest['P1|Chêne|sain'];
    test('synthèse calcule volume unitaire et diamètre', summaryP1 && summaryP1.nb===1 && summaryP1.totalBO===1 && summaryP1.diametreSum===40);
    test('tarif feuillu par défaut Adrian II', normalizeFeuillusTarifs({}).Chêne==='ADRIAN_II');
    test('catalogue tarifs feuillus actif', FEUILLUS_TARIFF_CATALOG.ADRIAN_IV.status==='active' && FEUILLUS_TARIFF_CATALOG.CHAUDE_12.status==='active');
  }catch(e){results.push({test:'exception self-test', ok:false, error:e.message});}
  finally{
    state.resineuxSettings=previous.resineuxSettings;
    state.feuillusTarifs=previous.feuillusTarifs;
    state.trees=previous.trees;
    state.projectEssences=previous.projectEssences;
    state.parcelles=previous.parcelles;
  }
  const failed=results.filter(r=>!r.ok);
  if(failed.length){console.warn('ForEval Cubage — tests échoués', failed);}
  else{console.info('ForEval Cubage — tests OK', results);}
  return {ok:failed.length===0, results};
}
window.FOREVAL_CUBAGE_SELF_TESTS = runSelfTests;

function render(){renderGpsStatus(); renderSessionBadge(); renderParamFields(); renderFeuillusTarifs(); renderResineuxTariffs(); renderSessions(); renderParcelles(); renderEssences(); renderButtons('diametres',DIAMETRES,'diametre'); renderButtons('hauteurs',HAUTEURS,'hauteur'); renderButtons('supHauteurs',SUP_HAUTEURS,'supHauteur'); renderQualites(); document.getElementById('diametreValue').textContent=current.diametre||'—'; document.getElementById('hauteurValue').textContent=(isResineuxEssence(current.essence)&&isResineuxSchaefferMode(current.essence))?'non requis':(current.hauteur||'—'); document.getElementById('supHauteurValue').textContent=current.supHauteur||'—'; document.getElementById('cheneSupCard').style.display=current.essence==='Chêne'?'block':'none'; document.getElementById('supOptions').className=''; positionCommentCard(); renderPreview(); renderCommentField(); renderQuantityField(); renderLast(); renderTreeList(); renderSummary(); renderTerrainResume(); renderStandAnalysis(); renderFeuillusTariffPreparation(); renderExportPlan(); renderExportHistory(); if(document.getElementById('carte')?.classList.contains('active')) refreshMap(); setInputsDisabled(); {const addBtn=document.getElementById('addTree'); const qty=readTreeQuantity(false)||1; addBtn.textContent=editIndex!==null?'Enregistrer la modification':(qty>1?`Ajouter ${qty} arbres`:'Ajouter l’arbre');} document.getElementById('cancelEdit').className=editIndex!==null?'secondary':'secondary hidden'; save();}

// --- TRACE GPS : pont minimal exposé au module trace.js ---
window.ForevalTraceBridge = {
  getState:()=>state,
  save,
  getMapState:()=>mapState,
  getMap:()=>mapState.map,
  initMap,
  refreshMap,
  mapOverlayChecked,
  downloadTextFile,
  buildExportFileName,
  showFeedback,
  safeFileName,
  xmlText
};

// --- 1.2.01 : SÉCURITÉ DES DONNÉES (panneau Sessions) — indépendant du moteur ---
function formatBytes(n){if(!Number.isFinite(n))return '—'; if(n<1024*1024)return `${Math.round(n/1024)} Ko`; if(n<1024*1024*1024)return `${(n/1024/1024).toFixed(1).replace('.',',')} Mo`; return `${(n/1024/1024/1024).toFixed(1).replace('.',',')} Go`;}
function renderDataSafety(){
  const el=document.getElementById('dataSafetyStatus'); if(!el)return;
  const st=window.FEStore?.status;
  if(!st){el.innerHTML='<span class="status locked">Stockage simple (localStorage)</span>'; return;}
  const backend=st.backend==='indexedDB'?'<span class="status open">IndexedDB</span>':'<span class="status locked">localStorage seul</span>';
  const persist=st.persisted===true?'<span class="status open">protégé contre l’effacement automatique</span>':(st.persisted===false?'<span class="status locked">non protégé : installez l’appli sur l’écran d’accueil</span>':'<span class="muted">protection inconnue</span>');
  const usage=st.usage!=null?`${formatBytes(st.usage)} utilisés${st.quota?` sur ${formatBytes(st.quota)}`:''}`:'';
  const last=st.lastSavedAt?`Dernier enregistrement : ${fmtDate(st.lastSavedAt)}`:'';
  const err=st.failing?`<br><strong class="danger-text">${xmlEscape(st.lastError||'Enregistrement en échec')}</strong>`:'';
  const corrupt=st.recoveredCorrupt?'<br><span class="danger-text">Des données illisibles ont été trouvées au démarrage. Elles sont conservées ci-dessous.</span>':'';
  el.innerHTML=`${backend} ${persist}<br><span class="muted">${[usage,last].filter(Boolean).join(' — ')}</span>${err}${corrupt}`;
}
async function renderBackups(){
  const el=document.getElementById('backupList'); if(!el||!window.FEStore?.listBackups)return;
  let list=[]; try{list=await window.FEStore.listBackups();}catch(e){el.innerHTML='<p class="muted">Copies de secours indisponibles.</p>'; return;}
  if(!list.length){el.innerHTML='<p class="muted">Aucune copie de secours pour l’instant. Elles se créent automatiquement pendant la saisie (au plus une toutes les 5 minutes).</p>'; return;}
  el.innerHTML=list.slice(0,40).map(b=>`<div class="tree"><span><strong>${xmlEscape(b.name||'Session')}</strong> <span class="muted">${b.reason==='suppression'?'— avant suppression':b.reason==='illisible'?'— données brutes':b.reason==='mise-a-jour'?'— avant mise à jour':''}</span><br><span class="muted">${fmtDate(b.savedAt)}${b.trees!=null?` — ${b.trees} arbre(s)`:''}</span></span><span class="tree-actions">${b.hasRaw?`<button class="mini" onclick="downloadRawBackup(${b.key})">Télécharger</button>`:`<button class="mini" onclick="restoreBackup(${b.key})">Restaurer</button>`}</span></div>`).join('');
}
async function restoreBackup(key){
  const b=await window.FEStore?.getBackup(key); if(!b||!b.data){alert('Copie introuvable.'); return;}
  if(!confirm(`Restaurer « ${b.name} » du ${fmtDate(b.savedAt)} ?\nElle sera ajoutée comme nouvelle session : rien n’est écrasé.`))return;
  readParamFields(); save();
  const s=normalizeSession(JSON.parse(JSON.stringify(b.data)));
  s.id=uid(); s.name=`${(s.name||s.chantier||'Session').replace(/ \(supprimée\)$/,'')} (copie du ${fmtDate(b.savedAt)})`; s.chantier=s.name; s.locked=false;
  sessions.unshift(s); state=s; activeSessionId=s.id; resetSelection(); save(); render(); renderBackups();
  showFeedback('Copie de secours restaurée');
}
async function downloadRawBackup(key){
  const b=await window.FEStore?.getBackup(key); if(!b||!b.raw)return;
  downloadTextFile(b.raw, `ForEval_Cubage_donnees_recuperees_${String(b.savedAt||'').slice(0,10)}.json`, 'application/json;charset=utf-8');
}
function setupDataSafety(){
  const exp=document.getElementById('storageAlertExport'); if(exp) exp.onclick=()=>exportSessionJson();
  const snap=document.getElementById('backupNow');
  if(snap) snap.onclick=async()=>{readParamFields(); save(); try{await window.FEStore?.snapshotNow(state,'manuel'); showFeedback('Copie de secours créée');}catch(e){alert('Copie impossible : '+(e?.message||e));} renderBackups();};
  window.FEStore?.onChange?.(()=>renderDataSafety());
  renderDataSafety(); renderBackups();
  // GPS par arbre : iOS coupe souvent la surveillance GPS en arrière-plan ; on la relance au retour.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible' || !gpsState.enabled) return;
    if(gpsState.watchId!==null && gpsSupported()) navigator.geolocation.clearWatch(gpsState.watchId);
    gpsState.watchId=null; gpsState.status='searching'; startGps();
  });
}
window.restoreBackup=restoreBackup; window.downloadRawBackup=downloadRawBackup; window.renderBackups=renderBackups;

function startForEvalCubage(){
  if(window.__FOREVAL_CUBAGE_STARTED__) return;
  window.__FOREVAL_CUBAGE_STARTED__ = true;
  document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>setActiveTab(b.dataset.tab));
  document.getElementById('newSession').onclick=createSession;
  const startGuideSessionButton = document.getElementById('startGuideSession');
  if (startGuideSessionButton) {
    startGuideSessionButton.onclick = function(){
      createSession();
      setActiveTab('parametrages');
    };
  }
  document.getElementById('confirmEssence').onclick=confirmEssence; document.getElementById('confirmQualite').onclick=confirmQualite;
  document.getElementById('addParcelle').onclick=addParcelle;
  ['chantier','martelage','observations','libre'].forEach(id=>{const el=document.getElementById(id); if(el) el.oninput=()=>{readParamFields(); save(); renderSessions(); renderSummary(); renderExportPlan();};});
  ['listFilterParcelle','listFilterEssence','listSearch'].forEach(id=>{const el=document.getElementById(id); if(el) el.oninput=renderTreeList; if(el) el.onchange=renderTreeList;});
  document.getElementById('addTree').onclick=addTree; document.getElementById('cancelEdit').onclick=cancelEdit; document.getElementById('exportModele').onclick=exportToTemplate; document.getElementById('exportCsv').onclick=exportCsv; const geoJsonBtn=document.getElementById('exportGeoJson'); if(geoJsonBtn)geoJsonBtn.onclick=exportGeoJson; const kmlBtn=document.getElementById('exportKml'); if(kmlBtn)kmlBtn.onclick=exportKml; const gpxBtn=document.getElementById('exportGpx'); if(gpxBtn)gpxBtn.onclick=exportGpx; const csvXYBtn=document.getElementById('exportCsvXY'); if(csvXYBtn)csvXYBtn.onclick=exportCsvXY; const sigAllBtn=document.getElementById('exportSigAll'); if(sigAllBtn)sigAllBtn.onclick=exportSigAll; const printPdfBtn=document.getElementById('printPdf'); if(printPdfBtn)printPdfBtn.onclick=printPdf; document.getElementById('clearAll').onclick=confirmReset; document.getElementById('toggleLock').onclick=toggleLock; document.getElementById('gloveToggle').onclick=toggleGloveMode; const bigBtn=document.getElementById('bigFingerToggle'); if(bigBtn)bigBtn.onclick=toggleBigFingersMode; const gpsBtn=document.getElementById('gpsToggle'); if(gpsBtn)gpsBtn.onclick=toggleGps; const commentEl=document.getElementById('treeComment'); if(commentEl)commentEl.oninput=e=>{current.commentaire=e.target.value;}; const quantityEl=document.getElementById('treeQuantity'); if(quantityEl)quantityEl.oninput=()=>render(); const keepDimsEl=document.getElementById('keepDimensionsMode'); if(keepDimsEl)keepDimsEl.onchange=toggleKeepDimensionsMode; const dupBtn=document.getElementById('duplicateTree'); if(dupBtn)dupBtn.onclick=duplicateLastTree; const sameBtn=document.getElementById('addSameTree'); if(sameBtn)sameBtn.onclick=addSameAsLastTree; const exportJsonBtn=document.getElementById('exportJson'); if(exportJsonBtn)exportJsonBtn.onclick=exportSessionJson; const importJsonInput=document.getElementById('importJsonInput'); if(importJsonInput)importJsonInput.onchange=e=>importSessionJsonFromFile(e.target.files?.[0]); const importJsonBtn=document.getElementById('importJson'); if(importJsonBtn)importJsonBtn.onclick=()=>importJsonInput?.click();
  if(localStorage.getItem(GLOVE_MODE_KEY)==='1'){document.body.classList.add('glove-mode');} if(localStorage.getItem(BIG_FINGERS_MODE_KEY)==='1'){document.body.classList.add('big-fingers-mode');}  const __rainBtn=document.getElementById('gloveToggle'); if(__rainBtn)__rainBtn.textContent=document.body.classList.contains('glove-mode')?'🌧️ Pluie activée':'🌧️ Pluie'; const __bigBtn=document.getElementById('bigFingerToggle'); if(__bigBtn)__bigBtn.textContent=document.body.classList.contains('big-fingers-mode')?'🖐️ Gros doigts activé':'🖐️ Gros doigts';
  // 1.2.01 : l'enregistrement du service worker et les mises à jour sont gérés par pwa-update.js.
  setupDataSafety();
  runSelfTests();
  setupMapEvents();
  if(window.TraceManager?.init) window.TraceManager.init(window.ForevalTraceBridge);
  initGpsFromPreference();
  render();
}
window.startForEvalCubage = startForEvalCubage;

// Démarrage direct : aucun module de connexion ou de licence n'est requis.
// 1.2.01 : quand storage.js est présent, c'est lui qui lance le démarrage une fois tous les modules chargés.
if (window.FEStore) {
  window.FEStore.appLoaded = true;
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startForEvalCubage, { once:true });
} else {
  startForEvalCubage();
}

