/* ══════════════════════════════════════════════════════════════════════
   participant.js — "scan to track" for AMRAP, 100-Rep, Custom and any
   class carrying a Core Burner.

   There is no backend here, so the QR code carries the class itself: the
   exercise list is packed into the URL fragment. A phone that scans it
   loads the same page in athlete mode and renders a private tracker.

   Because the class rides in the fragment — the part after '#', which no
   browser ever sends to a server — the page can be served from anywhere.
   Point the code at a published copy on the open web and phones open it on
   mobile data, with no studio wifi and no guest password. The host only
   ever serves static files; it never sees a class or an athlete.

   On arrival each phone claims its own page for the class, by name or just
   as "this phone". The athlete id is written into the link, so reopening it
   from history — or unlocking a phone that went blank — lands back on the
   same page. Progress is stored per class *and* per athlete, so two people
   sharing a tablet never overwrite each other.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Style → tracker mode. A class in any other style is still scannable when
  // it has a Core Burner, and then uses the 'b' (finisher) tracker.
  const TRACKABLE = { amrap: 'a', hundred: 'h', custom: 'c' };
  const BURNER_ONLY = 'b';
  const HASH_KEY = 'c';
  const UID_KEY = 'u';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const hasBurner = w => !!(w && w.coreBurner && (w.coreBurner.exercises || []).length);
  const trackerMode = w => !w ? null : (TRACKABLE[w.style] || (hasBurner(w) ? BURNER_ONLY : null));

  // ── Payload codec ────────────────────────────────────────────────────
  // Field separators are stripped from content rather than escaped: exercise
  // names never legitimately contain them.
  const clean = s => String(s == null ? '' : s).replace(/[|^~]/g, ' ').trim();

  function b64urlEncode(str) {
    const bin = unescape(encodeURIComponent(str));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  const packItems = list => (list || [])
    .map(i => [clean(i.name), clean(i.reps), clean(i.unit)].join('^')).join('~');
  const unpackItems = raw => String(raw || '').split('~').filter(Boolean).map(chunk => {
    const f = chunk.split('^');
    return { name: f[0] || '', reps: f[1] || '', unit: f[2] || '' };
  });

  // v2 adds main-block rounds and a Core Burner block. v1 links are still
  // read, so a code scanned before an update keeps working for that class.
  function encodePayload(p) {
    const b = p.burner || {};
    return b64urlEncode([
      '2', p.mode, p.sid, clean(p.title), clean(p.meta),
      String(p.rounds || 1), packItems(p.items),
      String(b.rounds || 0), String(b.work || 0), String(b.rest || 0), packItems(b.items),
    ].join('|'));
  }

  function decodePayload(raw) {
    const parts = b64urlDecode(raw).split('|');
    if (parts[0] === '1') {
      return { mode: parts[1], sid: parts[2], title: parts[3], meta: parts[4],
               rounds: 1, items: unpackItems(parts[5]), burner: null };
    }
    if (parts[0] !== '2') throw new Error('unsupported payload version');
    const bRounds = parseInt(parts[7], 10) || 0;
    const bItems = unpackItems(parts[10]);
    return {
      mode: parts[1], sid: parts[2], title: parts[3], meta: parts[4],
      rounds: parseInt(parts[5], 10) || 1,
      items: unpackItems(parts[6]),
      burner: (bRounds && bItems.length)
        ? { rounds: bRounds, work: parseInt(parts[8], 10) || 0,
            rest: parseInt(parts[9], 10) || 0, items: bItems }
        : null,
    };
  }

  // ── Who is holding the phone ─────────────────────────────────────────
  // There is no backend, so an "account" is just a short id kept in the
  // link. A name gives a readable one; anyone who would rather not type
  // gets a random id that sticks to the device instead.
  const DEVICE_KEY = 'ih_device_v1';
  const LAST_NAME_KEY = 'ih_last_name_v1';
  const NAMES_KEY = 'ih_athlete_names_v1';

  function deviceId() {
    let d = '';
    try { d = localStorage.getItem(DEVICE_KEY) || ''; } catch (e) {}
    if (!/^d[a-z0-9]{5,}$/.test(d)) {
      d = 'd' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
      try { localStorage.setItem(DEVICE_KEY, d); } catch (e) {}
    }
    return d;
  }
  const isDeviceUid = uid => /^d[a-z0-9]{6,}$/.test(String(uid || ''));
  const slugName = n => String(n || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

  function loadNames() { try { return JSON.parse(localStorage.getItem(NAMES_KEY)) || {}; } catch (e) { return {}; } }
  function rememberName(uid, name) {
    const m = loadNames(); m[uid] = name;
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(m));
      localStorage.setItem(LAST_NAME_KEY, name);
    } catch (e) {}
  }
  const lastName = () => { try { return localStorage.getItem(LAST_NAME_KEY) || ''; } catch (e) { return ''; } };
  const titleCase = s => String(s).replace(/-+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

  // A link can be reopened on a phone that never typed the name, so fall
  // back to reading it out of the id itself.
  function displayName(uid) {
    const saved = loadNames()[uid];
    if (saved) return saved;
    return isDeviceUid(uid) ? 'This phone' : (titleCase(uid) || 'Athlete');
  }
  const initials = n => (String(n || '').trim().split(/\s+/).slice(0, 2)
    .map(w => w[0] || '').join('').toUpperCase()) || '👤';

  // ── Per-athlete progress ─────────────────────────────────────────────
  const storeKey = (sid, uid) => 'ih_athlete_' + sid + '_' + uid;
  const legacyKey = sid => 'ih_athlete_' + sid;

  function loadProgress(sid, uid) {
    try {
      const raw = localStorage.getItem(storeKey(sid, uid));
      if (raw) return JSON.parse(raw) || {};
      // Progress saved before athletes had ids belongs to whoever is here now.
      const old = localStorage.getItem(legacyKey(sid));
      if (old) {
        const p = JSON.parse(old) || {};
        localStorage.removeItem(legacyKey(sid));
        saveProgress(sid, uid, p);
        return p;
      }
      return {};
    } catch (e) { return {}; }
  }
  function saveProgress(sid, uid, data) {
    try { localStorage.setItem(storeKey(sid, uid), JSON.stringify(data)); } catch (e) {}
  }

  const two = n => (n < 10 ? '0' : '') + n;
  function fmtClock(ms) {
    if (ms == null || ms < 0) ms = 0;
    const t = Math.floor(ms / 1000);
    return Math.floor(t / 60) + ':' + two(t % 60);
  }

  /* ════════════════════════════════════════════════════════════════════
     INSTRUCTOR SIDE — build the link and show the QR code
     ════════════════════════════════════════════════════════════════════ */

  const MODE_COPY = {
    a: { title: '🔄 Scan to track your rounds', hint: 'Log every round and add a note without touching anyone else\'s screen.' },
    h: { title: '💯 Scan for your rep checklist', hint: 'Tick each exercise off as you finish its reps.' },
    c: { title: '🛠️ Scan for your class checklist', hint: 'Keep your place round by round, at your own pace.' },
    b: { title: '🎯 Scan for the Core Burner', hint: 'See the finisher and tick each move as you go.' },
  };

  const fmtMins = secs => {
    const m = Math.round(secs / 60);
    return m + ' min';
  };

  function classPayloadFromWorkout(w) {
    const mode = trackerMode(w);
    if (!mode) return null;

    const pick = ex => ({ name: ex.name, reps: ex.reps, unit: ex.unit });
    const items = (w.exercises || []).map(pick);

    const cb = hasBurner(w) ? w.coreBurner : null;
    const burner = cb ? {
      rounds: Math.max(1, cb.rounds || 1),
      work: cb.work, rest: cb.rest,
      items: cb.exercises.map(pick),
    } : null;

    const rounds = (w.style === 'custom' && w.custom && w.custom.rounds) ? w.custom.rounds : 1;

    let meta;
    if (mode === 'h') {
      meta = items.reduce((sum, i) => sum + (parseInt(i.reps, 10) || 0), 0) + ' total reps';
    } else if (mode === 'a') {
      meta = (w.mainDur || 20) + ' min cap';
    } else if (mode === 'c') {
      meta = rounds + (rounds === 1 ? ' round · ' : ' rounds · ') + items.length + ' moves';
    } else {
      meta = burner.items.length + ' core moves · ' + fmtMins(
        burner.rounds * burner.items.length * (burner.work + burner.rest));
    }

    return {
      mode, items, meta, rounds, burner,
      sid: (w.athleteSid || (w.athleteSid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6))),
      title: (w.styleCfg && w.styleCfg.name ? w.styleCfg.name : w.style) + ' · ' + (w.muscle || 'full') + ' focus',
    };
  }

  /* ── Where the QR code points ──────────────────────────────────────────
     A link to the instructor's laptop only resolves inside the building.
     Pointing at a published copy instead lets phones open the class on
     mobile data — the class still travels in the '#' fragment, which is
     never sent to that host. */
  const HOST_KEY = 'hiit_athlete_host_v1';

  function normalizeBase(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    let u;
    try { u = new URL(s); } catch (e) { return ''; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname || u.hostname.indexOf('.') < 0) return '';
    let p = u.pathname || '/';
    if (!/\.html?$/i.test(p) && !/\/$/.test(p)) p += '/';
    return u.origin + p;
  }

  // Addresses that only resolve from inside the building.
  function isLocalAddress(h) {
    h = String(h || '').toLowerCase();
    if (!h || h === 'localhost' || h === '::1' || /\.local$/.test(h)) return true;
    return /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
           /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }

  // Loopback is worse than a LAN address: every phone resolves it to itself,
  // so a code containing it can never work, wifi or not.
  function isLoopback(h) {
    h = String(h || '').toLowerCase();
    return h === 'localhost' || h === '::1' || /^127\./.test(h);
  }

  // serve.js reports the address phones should use, because a page loaded on
  // http://localhost has no way of discovering the laptop's wifi IP itself.
  let phoneOrigin = null;              // null = not asked yet, '' = none available
  function loadPhoneOrigin(done) {
    if (phoneOrigin !== null) { done(phoneOrigin); return; }
    if (location.protocol === 'file:' || typeof fetch !== 'function') { phoneOrigin = ''; done(''); return; }
    let settled = false;
    const finish = v => { if (settled) return; settled = true; phoneOrigin = v || ''; done(phoneOrigin); };
    setTimeout(() => finish(''), 1500);
    fetch('__phone-origin', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => finish(j && j.origin))
      .catch(() => finish(''));
  }

  function savedHost() {
    try { return normalizeBase(localStorage.getItem(HOST_KEY) || ''); } catch (e) { return ''; }
  }

  // Best address first: wherever this page already is if it is public, then
  // the published copy the instructor saved, then the local fallback.
  function athleteBase() {
    const here = location.protocol === 'file:' ? '' : location.href.split('#')[0].split('?')[0];
    if (here && !isLocalAddress(location.hostname)) {
      return { url: here, kind: 'public', label: location.host };
    }
    const saved = savedHost();
    if (saved) {
      let label = saved;
      try { label = new URL(saved).host; } catch (e) {}
      return { url: saved, kind: 'published', label };
    }
    if (!here) return { url: '', kind: 'file', label: '' };

    if (isLoopback(location.hostname)) {
      // Swap in the wifi address the server told us about, if there is one.
      if (phoneOrigin) {
        const swapped = phoneOrigin + here.slice(location.origin.length);
        let label = phoneOrigin;
        try { label = new URL(swapped).host; } catch (e) {}
        return { url: swapped, kind: 'lan', label };
      }
      return { url: here, kind: 'loopback', label: location.host };
    }
    return { url: here, kind: 'lan', label: location.host };
  }

  function athleteUrl(payload, base) {
    const b = base || athleteBase();
    if (!b.url) return '';
    return b.url + '#' + HASH_KEY + '=' + encodePayload(payload);
  }

  // app.js declares `state` with const, so it is a global *lexical* binding and
  // never appears on window. Read it as a free variable instead.
  function currentWorkout() {
    try { return (typeof state !== 'undefined' && state) ? state.workout : null; }
    catch (e) { return null; }
  }

  // How the current address will behave once a phone scans it.
  const REACH = {
    public: { cls: 'ok', icon: '📶', head: 'Works anywhere',
      msg: 'This page is already on the open web, so phones open the class on <b>mobile data</b>. No studio wifi needed.' },
    published: { cls: 'ok', icon: '📶', head: 'Works anywhere',
      msg: 'The code points at your published copy, so phones open the class on <b>mobile data</b>. No studio wifi needed.' },
    lan: { cls: 'warn', icon: '⚠️', head: 'Studio wifi required',
      msg: 'The code points at <b>this laptop</b>, so it only works for phones already on the studio wifi. Publish a copy once and the code works on any phone, anywhere.' },
    loopback: { cls: 'warn', icon: '🚫', head: 'Phones cannot reach this',
      msg: 'This code says <b>localhost</b>, which every phone reads as itself — scanning it will never work. ' +
        'Open the app at the wifi address the server printed (for example http://192.168.1.50:8080), or publish a copy below.' },
    file: { cls: 'warn', icon: '🚫', head: 'Phones cannot reach this',
      msg: 'This page is open straight from a file, so there is no address to scan. Publish a copy to fix it for good.' },
  };

  let hostFormOpen = false;

  function hostFormHtml() {
    const saved = savedHost();
    return '<div class="qr-host-form">' +
      '<label for="qr-host-input">Web address of your published copy</label>' +
      '<input id="qr-host-input" type="url" inputmode="url" spellcheck="false" ' +
        'placeholder="https://yourname.github.io/inspire-habits/" value="' + esc(saved) + '">' +
      '<div class="qr-host-actions">' +
        '<button class="qr-btn primary" onclick="__ihSaveHost()">Save</button>' +
        (saved ? '<button class="qr-btn" onclick="__ihClearHost()">Remove</button>' : '') +
        '<button class="qr-btn" onclick="__ihToggleHostForm()">Cancel</button>' +
      '</div>' +
      '<div class="qr-host-help">Put this folder on any free static host — GitHub Pages, a Netlify drop, ' +
        'Cloudflare Pages — then paste the address here once. The class itself travels in the ' +
        '<code>#</code> part of the link, which browsers never send to a server, so the host only ever ' +
        'serves files: it never sees your class or your athletes.</div>' +
    '</div>';
  }

  function reachHtml(base) {
    const r = REACH[base.kind] || REACH.lan;
    return '<div class="qr-reach ' + r.cls + '">' +
      '<div class="qr-reach-row">' +
        '<span class="qr-reach-icon">' + r.icon + '</span>' +
        '<div class="qr-reach-text"><b>' + r.head + '</b>' +
          (base.label ? ' · <span class="qr-reach-host">' + esc(base.label) + '</span>' : '') +
          '<div>' + r.msg + '</div></div>' +
        '<button class="qr-btn tiny" onclick="__ihToggleHostForm()">' +
          (savedHost() ? 'Change' : 'Set up') + '</button>' +
      '</div>' +
      (hostFormOpen ? hostFormHtml() : '') +
    '</div>';
  }

  window.showClassQR = function showClassQR() {
    const w = currentWorkout();
    if (!w) return;
    const payload = classPayloadFromWorkout(w);
    if (!payload) {
      if (window.showToast) showToast('Scan-to-track works for AMRAP, 100 Rep and Custom classes, ' +
        'or any class with a Core Burner.');
      return;
    }
    // Ask the server which address phones should use before drawing, so a
    // code generated on localhost still points somewhere reachable.
    loadPhoneOrigin(() => paintClassQR(payload));
  };

  function paintClassQR(payload) {
    const base = athleteBase();
    const url = athleteUrl(payload, base);
    const modal = document.getElementById('qr-modal');
    const body = document.getElementById('qr-modal-body');
    if (!modal || !body) return;

    let svg;
    if (!url) {
      svg = '<div class="qr-error">No address to point at yet.<br>Publish a copy below.</div>';
    } else if (base.kind === 'loopback') {
      // Drawing a localhost code would only look like a broken scanner.
      svg = '<div class="qr-error">No code yet — <b>localhost</b> is not an address<br>' +
            'any other phone can open. See below.</div>';
    } else {
      try {
        svg = QR.svg(url, { size: 360, level: 'L', margin: 4 });
      } catch (e) {
        svg = '<div class="qr-error">This class is too long to fit in a QR code.<br>' +
              'Share the link below instead.</div>';
      }
    }

    const copy = MODE_COPY[payload.mode] || MODE_COPY.h;
    const showLink = url && base.kind !== 'loopback';
    body.innerHTML =
      '<div class="qr-head">' +
        '<div class="qr-title">' + copy.title + '</div>' +
        '<div class="qr-sub">' + esc(payload.title) + ' · ' + esc(payload.meta) +
          (payload.burner && payload.mode !== 'b'
            ? ' · 🎯 ' + payload.burner.items.length + '-move Core Burner' : '') +
        '</div>' +
      '</div>' +
      '<div class="qr-code-wrap">' + svg + '</div>' +
      reachHtml(base) +
      (showLink
        ? '<div class="qr-url-label">Or send this link:' +
            '<button class="qr-btn tiny" onclick="__ihCopyLink()">Copy</button></div>' +
          '<div class="qr-url" id="qr-url">' + esc(url) + '</div>'
        : '') +
      '<div class="qr-hint">' + copy.hint + ' Each phone asks who is training, then keeps that ' +
        'athlete\'s own page — so two people can share a tablet, and a phone that goes blank ' +
        'reopens exactly where it was.</div>';

    modal.style.display = 'flex';
  }

  window.__ihToggleHostForm = function () {
    hostFormOpen = !hostFormOpen;
    showClassQR();
    const inp = document.getElementById('qr-host-input');
    if (inp) { inp.focus(); inp.select(); }
  };
  window.__ihSaveHost = function () {
    const inp = document.getElementById('qr-host-input');
    if (!inp) return;
    const raw = inp.value.trim();
    if (!raw) { window.__ihClearHost(); return; }
    const norm = normalizeBase(raw);
    if (!norm) {
      if (window.showToast) showToast('That does not look like a web address.', 'error');
      return;
    }
    try { localStorage.setItem(HOST_KEY, norm); } catch (e) {}
    hostFormOpen = false;
    showClassQR();
    if (window.showToast) showToast('📶 Codes now point at ' + norm);
  };
  window.__ihClearHost = function () {
    try { localStorage.removeItem(HOST_KEY); } catch (e) {}
    hostFormOpen = false;
    showClassQR();
    if (window.showToast) showToast('Published address removed.');
  };
  window.__ihCopyLink = function () {
    const el = document.getElementById('qr-url');
    if (!el) return;
    const text = el.textContent;
    const done = () => { if (window.showToast) showToast('🔗 Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {});
    } else { done(); }
  };

  window.closeClassQR = function () {
    const m = document.getElementById('qr-modal');
    if (m) m.style.display = 'none';
  };

  // Show or hide the instructor's QR buttons for the current class.
  window.syncClassQRButton = function () {
    const show = !!trackerMode(currentWorkout());
    ['qr-share-btn', 'qr-plan-btn', 'qr-live-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = show ? '' : 'none';
    });
  };

  /* ════════════════════════════════════════════════════════════════════
     ATHLETE SIDE
     ════════════════════════════════════════════════════════════════════ */

  let cls = null, me = null, prog = null, rawPayload = '', tickHandle = null, wakeLock = null;

  function persist() { saveProgress(cls.sid, me.uid, prog); }

  // Put the athlete id in the link so reopening it — from history, a
  // bookmark, or a phone waking back up — lands on the same page.
  function writeUidToUrl(uid) {
    const hash = '#' + HASH_KEY + '=' + rawPayload + '&' + UID_KEY + '=' + encodeURIComponent(uid);
    try { history.replaceState(null, '', location.href.split('#')[0] + hash); }
    catch (e) { try { location.hash = hash.slice(1); } catch (e2) {} }
  }

  function identify(uid) {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    me = { uid, name: displayName(uid) };
    prog = loadProgress(cls.sid, uid);
    writeUidToUrl(uid);
    render();
    requestWake();
  }

  /* The class link is one code for the whole room, so the phone asks who is
     holding it before showing a tracker. A name makes a readable page id; a
     skip makes one that sticks to the device instead. */
  function renderGate(switching) {
    const root = document.getElementById('athlete-root');
    if (!root) return;
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    const suggestion = switching ? '' : lastName();

    root.innerHTML =
      '<div class="ath-gate">' +
        '<div class="ath-gate-kicker">' + esc(cls.title) + '</div>' +
        '<div class="ath-gate-meta">' + esc(cls.meta) + '</div>' +
        '<h1 class="ath-gate-title">' + (switching ? 'Switch athlete' : 'Who\'s training?') + '</h1>' +
        '<p class="ath-gate-sub">Your name gives you your own page for this class. ' +
          'Nothing is shared with anyone — it stays on this phone.</p>' +
        '<input id="ath-name" class="ath-gate-input" type="text" autocomplete="given-name" ' +
          'autocapitalize="words" enterkeyhint="go" placeholder="First name" maxlength="24" ' +
          'value="' + esc(suggestion) + '">' +
        '<button class="ath-big-btn start" id="ath-go">Start tracking →</button>' +
        '<button class="ath-mini ath-gate-skip" id="ath-anon">Skip — just use this phone</button>' +
        (switching && me ? '<button class="ath-mini ath-gate-skip" id="ath-cancel">Cancel</button>' : '') +
      '</div>';

    const input = document.getElementById('ath-name');
    const go = () => {
      const name = (input.value || '').trim();
      const uid = slugName(name) || deviceId();
      if (name) rememberName(uid, name);
      identify(uid);
    };
    document.getElementById('ath-go').addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    document.getElementById('ath-anon').addEventListener('click', () => identify(deviceId()));
    const cancel = document.getElementById('ath-cancel');
    if (cancel) cancel.addEventListener('click', () => render());
    if (!suggestion) setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);
  }

  // Keep the screen on during class where the browser allows it.
  async function requestWake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* unsupported, or denied while hidden */ }
  }

  function renderAmrap() {
    const started = !!prog.startedAt;
    const rounds = prog.rounds || [];
    const last = rounds.length ? rounds[rounds.length - 1].at : prog.startedAt;

    const splits = rounds.map((r, i) => {
      const prev = i === 0 ? prog.startedAt : rounds[i - 1].at;
      return '<li class="ath-round">' +
        '<span class="ath-round-n">' + (i + 1) + '</span>' +
        '<span class="ath-round-at">' + fmtClock(r.at - prog.startedAt) + '</span>' +
        '<span class="ath-round-split">+' + fmtClock(r.at - prev) + '</span>' +
        '<input class="ath-note" type="text" placeholder="note…" maxlength="40" ' +
               'value="' + esc(r.note || '') + '" data-round="' + i + '">' +
      '</li>';
    }).reverse().join('');

    return '' +
      '<div class="ath-card">' +
        '<div class="ath-kicker">🔄 AMRAP · ' + esc(cls.meta) + '</div>' +
        '<div class="ath-count">' + rounds.length + '</div>' +
        '<div class="ath-count-label">rounds complete</div>' +
        (started
          ? '<div class="ath-elapsed">Elapsed <b id="ath-elapsed">' + fmtClock(Date.now() - prog.startedAt) + '</b>' +
            '<span class="ath-since">· this round ' + fmtClock(Date.now() - last) + '</span></div>'
          : '<div class="ath-elapsed muted">Tap start when your class begins.</div>') +
      '</div>' +
      (started
        ? '<button class="ath-big-btn" id="ath-round-btn">✓ Finished a round</button>'
        : '<button class="ath-big-btn start" id="ath-start-btn">▶ Start my clock</button>') +
      (rounds.length
        ? '<div class="ath-actions"><button class="ath-mini" id="ath-undo">↩ Undo last round</button></div>' +
          '<div class="ath-section">Your splits</div><ul class="ath-rounds">' + splits + '</ul>'
        : '') +
      '<div class="ath-section">One round</div>' +
      '<ul class="ath-list">' + cls.items.map(i =>
        '<li><span class="ath-ex">' + esc(i.name) + '</span>' +
        '<span class="ath-reps">' + esc(i.reps) + ' ' + esc(i.unit) + '</span></li>').join('') +
      '</ul>';
  }

  function renderHundred() {
    const done = prog.done || {};
    const totalReps = cls.items.reduce((s, i) => s + (parseInt(i.reps, 10) || 0), 0);
    const doneReps = cls.items.reduce((s, i, idx) => s + (done[idx] ? (parseInt(i.reps, 10) || 0) : 0), 0);
    const pct = totalReps ? Math.round((doneReps / totalReps) * 100) : 0;
    const doneCount = cls.items.filter((_, idx) => done[idx]).length;

    return '' +
      '<div class="ath-card">' +
        '<div class="ath-kicker">💯 ' + esc(cls.meta) + '</div>' +
        '<div class="ath-count">' + doneReps + '</div>' +
        '<div class="ath-count-label">of ' + totalReps + ' reps done</div>' +
        '<div class="ath-bar"><div class="ath-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="ath-elapsed">' + doneCount + ' of ' + cls.items.length + ' exercises complete</div>' +
      '</div>' +
      '<div class="ath-section">Tap each one as you finish it</div>' +
      '<ul class="ath-check">' + cls.items.map((i, idx) =>
        '<li class="ath-check-row' + (done[idx] ? ' is-done' : '') + '" data-key="' + idx + '">' +
          '<span class="ath-box">' + (done[idx] ? '✓' : '') + '</span>' +
          '<span class="ath-ex"><b>' + (idx + 1) + '.</b> ' + esc(i.name) + '</span>' +
          '<span class="ath-reps">' + esc(i.reps) + ' ' + esc(i.unit) + '</span>' +
        '</li>').join('') +
      '</ul>' +
      (doneCount === cls.items.length && cls.items.length
        ? '<div class="ath-done-banner">🎉 All ' + totalReps + ' reps done. Great work!</div>' : '');
  }

  // ── Custom classes ───────────────────────────────────────────────────
  // The instructor builds the rounds, so the athlete's job is simply to keep
  // their place. One checklist per round, and the round advances itself once
  // every move in it is ticked.
  function renderCustom() {
    const rounds = Math.max(1, cls.rounds || 1);
    const done = prog.done || {};
    const per = cls.items.length;
    const key = (r, i) => 'r' + r + '_' + i;
    const roundDone = r => per > 0 && cls.items.every((_, i) => done[key(r, i)]);

    let cur = Math.min(rounds - 1, Math.max(0, prog.round || 0));
    const total = rounds * per;
    const ticked = cls.items.reduce((s, _, i) => {
      for (let r = 0; r < rounds; r++) if (done[key(r, i)]) s++;
      return s;
    }, 0);
    const pct = total ? Math.round((ticked / total) * 100) : 0;

    const strip = rounds > 1
      ? '<div class="ath-round-strip">' + Array.from({ length: rounds }, (_, r) =>
          '<button class="ath-round-pill' + (r === cur ? ' is-current' : '') +
            (roundDone(r) ? ' is-done' : '') + '" data-round="' + r + '">' +
            (roundDone(r) ? '✓ ' : '') + (r + 1) + '</button>').join('') +
        '</div>'
      : '';

    return '' +
      '<div class="ath-card">' +
        '<div class="ath-kicker">🛠️ ' + esc(cls.meta) + '</div>' +
        '<div class="ath-count">' + ticked + '</div>' +
        '<div class="ath-count-label">of ' + total + ' sets done</div>' +
        '<div class="ath-bar"><div class="ath-bar-fill" style="width:' + pct + '%"></div></div>' +
        (rounds > 1
          ? '<div class="ath-elapsed">Round <b>' + (cur + 1) + '</b> of ' + rounds + '</div>'
          : '<div class="ath-elapsed">' + per + ' moves</div>') +
      '</div>' +
      strip +
      '<div class="ath-section">' +
        (rounds > 1 ? 'Round ' + (cur + 1) : 'Tap each one as you finish it') +
      '</div>' +
      '<ul class="ath-check">' + cls.items.map((i, idx) => {
        const k = key(cur, idx);
        return '<li class="ath-check-row' + (done[k] ? ' is-done' : '') + '" data-key="' + k + '">' +
          '<span class="ath-box">' + (done[k] ? '✓' : '') + '</span>' +
          '<span class="ath-ex"><b>' + (idx + 1) + '.</b> ' + esc(i.name) + '</span>' +
          '<span class="ath-reps">' + esc(i.reps) + ' ' + esc(i.unit) + '</span>' +
        '</li>';
      }).join('') +
      '</ul>' +
      (ticked === total && total
        ? '<div class="ath-done-banner">🎉 Every round done. Great work!</div>' : '');
  }

  // ── Core Burner ──────────────────────────────────────────────────────
  // Always time-based, so there is nothing to count — the list exists so an
  // athlete can see what is coming and tick it off.
  function renderBurner() {
    const b = cls.burner;
    if (!b || !b.items.length) return '';
    const done = prog.done || {};
    const rounds = Math.max(1, b.rounds || 1);
    const key = (r, i) => 'b' + r + '_' + i;
    const total = rounds * b.items.length;
    const ticked = b.items.reduce((s, _, i) => {
      for (let r = 0; r < rounds; r++) if (done[key(r, i)]) s++;
      return s;
    }, 0);

    const block = r =>
      (rounds > 1 ? '<div class="ath-burner-round">Round ' + (r + 1) + '</div>' : '') +
      '<ul class="ath-check">' + b.items.map((i, idx) => {
        const k = key(r, idx);
        return '<li class="ath-check-row' + (done[k] ? ' is-done' : '') + '" data-key="' + k + '">' +
          '<span class="ath-box">' + (done[k] ? '✓' : '') + '</span>' +
          '<span class="ath-ex">' + esc(i.name) + '</span>' +
          '<span class="ath-reps">' + esc(i.reps) + '</span>' +
        '</li>';
      }).join('') + '</ul>';

    return '<div class="ath-burner">' +
      '<div class="ath-section ath-section-burner">🎯 Core Burner' +
        '<span class="ath-burner-meta">' + b.work + 's on / ' + b.rest + 's off' +
          (rounds > 1 ? ' · ' + rounds + ' rounds' : '') + '</span>' +
      '</div>' +
      Array.from({ length: rounds }, (_, r) => block(r)).join('') +
      (ticked === total ? '<div class="ath-done-banner">🔥 Core Burner complete!</div>' : '') +
    '</div>';
  }

  // A class whose style has no tracker of its own, but that carries a burner.
  function renderBurnerOnly() {
    return '' +
      '<div class="ath-card">' +
        '<div class="ath-kicker">🎯 Core Burner finisher</div>' +
        '<div class="ath-count-label">Your instructor runs the main block on the clock.</div>' +
      '</div>' +
      (cls.items.length
        ? '<div class="ath-section">Today\'s main workout</div>' +
          '<ul class="ath-list">' + cls.items.map(i =>
            '<li><span class="ath-ex">' + esc(i.name) + '</span>' +
            '<span class="ath-reps">' + esc(i.reps) + ' ' + esc(i.unit) + '</span></li>').join('') +
          '</ul>'
        : '');
  }

  const MAIN_RENDER = { a: renderAmrap, h: renderHundred, c: renderCustom, b: renderBurnerOnly };

  function render() {
    const root = document.getElementById('athlete-root');
    if (!root || !me) return;
    const main = MAIN_RENDER[cls.mode] || renderHundred;
    root.innerHTML =
      '<div class="ath-header">' +
        '<button class="ath-id" id="ath-id" title="Not you? Switch athlete">' +
          '<span class="ath-avatar">' + esc(initials(me.name)) + '</span>' +
          '<span class="ath-id-text">' +
            '<b>' + esc(me.name) + '</b>' +
            '<span class="ath-title">' + esc(cls.title) + '</span>' +
          '</span>' +
          '<span class="ath-id-swap">⇄</span>' +
        '</button>' +
        '<button class="ath-reset" id="ath-reset" title="Clear my progress">Reset</button>' +
      '</div>' +
      main() +
      renderBurner() +
      '<div class="ath-foot">Private to ' + esc(me.name) + ' on this phone · saved automatically</div>';
    bind();
    scheduleTick();
  }

  function bind() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

    on('ath-start-btn', () => { prog.startedAt = Date.now(); prog.rounds = []; persist(); requestWake(); render(); });
    on('ath-round-btn', () => {
      prog.rounds = prog.rounds || [];
      prog.rounds.push({ at: Date.now(), note: '' });
      persist(); render();
      if (navigator.vibrate) navigator.vibrate(35);
    });
    on('ath-undo', () => {
      if (prog.rounds && prog.rounds.length) { prog.rounds.pop(); persist(); render(); }
    });
    on('ath-id', () => renderGate(true));
    on('ath-reset', () => {
      if (confirm('Clear ' + me.name + '\u2019s progress for this class? ' +
                  'This only affects this phone.')) {
        prog = {}; persist(); render();
      }
    });

    document.querySelectorAll('.ath-round-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        prog.round = parseInt(pill.dataset.round, 10) || 0;
        persist(); render();
      });
    });

    document.querySelectorAll('.ath-check-row').forEach(row => {
      row.addEventListener('click', () => {
        const k = row.dataset.key;
        prog.done = prog.done || {};
        prog.done[k] = !prog.done[k];
        if (prog.done[k]) advanceRound(k);
        persist(); render();
        if (navigator.vibrate) navigator.vibrate(25);
      });
    });

    // Notes save as they are typed, without re-rendering and stealing focus.
    document.querySelectorAll('.ath-note').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.dataset.round, 10);
        if (prog.rounds && prog.rounds[i]) { prog.rounds[i].note = inp.value; persist(); }
      });
      inp.addEventListener('click', e => e.stopPropagation());
    });
  }

  // Finishing the last move of a custom round moves the athlete on, so they
  // are not left tapping a completed list. Ticking a burner move never does.
  function advanceRound(k) {
    if (cls.mode !== 'c') return;
    const m = /^r(\d+)_\d+$/.exec(String(k));
    if (!m) return;
    const r = parseInt(m[1], 10);
    const rounds = Math.max(1, cls.rounds || 1);
    if (r !== (prog.round || 0) || r + 1 >= rounds) return;
    const complete = cls.items.every((_, i) => prog.done['r' + r + '_' + i]);
    if (complete) prog.round = r + 1;
  }

  // Only the elapsed line ticks, so typing in a note is never interrupted.
  function scheduleTick() {
    if (tickHandle) clearInterval(tickHandle);
    if (cls.mode !== 'a' || !prog.startedAt) return;
    tickHandle = setInterval(() => {
      const el = document.getElementById('ath-elapsed');
      if (!el) return;
      el.textContent = fmtClock(Date.now() - prog.startedAt);
      const since = el.parentNode.querySelector('.ath-since');
      if (since) {
        const rounds = prog.rounds || [];
        const last = rounds.length ? rounds[rounds.length - 1].at : prog.startedAt;
        since.textContent = '· this round ' + fmtClock(Date.now() - last);
      }
    }, 1000);
  }

  function boot() {
    const m = /[#&]c=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
    if (!m) return false;
    rawPayload = m[1];
    try { cls = decodePayload(rawPayload); }
    catch (e) {
      document.body.innerHTML = '<div class="ath-fatal">That class link looks damaged. ' +
        'Ask your instructor to show the code again.</div>';
      return true;
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById('athlete-screen');
    if (screen) screen.classList.add('active');
    document.body.classList.add('athlete-mode');

    // A link that already names its athlete goes straight to their page.
    const u = /[#&]u=([^&#]+)/.exec(location.hash || '');
    let uid = '';
    if (u) { try { uid = slugName(decodeURIComponent(u[1])) || decodeURIComponent(u[1]); } catch (e) { uid = u[1]; } }
    if (uid) identify(uid); else renderGate(false);

    // Elapsed time is always recomputed from timestamps, so sleeping the
    // phone or backgrounding the tab cannot drift the clock.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && me) { render(); requestWake(); }
    });
    return true;
  }

  window.__ATHLETE_MODE = /[#&]c=/.test(location.hash || '');
  document.addEventListener('DOMContentLoaded', boot);

  // Opening a class link in a tab that already has the app loaded only
  // changes the fragment, so DOMContentLoaded never fires again and the
  // instructor screens stay up. Reload so the athlete page boots properly.
  window.addEventListener('hashchange', () => {
    const wants = /[#&]c=/.test(location.hash || '');
    if (wants && !document.body.classList.contains('athlete-mode')) location.reload();
  });
})();
