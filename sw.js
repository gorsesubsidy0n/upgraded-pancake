// ============================================================
//  INSPIRE HABITS — sw.js
//  Offline shell.
//
//  The app's own files (SHELL) are served from the cache straight away —
//  so it opens instantly, and offline — and checked against the network
//  in the background. When anything has changed, the WHOLE new set is
//  downloaded into a side cache first and the page shows an
//  "Update ready — Reload" bar. The new set only goes live on the next
//  page load, so a page never runs a mix of old and new files.
//
//  Bump APP_VERSION when you re-publish: the new worker then installs a
//  fresh copy of everything and the bar appears on open pages. Without a
//  bump, changed files are still noticed by the background check.
// ============================================================
const APP_VERSION = '2026.10.9';
const CACHE = 'inspire-habits-' + APP_VERSION;
const STAGE = CACHE + '-next';
const STAGE_DONE = '__ih_stage_complete__';
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  './', 'index.html', 'style.css', 'manifest.json',
  'actions.js', 'auth.js', 'storage.js', 'bootcheck.js',
  'exercise-db.js', 'muscle-map.js', 'app.js', 'programming.js',
  'editor.js', 'mixed_ability.js', 'profiles.js', 'qr.js', 'participant.js', 'remote.js',
  'features.js', 'boot.js',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
];

const SCOPE = new URL('./', self.location.href).href;
// './' and 'index.html' are the same page; keep one copy of it.
const SHELL_FILES = Array.from(new Set(SHELL.map(u => (u === './' ? 'index.html' : u))));
const SHELL_KEYS = new Set(SHELL_FILES.map(u => SCOPE + u));

/** The cache key for a request that belongs to the shell, else ''. */
function shellKey(url) {
  const bare = url.origin + url.pathname;
  if (bare.indexOf(SCOPE) !== 0) return '';
  const key = SCOPE + (bare.slice(SCOPE.length) || 'index.html');
  return SHELL_KEYS.has(key) ? key : '';
}

function cacheable(res) {
  return !!res && res.ok && res.status === 200 && res.type === 'basic';
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // 'reload' skips the browser's HTTP cache, so a new version never
      // installs yesterday's files. One missing file must not abort the
      // whole install; it is fetched on first use instead.
      .then(cache => Promise.all(SHELL_FILES.map(u =>
        fetch(new Request(SCOPE + u, { cache: 'reload' }))
          .then(res => (cacheable(res) ? cache.put(SCOPE + u, res) : null))
          .catch(() => null))))
      // First install: take over at once. An update waits until the page
      // says so (the Reload bar), so a running class is never switched
      // underneath the instructor.
      .then(() => { if (!self.registration.active) return self.skipWaiting(); })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.indexOf('inspire-habits-') === 0 && k !== CACHE && k !== STAGE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then(res => { clearTimeout(timer); resolve(res); },
                        err => { clearTimeout(timer); reject(err); });
  });
}

// ── background update check ─────────────────────────────────
let refreshing = null;
let lastRefresh = 0;

function stageReady() {
  return caches.has(STAGE).then(has => has
    ? caches.open(STAGE).then(c => c.match(STAGE_DONE)).then(hit => !!hit)
    : false);
}

function sameBody(a, b) {
  return Promise.all([a.arrayBuffer(), b.arrayBuffer()]).then(([x, y]) => {
    if (x.byteLength !== y.byteLength) return false;
    const p = new Uint8Array(x), q = new Uint8Array(y);
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
    return true;
  });
}

function notifyUpdate() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => list.forEach(c => c.postMessage({ type: 'ih-update-ready', version: APP_VERSION })));
}

/** Downloads the whole shell into the side cache. Only a complete,
 *  all-OK set that really differs from what is live is kept. */
function refreshShell() {
  if (refreshing) return refreshing;
  // A publish that is still half-uploaded (one file 404s) must not make
  // every request re-download the whole app; try again a minute later.
  if (Date.now() - lastRefresh < 60000) return Promise.resolve();
  lastRefresh = Date.now();
  refreshing = Promise.all(SHELL_FILES.map(u =>
    fetch(SCOPE + u, { cache: 'no-cache' }).then(res => (cacheable(res) ? [SCOPE + u, res] : null), () => null)))
    .then(pairs => {
      if (pairs.some(p => !p)) return false;
      return caches.open(CACHE).then(live =>
        Promise.all(pairs.map(([key, res]) => live.match(key).then(old =>
          (old ? sameBody(old, res.clone()) : false)))))
        .then(same => {
          if (same.every(Boolean)) return false;
          return caches.delete(STAGE)
            .then(() => caches.open(STAGE))
            .then(stage => Promise.all(pairs.map(([key, res]) => stage.put(key, res)))
              .then(() => stage.put(STAGE_DONE, new Response('1'))))
            .then(() => true);
        });
    })
    .then(changed => (changed ? notifyUpdate() : null))
    .catch(() => null)
    .then(() => { refreshing = null; });
  return refreshing;
}

function revalidate(key) {
  return stageReady().then(ready => {
    if (ready) return notifyUpdate();
    return fetch(key, { cache: 'no-cache' }).then(fresh => {
      if (!cacheable(fresh)) return null;
      return caches.open(CACHE).then(live => live.match(key).then(old => {
        if (!old) return live.put(key, fresh);
        return sameBody(old, fresh).then(same => (same ? null : refreshShell()));
      }));
    }, () => null);
  }).catch(() => null);
}

/** A page load is the moment a staged update goes live. */
function promoteStage() {
  return stageReady().then(ready => {
    if (!ready) return null;
    return caches.open(STAGE).then(stage => stage.keys().then(keys =>
      caches.open(CACHE).then(live => Promise.all(keys
        .filter(r => r.url.indexOf(STAGE_DONE) === -1)
        .map(r => stage.match(r).then(res => res && live.put(r, res)))))))
      .then(() => caches.delete(STAGE));
  }).catch(() => null);
}

function serveShell(event, key) {
  const req = event.request;
  const first = req.mode === 'navigate' ? promoteStage() : Promise.resolve();
  return first.then(() => caches.open(CACHE)).then(live => live.match(key).then(hit => {
    if (hit) {
      event.waitUntil(revalidate(key));
      return hit;
    }
    return fromNetwork(new Request(key, { cache: 'no-cache' })).then(res => {
      if (cacheable(res)) {
        const copy = res.clone();
        event.waitUntil(live.put(key, copy).catch(() => {}));
      }
      return res;
    });
  })).catch(() => fetch(req));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The server's phone-origin probe must never be answered from cache.
  if (url.pathname.endsWith('/__phone-origin')) return;
  // Media seeking asks for byte ranges; the cache can't answer those.
  if (req.headers.has('range')) return;

  const key = shellKey(url);
  if (key) {
    event.respondWith(serveShell(event, key));
    return;
  }

  event.respondWith(
    fromNetwork(req).then(res => {
      if (cacheable(res)) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}));
      }
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(hit =>
        hit || (req.mode === 'navigate' ? caches.match(SCOPE + 'index.html') : Response.error()))
    )
  );
});

self.addEventListener('message', event => {
  const d = event.data;
  if (d === 'skipWaiting' || (d && d.type === 'skipWaiting')) self.skipWaiting();
});
