// ForEval Cubage 1.2.01 — maintien de l'écran allumé pendant la trace GPS.
// 1. API Wake Lock (Safari 16.4+, Chrome) ;
// 2. sur iPad / iPhone, en plus, une vidéo muette en boucle (contourne le défaut
//    de Wake Lock dans les applis installées sur l'écran d'accueil avant iOS 18.4).
// Ne touche à aucune donnée.
(function(){
  'use strict';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let wanted = false;
  let sentinel = null;
  let video = null;
  let retryArmed = false;
  const listeners = [];

  function state(){
    return {
      wanted,
      wakeLock: !!(sentinel && !sentinel.released),
      video: !!(video && !video.paused),
      active: !!((sentinel && !sentinel.released) || (video && !video.paused))
    };
  }
  function notify(){ const s = state(); listeners.forEach(fn => { try{ fn(s); }catch(e){} }); }

  async function requestWakeLock(){
    if(!('wakeLock' in navigator) || document.visibilityState !== 'visible') return false;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => { notify(); });
      return true;
    } catch(e){ sentinel = null; return false; }
  }

  function ensureVideo(){
    if(video) return video;
    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.loop = true;
    video.src = 'vendor/veille.mp4';
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';
    video.addEventListener('pause', notify);
    video.addEventListener('playing', notify);
    document.body.appendChild(video);
    return video;
  }
  async function playVideo(){
    try { await ensureVideo().play(); return true; } catch(e){ return false; }
  }

  // Si le navigateur refuse sans geste de l'utilisateur, on réessaie au prochain toucher.
  function armRetry(){
    if(retryArmed) return;
    retryArmed = true;
    const retry = () => {
      retryArmed = false;
      document.removeEventListener('pointerdown', retry, true);
      if(wanted) acquire();
    };
    document.addEventListener('pointerdown', retry, true);
  }

  async function acquire(){
    if(!wanted) return state();
    const okLock = (sentinel && !sentinel.released) ? true : await requestWakeLock();
    let okVideo = false;
    if(isIOS || !okLock) okVideo = await playVideo();
    if(!okLock && !okVideo) armRetry();
    notify();
    return state();
  }

  async function enable(){ wanted = true; return acquire(); }

  async function disable(){
    wanted = false;
    try { if(sentinel && !sentinel.released) await sentinel.release(); } catch(e){}
    sentinel = null;
    if(video){ try{ video.pause(); }catch(e){} }
    notify();
    return state();
  }

  // Le verrou est libéré automatiquement quand la page passe en arrière-plan : on le reprend au retour.
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && wanted) acquire();
    else notify();
  });

  window.EcranActif = {
    enable, disable, state,
    onChange: fn => listeners.push(fn),
    supported: ('wakeLock' in navigator) || isIOS,
    isIOS
  };
})();
