// ForEval Cubage 1.2.01 — gestion des mises à jour de l'application installée.
// Vérifie s'il existe une nouvelle version (au démarrage, au retour dans l'appli,
// puis toutes les 30 min si le réseau est là) et propose un bandeau « Mettre à jour ».
// Rien n'est rechargé sans l'accord de l'utilisateur ; les données sont écrites avant.
(function(){
  'use strict';
  if(!('serviceWorker' in navigator)) return;

  const banner = document.getElementById('updateBanner');
  const button = document.getElementById('updateApply');
  const later = document.getElementById('updateLater');
  let waitingWorker = null;
  let userAccepted = false;

  function show(worker){
    waitingWorker = worker;
    if(banner) banner.classList.remove('hidden');
  }

  async function apply(){
    if(!waitingWorker) return;
    if(window.TraceManager?.isRecording?.() && !confirm('Une trace GPS est en cours. Elle reprendra automatiquement après la mise à jour, avec une courte coupure.\nMettre à jour maintenant ?')) return;
    if(button){ button.disabled = true; button.textContent = 'Mise à jour…'; }
    try {
      if(typeof readParamFields === 'function') readParamFields();
      if(typeof save === 'function') save();
      if(window.FEStore?.snapshotNow && typeof state !== 'undefined') await window.FEStore.snapshotNow(state, 'mise-a-jour').catch(() => {});
      await window.FEStore?.flush?.();
    } catch(e){}
    userAccepted = true;
    waitingWorker.postMessage({type:'SKIP_WAITING'});
    // Filet de sécurité si l'évènement controllerchange n'arrive pas.
    setTimeout(() => location.reload(), 4000);
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!userAccepted) return; // première installation : pas de rechargement surprise
    userAccepted = false;
    location.reload();
  });

  if(button) button.onclick = apply;
  if(later) later.onclick = () => banner && banner.classList.add('hidden');

  navigator.serviceWorker.register('service-worker.js').then(reg => {
    if(reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if(!w) return;
      w.addEventListener('statechange', () => {
        if(w.state === 'installed' && navigator.serviceWorker.controller) show(w);
      });
    });
    const check = () => { if(navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') check(); });
    window.addEventListener('online', check);
    setInterval(check, 30 * 60 * 1000);
    check();
  }).catch(() => {});

  window.PwaUpdate = {apply, show};
})();
