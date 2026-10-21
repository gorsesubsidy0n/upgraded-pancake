// ============================================================
//  INSPIRE HABITS — boot.js
//  Last script to load. Holds the small page-level helpers that
//  used to be inline <script> blocks (which the CSP now blocks),
//  registers the offline service worker and starts the optional
//  feature layer.
// ============================================================

function switchHistoryTab(btn, panelId) {
  document.querySelectorAll('.htab').forEach(b => {
    b.classList.remove('active');
  });
  document.querySelectorAll('.history-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
}

function setIncludeWarmup(v) { state.includeWarmup = !!v; }
function setIncludeCooldown(v) { state.includeCooldown = !!v; }

// Offline support. Only over https or localhost: a service worker cannot
// register from file://, and the app still works there without one.
(function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const h = location.hostname;
  const secure = location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  if (!secure) return;
  const sw = navigator.serviceWorker;
  // Listen before registering: the worker may announce a staged update
  // while this page is still loading.
  sw.addEventListener('message', e => {
    if (e.data && e.data.type === 'ih-update-ready') ihShowUpdateBar(null);
  });
  window.addEventListener('load', () => {
    sw.register('sw.js').then(reg => {
      const offer = w => { if (w && sw.controller) ihShowUpdateBar(w); };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      // An app left open all week (the studio laptop, an installed phone
      // app) still hears about a new publish.
      setInterval(() => { reg.update().catch(() => {}); }, 3600000);
    }).catch(() => { /* offline mode is a bonus */ });
  });
})();

let ihWaitingWorker = null;
let ihReloading = false;

function ihShowUpdateBar(worker) {
  if (worker) ihWaitingWorker = worker;
  if (document.getElementById('ih-update-bar')) return;
  if (!document.body) return;
  const bar = document.createElement('div');
  bar.id = 'ih-update-bar';
  bar.className = 'ih-update-bar';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'Update ready.';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'ih-update-btn';
  go.textContent = 'Reload';
  go.addEventListener('click', ihApplyUpdate);
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'ih-update-later';
  later.setAttribute('aria-label', 'Later');
  later.textContent = '×';
  later.addEventListener('click', () => bar.remove());
  bar.append(text, go, later);
  document.body.appendChild(bar);
}

function ihApplyUpdate() {
  if (ihReloading) return;
  const running = typeof state !== 'undefined' && state && state.timer && state.timer.isRunning;
  if (running && !confirm('A class timer is running. Reload now to get the update? ' +
                          'The class pauses and can be resumed.')) return;
  ihReloading = true;
  const sw = navigator.serviceWorker;
  const w = ihWaitingWorker;
  if (w && sw && sw.controller && w.state === 'installed') {
    let done = false;
    const reloadOnce = () => { if (!done) { done = true; location.reload(); } };
    sw.addEventListener('controllerchange', reloadOnce);
    w.postMessage({ type: 'skipWaiting' });
    // If the switch somehow never comes, reload anyway.
    setTimeout(reloadOnce, 4000);
  } else {
    location.reload();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof ihFeaturesInit === 'function') {
    try { ihFeaturesInit(); } catch (e) { console.error('features init failed', e); }
  }
});
