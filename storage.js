// ForEval Cubage 1.2.01 — stockage durable des sessions.
// IndexedDB est le stockage principal (une entrée par session).
// localStorage reste un miroir de secours, lu au démarrage.
// Copies de secours automatiques, quarantaine des données illisibles,
// demande de stockage persistant et alerte visible en cas d'échec.
// Ce module ne touche ni au moteur de cubage, ni aux tarifs, ni aux exports.
(function(){
  'use strict';

  const LS_SESSIONS = 'forevalCubageSessionsV1';
  const LS_ACTIVE = 'forevalCubageActiveSessionV1';
  const DB_NAME = 'forevalCubage';
  const DB_VERSION = 1;
  const BACKUP_INTERVAL_MS = 5 * 60 * 1000;   // une copie de secours au plus toutes les 5 min par session
  const BACKUPS_PER_SESSION = 12;
  const OPEN_TIMEOUT_MS = 3000;

  const status = {
    backend: 'localStorage',
    persisted: null,
    usage: null,
    quota: null,
    lastError: '',
    lastSavedAt: null,
    mirrorOk: true,
    failing: false,
    recoveredCorrupt: false
  };

  let db = null;
  let dirty = null;
  let writing = false;
  let idleWaiters = [];
  const lastWritten = new Map();   // id -> updatedAt déjà écrit
  const lastBackupAt = new Map();  // id -> timestamp
  let knownIds = new Set();
  let tombstones = [];

  // ---------- utilitaires IndexedDB ----------
  function reqP(r){
    return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  function txDone(t){
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error || new Error('Erreur IndexedDB'));
      t.onabort = () => rej(t.error || new Error('Écriture annulée (stockage plein ?)'));
    });
  }
  function withTimeout(p, ms){
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('IndexedDB ne répond pas')), ms))]);
  }
  function openDb(){
    return new Promise((res, rej) => {
      if(!('indexedDB' in window)) { rej(new Error('IndexedDB indisponible')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch(e){ rej(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if(!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', {keyPath:'id'});
        if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if(!d.objectStoreNames.contains('backups')){
          const s = d.createObjectStore('backups', {keyPath:'key', autoIncrement:true});
          s.createIndex('sessionId', 'sessionId');
        }
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => { try{ d.close(); }catch(e){} };
        res(d);
      };
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('IndexedDB bloquée par un autre onglet'));
    });
  }

  // ---------- lecture localStorage ----------
  function readLocalStorage(){
    let raw = null;
    try { raw = localStorage.getItem(LS_SESSIONS); } catch(e){ return {list:[], raw:null, corrupt:false}; }
    if(!raw) return {list:[], raw:null, corrupt:false};
    try {
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return {list:parsed.filter(s => s && s.id), raw, corrupt:false};
      return {list:[], raw, corrupt:true};
    } catch(e){
      return {list:[], raw, corrupt:true};
    }
  }
  function readActiveId(){
    try { return localStorage.getItem(LS_ACTIVE); } catch(e){ return null; }
  }
  function stamp(s){
    const t = Date.parse(s && s.updatedAt);
    return Number.isFinite(t) ? t : 0;
  }

  // ---------- démarrage ----------
  async function boot(){
    const ls = readLocalStorage();
    let activeId = readActiveId();
    let list = ls.list;

    // Données illisibles : on ne les écrase jamais, on les met de côté.
    if(ls.corrupt && ls.raw){
      status.recoveredCorrupt = true;
      try { localStorage.setItem(LS_SESSIONS + '_illisible_' + Date.now(), ls.raw); } catch(e){}
    }

    try {
      db = await withTimeout(openDb(), OPEN_TIMEOUT_MS);
      status.backend = 'indexedDB';
      const t = db.transaction(['sessions','meta'], 'readonly');
      const pAll = reqP(t.objectStore('sessions').getAll());
      const pOrder = reqP(t.objectStore('meta').get('order'));
      const pActive = reqP(t.objectStore('meta').get('activeId'));
      const pTomb = reqP(t.objectStore('meta').get('tombstones'));
      const [idbList, order, idbActive, tomb] = await Promise.all([pAll, pOrder, pActive, pTomb]);
      tombstones = Array.isArray(tomb) ? tomb : [];
      const dead = new Set(tombstones);

      // Fusion : pour chaque session, la version la plus récente gagne.
      const byId = new Map();
      (idbList || []).forEach(s => { if(s && s.id) byId.set(s.id, s); });
      ls.list.forEach(s => {
        if(dead.has(s.id) && !byId.has(s.id)) return; // supprimée volontairement
        const other = byId.get(s.id);
        if(!other || stamp(s) > stamp(other)) byId.set(s.id, s);
      });
      const ids = [];
      (Array.isArray(order) ? order : []).forEach(id => { if(byId.has(id) && !ids.includes(id)) ids.push(id); });
      ls.list.forEach(s => { if(byId.has(s.id) && !ids.includes(s.id)) ids.push(s.id); });
      byId.forEach((_, id) => { if(!ids.includes(id)) ids.push(id); });
      list = ids.map(id => byId.get(id));
      activeId = idbActive || activeId;

      (idbList || []).forEach(s => { if(s && s.id) lastWritten.set(s.id, s.updatedAt); });

      if(ls.corrupt && ls.raw){
        const wt = db.transaction(['backups'], 'readwrite');
        wt.objectStore('backups').add({sessionId:'_illisible', name:'Données illisibles récupérées', savedAt:new Date().toISOString(), raw:ls.raw, reason:'illisible'});
        await txDone(wt).catch(() => {});
      }
    } catch(e){
      db = null;
      status.backend = 'localStorage';
      status.lastError = (e && e.message) || String(e);
    }

    list.forEach(s => knownIds.add(s.id));
    FEStore.bootSessions = list.length ? list : null;
    FEStore.bootActiveId = activeId;
    requestPersistence();
  }

  // ---------- persistance ----------
  async function requestPersistence(){
    try {
      if(navigator.storage && navigator.storage.persisted){
        status.persisted = await navigator.storage.persisted();
        if(!status.persisted && navigator.storage.persist) status.persisted = await navigator.storage.persist();
      }
    } catch(e){}
    await refreshEstimate();
    notify();
  }
  async function refreshEstimate(){
    try {
      if(navigator.storage && navigator.storage.estimate){
        const est = await navigator.storage.estimate();
        status.usage = est.usage ?? null;
        status.quota = est.quota ?? null;
      }
    } catch(e){}
  }

  // ---------- écriture ----------
  function saveSessions(list, activeId){
    // 1. Miroir localStorage, synchrone : survit à une fermeture brutale juste après la saisie.
    let mirrorOk = true;
    try {
      localStorage.setItem(LS_SESSIONS, JSON.stringify(list));
      localStorage.setItem(LS_ACTIVE, activeId);
    } catch(e){ mirrorOk = false; }
    status.mirrorOk = mirrorOk;

    // 2. IndexedDB, asynchrone, écritures regroupées.
    if(db){
      dirty = {list, activeId};
      pump();
    } else if(!mirrorOk){
      fail('Stockage plein ou indisponible : les dernières saisies ne sont PAS enregistrées sur cet appareil.');
    } else {
      ok();
    }
  }

  function pump(){
    if(writing) return;
    writing = true;
    (async () => {
      while(dirty){
        const job = dirty; dirty = null;
        try { await writeJob(job); ok(); }
        catch(e){
          status.lastError = (e && e.message) || String(e);
          if(status.mirrorOk) { notify(); }   // la copie localStorage tient encore
          else fail('Enregistrement impossible (' + status.lastError + '). Exportez la session en JSON sans attendre.');
        }
      }
      writing = false;
      const w = idleWaiters; idleWaiters = [];
      w.forEach(fn => fn());
    })();
  }

  async function writeJob(job){
    const now = Date.now();
    const t = db.transaction(['sessions','meta','backups'], 'readwrite');
    const done = txDone(t);
    const sStore = t.objectStore('sessions');
    const mStore = t.objectStore('meta');
    const bStore = t.objectStore('backups');
    const currentIds = new Set(job.list.map(s => s.id));
    const written = [];

    job.list.forEach(s => {
      if(lastWritten.get(s.id) === s.updatedAt && knownIds.has(s.id)) return; // inchangée
      sStore.put(s);
      written.push([s.id, s.updatedAt]);
      const lb = lastBackupAt.get(s.id) || 0;
      if(now - lb > BACKUP_INTERVAL_MS && (s.trees || []).length){
        bStore.add({sessionId:s.id, name:s.name || s.chantier || 'Session', savedAt:new Date(now).toISOString(), trees:(s.trees||[]).length, reason:'auto', data:s});
        lastBackupAt.set(s.id, now);
        trimBackups(bStore, s.id);
      }
    });

    // Sessions supprimées : copie de secours puis suppression.
    knownIds.forEach(id => {
      if(currentIds.has(id)) return;
      const r = sStore.get(id);
      r.onsuccess = () => {
        const old = r.result;
        if(old) bStore.add({sessionId:id, name:(old.name || old.chantier || 'Session') + ' (supprimée)', savedAt:new Date(now).toISOString(), trees:(old.trees||[]).length, reason:'suppression', data:old});
        sStore.delete(id);
      };
      if(!tombstones.includes(id)) tombstones.push(id);
    });
    tombstones = tombstones.slice(-200);

    mStore.put(job.list.map(s => s.id), 'order');
    mStore.put(job.activeId, 'activeId');
    mStore.put(tombstones, 'tombstones');

    await done;
    written.forEach(([id, u]) => lastWritten.set(id, u));
    knownIds = currentIds;
    status.lastSavedAt = new Date().toISOString();
  }

  function trimBackups(bStore, sessionId){
    const r = bStore.index('sessionId').getAllKeys(sessionId);
    r.onsuccess = () => {
      const keys = (r.result || []).slice().sort((a,b) => a - b);
      const extra = keys.length - BACKUPS_PER_SESSION;
      for(let i = 0; i < extra; i++) bStore.delete(keys[i]);
    };
  }

  function flush(){
    if(!writing && !dirty) return Promise.resolve();
    return new Promise(res => { idleWaiters.push(res); setTimeout(res, 4000); });
  }

  // ---------- copies de secours ----------
  async function listBackups(){
    if(!db) return [];
    const t = db.transaction(['backups'], 'readonly');
    const all = await reqP(t.objectStore('backups').getAll());
    return (all || []).map(b => ({key:b.key, sessionId:b.sessionId, name:b.name, savedAt:b.savedAt, trees:b.trees, reason:b.reason, hasRaw:!!b.raw}))
      .sort((a,b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }
  async function getBackup(key){
    if(!db) return null;
    const t = db.transaction(['backups'], 'readonly');
    return reqP(t.objectStore('backups').get(key));
  }
  async function snapshotNow(session, reason){
    if(!db || !session) return;
    const t = db.transaction(['backups'], 'readwrite');
    const bStore = t.objectStore('backups');
    bStore.add({sessionId:session.id, name:session.name || session.chantier || 'Session', savedAt:new Date().toISOString(), trees:(session.trees||[]).length, reason:reason || 'manuel', data:JSON.parse(JSON.stringify(session))});
    trimBackups(bStore, session.id);
    await txDone(t);
  }

  // ---------- état visible ----------
  function ok(){
    const wasFailing = status.failing;
    status.failing = false;
    if(wasFailing) hideAlert();
    notify();
  }
  function fail(message){
    status.failing = true;
    showAlert(message);
    notify();
  }
  function showAlert(message){
    const el = document.getElementById('storageAlert');
    if(!el) return;
    const txt = el.querySelector('.banner-text');
    if(txt) txt.textContent = '⚠️ ' + message;
    el.classList.remove('hidden');
  }
  function hideAlert(){
    const el = document.getElementById('storageAlert');
    if(el) el.classList.add('hidden');
  }
  const listeners = [];
  function onChange(fn){ listeners.push(fn); }
  function notify(){ listeners.forEach(fn => { try{ fn(status); }catch(e){} }); }

  const FEStore = window.FEStore = {
    status, saveSessions, flush, listBackups, getBackup, snapshotNow, onChange, refreshEstimate,
    bootSessions:null, bootActiveId:null
  };

  // ---------- chargement ordonné de l'application ----------
  const APP_SCRIPTS = ['app.js', 'veille.js', 'trace.js', 'carte-hors-ligne.js', 'pwa-update.js'];
  function loadScripts(){
    let remaining = APP_SCRIPTS.length;
    const started = () => {
      remaining -= 1;
      if(remaining === 0 && typeof window.startForEvalCubage === 'function') window.startForEvalCubage();
    };
    APP_SCRIPTS.forEach(src => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // ordre d'exécution garanti
      s.onload = started;
      s.onerror = started; // un module annexe absent ne bloque pas la saisie
      document.body.appendChild(s);
    });
  }
  FEStore.ready = boot().catch(e => { status.lastError = String(e); }).then(() => {
    if(document.body) loadScripts();
    else document.addEventListener('DOMContentLoaded', loadScripts, {once:true});
  });
})();
