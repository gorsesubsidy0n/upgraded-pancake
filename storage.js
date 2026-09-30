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
        return true;
      } catch (e) {
        if (isQuota(e) && mode === 'ok') mode = 'full';
      }
    }
    memory[key] = v;
    usedMemory = true;
    return false;
  }

  function remove(key) {
    delete memory[key];
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

  return {
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
    /** Test seam: forget the probe result. */
    _reset: function () {
      mode = null; usedMemory = false;
      Object.keys(memory).forEach(k => delete memory[k]);
      Object.keys(sessionMemory).forEach(k => delete sessionMemory[k]);
    }
  };
})();
