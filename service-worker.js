// ForEval Cubage 1.2.01 — service worker.
// Application : servie depuis le cache (démarrage hors ligne). Une nouvelle version
// s'installe en arrière-plan et n'est activée que lorsque l'utilisateur accepte.
// Tuiles de carte : cache « foreval-tuiles », conservé d'une version à l'autre.
const VERSION = '1.2.01';
// Le préfixe inclut le dossier de publication : deux versions publiées côte à côte
// sur applis-foret.github.io ne suppriment jamais le cache l'une de l'autre.
const PREFIX = 'foreval-cubage@' + self.registration.scope + '#';
const CACHE = PREFIX + 'v1-2-01';
const TILE_CACHE = 'foreval-tuiles';
const MAX_TILES = 25000;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './tarifs.js',
  './storage.js',
  './app.js',
  './veille.js',
  './trace.js',
  './carte-hors-ligne.js',
  './pwa-update.js',
  './jszip.min.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/veille.mp4',
  './modele-cubage-feuillus.xlsx',
  './modele-cubage-resineux.xlsx',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './logo-foreval-preview.png',
  './symbole-foreval-cubage.png'
];
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'server.arcgisonline.com',
  'tile.opentopomap.org',
  'basemaps.cartocdn.com',
  'data.geopf.fr'
];

self.addEventListener('install', event => {
  // cache:'reload' contourne le cache HTTP de GitHub Pages : on récupère bien les nouveaux fichiers.
  event.waitUntil((async () => {
    // Une version de ce schéma est-elle déjà installée ici ? Si oui, la page saura proposer la mise à jour.
    const hadManagedVersion = (await caches.keys()).some(k => k.startsWith(PREFIX));
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(url => fetch(new Request(url, {cache:'reload'})).then(res => {
      if(!res.ok) throw new Error(`${url} : ${res.status}`);
      return cache.put(url, res);
    })));
    // Première installation, ou remplacement d'une 1.9.x (sans bandeau de mise à jour) :
    // activation directe, la nouvelle appli s'ouvre au lancement suivant.
    // Sinon, on attend l'accord de l'utilisateur (pwa-update.js).
    if(!hadManagedVersion) self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k !== CACHE && k.startsWith(PREFIX))
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if(event.data && event.data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({version:VERSION});
});

function isTile(url){
  return TILE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
}

let putsSinceTrim = 0;
async function trimTiles(cache){
  putsSinceTrim = 0;
  const keys = await cache.keys();
  const extra = keys.length - MAX_TILES;
  for(let i = 0; i < extra; i++) await cache.delete(keys[i]); // les plus anciennes d'abord
}

async function tileResponse(request){
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request.url);
  if(hit) return hit;
  try {
    // Requête CORS pour obtenir une réponse lisible et stockable (les <img> de Leaflet partent en no-cors).
    const res = await fetch(request.url, {mode:'cors', credentials:'omit'});
    if(res.ok){
      cache.put(request.url, res.clone()).then(() => { if(++putsSinceTrim >= 200) trimTiles(cache); }).catch(() => {});
    }
    return res;
  } catch(e){
    try { return await fetch(request); } catch(e2){ return Response.error(); }
  }
}

async function appResponse(request){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, {ignoreSearch: request.mode === 'navigate'});
  if(hit) return hit;
  if(request.mode === 'navigate'){
    const shell = await cache.match('./index.html');
    try { return await fetch(request); } catch(e){ if(shell) return shell; throw e; }
  }
  return fetch(request);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);
  if(isTile(url)){ event.respondWith(tileResponse(request)); return; }
  if(url.origin === self.location.origin){ event.respondWith(appResponse(request)); return; }
  // Autres domaines : comportement normal du navigateur.
});
