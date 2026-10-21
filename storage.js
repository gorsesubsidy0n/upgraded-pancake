// ============================================================
//  INSPIRE HABITS — storage.js
//  One safe door to localStorage.
// ============================================================
//
//  Safari refuses localStorage outright in three situations a studio
//  actually hits:
//
//    1. The app was opened by double-clicking index.html. Safari treats
//       every file:// page as an untrusted origin and throws
//       SecurityError on the first touch of localStorage — Chrome and
//       Edge allow it, which is why this only ever shows up on a Mac.
//    2. Private Browsing, or Settings → Privacy → Block all cookies.
//    3. The 5 MB-ish quota is full.
//
//  Reads used to be wrapped in try/catch in some places and bare in
//  others, and the bare ones were in the worst possible spot: the
//  `const state = {…}` block at the top of app.js. A throw there stops
//  app.js mid-file, so every function below it never gets defined and
//  the whole app is dead — not just saving.
//
//  So: nothing outside this file touches localStorage directly. A failed
//  write is reported, never thrown, and falls back to memory so the
//  session keeps working even when the browser will not persist a thing.
//
//  This file must load before any file that stores something.
// ============================================================

const IHStore = (function () {
  const PROBE = '__ih_probe__';

  // Anything that failed to reach localStorage lives here for the rest of
  // the session. It means a blocked browser still behaves normally until
  // the tab closes, instead of silently dropping every save.
  const memory = Object.create(null);

  let mode = null;       // 'ok' | 'file' | 'blocked' | 'full'
  let usedMemory = false;

  // Safari can throw on the property access itself, not just on getItem,
  // when cookies are blocked entirely. Even reaching for it needs a guard.
  function raw() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }

  function isQuota(e) {
    if (!e) return false;
    return e.code === 22 || e.code === 1014 ||
           e.name === 'QuotaExceededError' ||
           e.name === 'NS_ERROR_DOM_QUOTA_REACHED';
  }

  // A round-trip write, not a truthiness check on window.localStorage.
  // Safari in private mode hands back a real-looking object that throws
  // the moment you write to it, so only an actual write proves anything.
  function detect() {
    const ls = raw();
    if (!ls) return (location.protocol === 'file:') ? 'file' : 'blocked';
    try {
      ls.setItem(PROBE, '1');
      ls.removeItem(PROBE);
      return 'ok';
    } catch (e) {
      if (isQuota(e)) return 'full';
      return (location.protocol === 'file:') ? 'file' : 'blocked';
    }
  }

  function currentMode() {
    if (mode === null) mode = detect();
    return mode;
  }

  function get(key) {
    // Memory wins: it only ever holds keys whose write failed, so it is
    // newer than whatever localStorage still has for that key.
    if (key in memory) return memory[key];
    const ls = raw();
    if (!ls) return null;
    try { return ls.getItem(key); } catch (e) { return null; }
  }

  /** @returns {boolean} true only when the value actually reached disk. */
  function set(key, value) {
    const v = String(value);
    const ls = raw();
    if (ls) {
      try {
        ls.setItem(key, v);
        delete memory[key];
        mirrorWrite(key, v);
        return true;
      } catch (e) {
        if (isQuota(e) && mode === 'ok') mode = 'full';
      }
    }
    memory[key] = v;
    usedMemory = true;
    mirrorWrite(key, v);
    return false;
  }

  function remove(key) {
    delete memory[key];
    mirrorWrite(key, null);
    const ls = raw();
    if (!ls) return;
    try { ls.removeItem(key); } catch (e) {}
  }

  /** `fallback` is a VALUE, not a JSON string: getJSON('k', []) returns []
   *  when the key is missing or the stored text is corrupt. Pass a fresh
   *  literal at each call site so callers never share one object. */
  function getJSON(key, fallback) {
    const fb = (fallback === undefined) ? null : fallback;
    const raw = get(key);
    if (raw === null || raw === undefined || raw === '') return fb;
    try {
      const parsed = JSON.parse(raw);
      return (parsed === null && fb !== null) ? fb : parsed;
    } catch (e) { return fb; }
  }

  function setJSON(key, obj) {
    let s;
    try { s = JSON.stringify(obj); } catch (e) { return false; }
    return set(key, s);
  }

  function isSafari() {
    const ua = navigator.userAgent || '';
    return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
  }

  /** True when running as an installed app (Add to Dock / Add to Home
   *  Screen) rather than a browser tab. Installed apps are exempt from
   *  Safari's seven-day data purge, so the warning about it must not
   *  keep nagging someone who has already done the right thing. */
  function isInstalled() {
    try {
      if (navigator.standalone === true) return true; // iOS
      return !!(window.matchMedia &&
                window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
  }

  /** Plain-language reason plus the actual fix, or '' when all is well. */
  function explain() {
    switch (currentMode()) {
      case 'ok': return '';
      case 'full':
        return 'This browser\'s storage is full, so new saves can\'t be kept. ' +
               'Delete a few old saved classes, or back them up to a file and ' +
               'clear the rest.';
      case 'file':
        return 'The app was opened straight from a folder (a file:// address), ' +
               'and Safari refuses to store anything for pages opened that way. ' +
               'Open the app from its web address instead — or use the Back up ' +
               'button to keep classes in a file.';
      default:
        return 'This browser is set to block website storage — usually Private ' +
               'Browsing, or "Block all cookies" in Safari\'s Privacy settings. ' +
               'Classes will work for now but won\'t survive closing the tab. ' +
               'Use Back up to keep them in a file.';
    }
  }

  function shortReason() {
    switch (currentMode()) {
      case 'ok':   return '';
      case 'full': return 'storage full';
      case 'file': return 'opened as a file';
      default:     return 'storage blocked';
    }
  }

  /** Rough bytes held under our own keys — for the quota warning. */
  function usage() {
    const ls = raw();
    if (!ls) return 0;
    let total = 0;
    try {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.indexOf('hiit_') === 0) {
          total += k.length + ((ls.getItem(k) || '').length);
        }
      }
    } catch (e) { return 0; }
    return total * 2; // UTF-16: two bytes per code unit
  }

  // ── sessionStorage ────────────────────────────────────────
  // Separate from localStorage on purpose: who is teaching right now
  // should survive a mid-class refresh but not outlive the tab, so the
  // next instructor to open the app is always asked again.
  // Safari blocks this one too on file:// pages, so it needs the same
  // property-access guard and its own memory overlay.
  const sessionMemory = Object.create(null);

  function rawSession() {
    try { return window.sessionStorage || null; } catch (e) { return null; }
  }

  function getSession(key) {
    if (key in sessionMemory) return sessionMemory[key];
    const ss = rawSession();
    if (!ss) return null;
    try { return ss.getItem(key); } catch (e) { return null; }
  }

  function setSession(key, value) {
    const v = String(value);
    const ss = rawSession();
    if (ss) {
      try { ss.setItem(key, v); delete sessionMemory[key]; return true; }
      catch (e) {}
    }
    sessionMemory[key] = v;
    return false;
  }

  function removeSession(key) {
    delete sessionMemory[key];
    const ss = rawSession();
    if (!ss) return;
    try { ss.removeItem(key); } catch (e) {}
  }

  // ── IndexedDB mirror ──────────────────────────────────────
  // localStorage is the source of truth because the whole app reads it
  // synchronously at boot. But Safari deletes script-writable storage after
  // seven days without a visit, and a studio that runs one class a week for
  // a term lands right on that line. IndexedDB is mirrored write-behind, so
  // if localStorage comes back empty a restore can be offered. Not every
  // browser purges both, so this is a safety net, not a guarantee.
  const MIRROR_DB = 'ih-mirror', MIRROR_STORE = 'kv';
  const mirrorQueue = new Map();
  let mirrorTimer = null;
  let mirrorDbPromise = null;
  // Held until checkMirror has looked: the app writes empty defaults on a
  // fresh boot, and mirroring those first would erase the very backup we
  // are about to offer. Keys found lost stay protected until the user
  // chooses to restore or discard.
  let mirrorHold = true;
  const protect = new Set();

  function mirrored(key) {
    return key.indexOf('hiit_') === 0 && key.indexOf('live_session') === -1;
  }

  function openMirror() {
    if (mirrorDbPromise) return mirrorDbPromise;
    mirrorDbPromise = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(MIRROR_DB, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(MIRROR_STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return mirrorDbPromise;
  }

  function mirrorWrite(key, value) {
    if (!mirrored(key)) return;
    mirrorQueue.set(key, value);
    if (mirrorTimer || mirrorHold) return;
    mirrorTimer = setTimeout(flushMirror, 600);
  }

  function flushMirror() {
    mirrorTimer = null;
    if (mirrorHold || !mirrorQueue.size) return;
    // Keys still waiting on the restore question stay queued (not dropped):
    // once the user answers, the newest value for them still has to reach
    // the mirror.
    const batch = [];
    Array.from(mirrorQueue.entries()).forEach(function (kv) {
      if (protect.has(kv[0])) return;
      batch.push(kv);
      mirrorQueue.delete(kv[0]);
    });
    if (!batch.length) return;
    openMirror().then(function (db) {
      if (!db) return;
      try {
        const tx = db.transaction(MIRROR_STORE, 'readwrite');
        const os = tx.objectStore(MIRROR_STORE);
        batch.forEach(function (kv) {
          if (kv[1] === null) os.delete(kv[0]); else os.put(kv[1], kv[0]);
        });
      } catch (e) {}
    });
  }

  function mirrorAll() {
    const ls = raw();
    if (!ls) return;
    try {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && mirrored(k)) mirrorQueue.set(k, ls.getItem(k));
      }
    } catch (e) {}
    if (mirrorQueue.size && !mirrorTimer && !mirrorHold) mirrorTimer = setTimeout(flushMirror, 0);
  }

  // The app writes defaults ('[]', '{}') on boot, so "missing" alone would
  // miss a purge that was followed by a fresh start.
  function isLost(key, mirrorValue) {
    const cur = get(key);
    if (cur === null) return true;
    return /^(\[\]|\{\}|null|"")$/.test(cur) && String(mirrorValue).length > cur.length;
  }

  /** Calls back with { lost: {key: value}, count } — keys the mirror has
   *  that localStorage no longer does. Also seeds the mirror with what is
   *  already in localStorage, and asks the browser to treat storage as
   *  persistent. */
  function checkMirror(userCb) {
    function cb(res) {
      Object.keys(res.lost).forEach(function (k) { protect.add(k); });
      mirrorHold = false;
      if (mirrorQueue.size && !mirrorTimer) mirrorTimer = setTimeout(flushMirror, 600);
      userCb(res);
    }
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {}
    openMirror().then(function (db) {
      if (!db) return cb({ lost: {}, count: 0 });
      const lost = {};
      let count = 0;
      try {
        const req = db.transaction(MIRROR_STORE, 'readonly').objectStore(MIRROR_STORE).openCursor();
        req.onsuccess = function () {
          const c = req.result;
          if (c) {
            if (isLost(c.key, c.value)) { lost[c.key] = c.value; count++; }
            c.continue();
          } else {
            if (!count) mirrorAll();
            cb({ lost: lost, count: count });
          }
        };
        req.onerror = function () { cb({ lost: {}, count: 0 }); };
      } catch (e) { cb({ lost: {}, count: 0 }); }
    });
  }

  /** Writes the lost values back and lets the mirror follow again.
   *  The restore bar can sit there for a whole class, so each key is
   *  checked again now: if something real was saved under it meanwhile,
   *  that newer data wins. Lists of items with an id are merged (items
   *  only the backup has are added back); anything else is left alone.
   *  @returns {{restored:number, merged:number, kept:number}} */
  function restoreLost(lost) {
    const res = { restored: 0, merged: 0, kept: 0 };
    Object.keys(lost || {}).forEach(function (k) {
      protect.delete(k);
      const backup = lost[k];
      if (backup === null || backup === undefined) return;
      if (isLost(k, backup)) {
        if (set(k, backup)) res.restored++; else res.kept++;
        return;
      }
      const merged = mergeById(get(k), backup);
      if (merged !== null && set(k, merged)) res.merged++;
      else {
        res.kept++;
        const cur = get(k);
        if (cur !== null) mirrorWrite(k, cur);
      }
    });
    flushNow();
    return res;
  }

  // Current items win; backup items whose id is not present are appended.
  // Returns the merged JSON text, or null when the two can't be merged.
  function mergeById(curText, backupText) {
    let cur, bak;
    try { cur = JSON.parse(curText); bak = JSON.parse(backupText); } catch (e) { return null; }
    if (!Array.isArray(cur) || !Array.isArray(bak)) return null;
    const hasId = function (x) { return x && typeof x === 'object' && x.id !== undefined && x.id !== null; };
    if (!cur.every(hasId) || !bak.every(hasId)) return null;
    const seen = new Set(cur.map(function (x) { return String(x.id); }));
    const extra = bak.filter(function (x) { return !seen.has(String(x.id)); });
    if (!extra.length) return null;
    return JSON.stringify(cur.concat(extra));
  }

  function flushNow() {
    if (mirrorHold) return;
    if (mirrorTimer) clearTimeout(mirrorTimer);
    flushMirror();
  }

  /** The user said no: the mirror becomes a copy of what is here now. */
  function discardLost() {
    protect.clear();
    clearMirror();
    mirrorAll();
    flushNow();
  }
  function clearMirror() {
    mirrorQueue.clear();
    openMirror().then(function (db) {
      if (!db) return;
      try { db.transaction(MIRROR_STORE, 'readwrite').objectStore(MIRROR_STORE).clear(); } catch (e) {}
    });
  }

  // A tab closed inside the 600 ms batching window must still reach the mirror.
  try { window.addEventListener('pagehide', function () { if (mirrorTimer && !mirrorHold) { clearTimeout(mirrorTimer); flushMirror(); } }); } catch (e) {}

  return {
    checkMirror: checkMirror, restoreLost: restoreLost, discardLost: discardLost,
    get: get, set: set, remove: remove,
    getJSON: getJSON, setJSON: setJSON,
    getSession: getSession, setSession: setSession, removeSession: removeSession,
    mode: currentMode,
    ok: function () { return currentMode() === 'ok'; },
    /** True once any write has fallen back to memory this session. */
    degraded: function () { return usedMemory; },
    explain: explain,
    shortReason: shortReason,
    isSafari: isSafari,
    isInstalled: isInstalled,
    usage: usage,
    _mergeById: mergeById,
    /** Test seam: forget the probe result. */
    _reset: function () {
      mode = null; usedMemory = false;
      Object.keys(memory).forEach(k => delete memory[k]);
      Object.keys(sessionMemory).forEach(k => delete sessionMemory[k]);
    }
  };
})();
