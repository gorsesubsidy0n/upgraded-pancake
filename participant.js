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
  //   a = AMRAP · h = 100 Reps · p = Pyramid · l = Ladder
  //   c = Custom on the clock · s = Custom self-paced · b = burner only
  //   t = any other style, mirroring the instructor's clock
  const TRACKABLE = { amrap: 'a', hundred: 'h', pyramid: 'p', ladder: 'l' };
  const BURNER_ONLY = 'b';
  const CLOCK_MODE = 't';
  const HASH_KEY = 'c';
  const UID_KEY = 'u';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const hasBurner = w => !!(w && w.coreBurner && (w.coreBurner.exercises || []).length);
  const trackerMode = w => {
    if (!w) return null;
    if (w.style === 'custom') return (w.custom && w.custom.pace === 'self') ? 's' : 'c';
    return TRACKABLE[w.style] || (w.style ? CLOCK_MODE : null);
  };

  // Modes where the athlete counts their own reps against a target, rather
  // than ticking a checklist the instructor's clock drives.
  const SELF_PACED_MODES = { a: 1, h: 1, p: 1, l: 1, s: 1 };
  // Fallback rungs for links made before the ladder was carried in the payload.
  const RUNG_FALLBACK = { p: [5, 10, 15, 20, 15, 10, 5], l: [5, 10, 15, 20] };

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

  // ── Class plan codec ─────────────────────────────────────────────────
  // For clock-driven styles the phone has to reproduce the instructor's
  // timer exactly, so the whole step list travels in the link. A raw list
  // is far too big for a QR (a 45-minute Tabata is ~170 steps), and plain
  // run-length encoding buys nothing because work and rest alternate. What
  // does compress is that only a couple of dozen *distinct* steps exist, so
  // the plan is stored as a dictionary of unique steps plus one base36
  // index per step:
  //   token   → dur36(2) phaseCode(1) nameRef36(1 or "-")   e.g. "0k2 5", "053-"
  //   plan    → width ! tokens ! indices ! name~name~…
  // Tokens and indices are both fixed width so neither needs separators,
  // which is where most of the saving comes from. Separators avoid | ^ so
  // the plan can sit inside the existing payload untouched.
  const PHASE_CODES = ['get-ready', 'warmup', 'work', 'rest', 'cooldown'];
  const pad = (n, w) => { let s = n.toString(36); while (s.length < w) s = '0' + s; return s; };

  function packPlan(seq) {
    if (!seq || !seq.length) return '';
    const nameIdx = new Map(), tokenIdx = new Map(), order = [];
    seq.forEach(s => {
      const dur = Math.min(1295, Math.max(0, Math.round(s.duration || 0)));
      let code = PHASE_CODES.indexOf(s.phase);
      if (code < 0) code = 2;
      const nm = clean(s.name);
      let ref = '-';
      if (nm) {
        if (!nameIdx.has(nm)) nameIdx.set(nm, nameIdx.size);
        ref = pad(nameIdx.get(nm), 1);
      }
      const tok = pad(dur, 2) + code + ref;
      if (!tokenIdx.has(tok)) tokenIdx.set(tok, tokenIdx.size);
      order.push(tokenIdx.get(tok));
    });
    // A name index past base36 would not fit the single-char slot.
    if (nameIdx.size > 36) return '';
    const w = tokenIdx.size > 36 ? 2 : 1;
    return [w, [...tokenIdx.keys()].join(''),
            order.map(i => pad(i, w)).join(''),
            [...nameIdx.keys()].join('~')].join('!');
  }

  function unpackPlan(raw) {
    if (!raw) return [];
    // Split on the first three separators only — the trailing name list is
    // free-form and legitimately contains "!" (e.g. "Get Ready!").
    const s = String(raw);
    const i1 = s.indexOf('!');
    const i2 = s.indexOf('!', i1 + 1);
    const i3 = s.indexOf('!', i2 + 1);
    if (i1 < 0 || i2 < 0 || i3 < 0) return [];
    const w = parseInt(s.slice(0, i1), 10) || 1;
    const dictRaw = s.slice(i1 + 1, i2);
    const idx = s.slice(i2 + 1, i3);
    const names = s.slice(i3 + 1).split('~');
    const dict = [];
    for (let i = 0; i + 4 <= dictRaw.length; i += 4) dict.push(dictRaw.substr(i, 4));
    const out = [];
    for (let i = 0; i + w <= idx.length; i += w) {
      const tok = dict[parseInt(idx.substr(i, w), 36)];
      if (!tok) continue;
      const ref = tok.charAt(3);
      out.push({
        duration: parseInt(tok.substr(0, 2), 36) || 0,
        phase: PHASE_CODES[parseInt(tok.charAt(2), 10)] || 'work',
        name: ref === '-' ? '' : (names[parseInt(ref, 36)] || ''),
      });
    }
    let t = 0;
    out.forEach(st => { st.start = t; t += st.duration; });
    return out;
  }

  // v2 adds main-block rounds and a Core Burner block. v3 adds the time cap
  // for the whole main block. v4 adds the run-length encoded class plan and
  // the wall-clock time step 0 began, which is what lets a phone mirror the
  // room's clock. Older links are still read, so a code scanned before an
  // update keeps working for that class.
  function encodePayload(p) {
    const b = p.burner || {};
    return b64urlEncode([
      '4', p.mode, p.sid, clean(p.title), clean(p.meta),
      String(p.rounds || 1), packItems(p.items),
      String(b.rounds || 0), String(b.work || 0), String(b.rest || 0), packItems(b.items),
      String(p.cap || 0), (p.rungs || []).join(','),
      p.plan || '', String(p.t0 || 0),
    ].join('|'));
  }

  function decodePayload(raw) {
    const parts = b64urlDecode(raw).split('|');
    if (parts[0] === '1') {
      return { mode: parts[1], sid: parts[2], title: parts[3], meta: parts[4],
               rounds: 1, items: unpackItems(parts[5]), burner: null, cap: 0, rungs: null,
               plan: [], t0: 0 };
    }
    if (['2', '3', '4'].indexOf(parts[0]) < 0) throw new Error('unsupported payload version');
    const bRounds = parseInt(parts[7], 10) || 0;
    const bItems = unpackItems(parts[10]);
    const mode = parts[1];
    const rungs = (parts[12] || '').split(',').map(n => parseInt(n, 10)).filter(n => n > 0);
    return {
      mode, sid: parts[2], title: parts[3], meta: parts[4],
      rounds: parseInt(parts[5], 10) || 1,
      items: unpackItems(parts[6]),
      cap: parseInt(parts[11], 10) || 0,
      rungs: rungs.length ? rungs : (RUNG_FALLBACK[mode] || null),
      plan: unpackPlan(parts[13] || ''),
      t0: parseInt(parts[14], 10) || 0,
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

  // Same shape, but from whole seconds. Short rest steps read better as a
  // bare count than as "0:10".
  function mmss(secs) {
    const t = Math.max(0, Math.round(secs || 0));
    return t < 60 ? String(t) : Math.floor(t / 60) + ':' + two(t % 60);
  }

  /* ════════════════════════════════════════════════════════════════════
     INSTRUCTOR SIDE — build the link and show the QR code
     ════════════════════════════════════════════════════════════════════ */

  const MODE_COPY = {
    a: { title: '🔄 Scan to track your rounds', hint: 'Log every round, add partial reps, and watch the block clock.' },
    h: { title: '💯 Scan for your rep counter', hint: 'Count reps as you knock them out — the clock runs on your phone.' },
    p: { title: '🔺 Scan to track your climb', hint: 'Mark the rung you are on and count reps as you go.' },
    l: { title: '📈 Scan to track your climb', hint: 'Mark the rung you are on and count reps as you go.' },
    s: { title: '🛠️ Scan to track your reps', hint: 'Work at your own pace and log reps as you finish them.' },
    c: { title: '🛠️ Scan for your class checklist', hint: 'Keep your place round by round, at your own pace.' },
    b: { title: '🎯 Scan for the Core Burner', hint: 'See the finisher and tick each move as you go.' },
    t: { title: '📲 Scan to follow along', hint: 'Your phone shows the same clock as the room.' },
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

    const rounds = ((w.style === 'custom') && w.custom && w.custom.rounds) ? w.custom.rounds : 1;

    // Self-paced styles run on one clock for the whole main block, so the
    // athlete's phone needs the cap and (for climbs) the rung ladder.
    const paceCfg = (typeof SELF_PACED !== 'undefined' && SELF_PACED[w.style]) || null;
    const selfPaced = !!SELF_PACED_MODES[mode];
    const cap = selfPaced ? Math.max(300, Math.round((w.mainDur || 30) * 60)) : 0;
    const rungs = (Array.isArray(w.rungs) && w.rungs.length) ? w.rungs.slice()
      : (paceCfg && paceCfg.rungs ? paceCfg.rungs.slice() : (RUNG_FALLBACK[mode] || null));

    let meta;
    if (mode === 'h') {
      meta = items.reduce((sum, i) => sum + (parseInt(i.reps, 10) || 0), 0) +
        ' total reps · ' + fmtMins(cap);
    } else if (mode === 'a') {
      meta = fmtMins(cap) + ' cap';
    } else if (mode === 'p' || mode === 'l') {
      meta = (rungs ? rungs.length + ' rungs · ' : '') + fmtMins(cap);
    } else if (mode === 's') {
      meta = rounds + (rounds === 1 ? ' round · ' : ' rounds · ') + fmtMins(cap);
    } else if (mode === 'c') {
      meta = rounds + (rounds === 1 ? ' round · ' : ' rounds · ') + items.length + ' moves';
    } else if (mode === 't') {
      meta = items.length + ' moves · follows the room clock';
    } else {
      meta = burner.items.length + ' core moves · ' + fmtMins(
        burner.rounds * burner.items.length * (burner.work + burner.rest));
    }

    // Clock-driven styles mirror the room, so the phone gets the step list
    // and the wall-clock moment step 0 began. The plan already names every
    // move in order, so the separate item list is dropped to keep the QR
    // small — renderClockFollow rebuilds the list from the plan.
    const clockDriven = !selfPaced && mode !== 'b';
    const plan = clockDriven ? packPlan(currentSequence()) : '';

    return {
      mode, meta, rounds, burner, cap, rungs, plan,
      items: (clockDriven && plan) ? [] : items,
      t0: clockDriven ? classStartEpoch() : 0,
      sid: (w.athleteSid || (w.athleteSid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6))),
      title: (w.styleCfg && w.styleCfg.name ? w.styleCfg.name : w.style) + ' · ' + (w.muscle || 'full') + ' focus',
    };
  }

  // The live sequence when class is running, otherwise the plan as it would
  // be built — so a code scanned before Go Live still shows the right class.
  function currentSequence() {
    try {
      const live = state.timer && state.timer.sequence;
      if (live && live.length) return live;
      return buildTimerSequence();
    } catch (e) { return []; }
  }

  // Wall-clock time step 0 started, derived by rewinding through the steps
  // already completed. Deriving rather than storing absorbs any pauses that
  // happened before the code was shown. 0 means "not live yet".
  function classStartEpoch() {
    try {
      const t = state.timer;
      if (!t || !t.sequence || !t.sequence.length) return 0;
      const i = Math.max(0, Math.min(t.current || 0, t.sequence.length - 1));
      let elapsed = 0;
      for (let k = 0; k < i; k++) elapsed += Math.round(t.sequence[k].duration || 0);
      elapsed += Math.round(t.sequence[i].duration || 0) - Math.max(0, Math.round(t.seconds || 0));
      return Date.now() - elapsed * 1000;
    } catch (e) { return 0; }
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
  // Only loopback needs this, so a published site never makes the request.
  let phoneOrigin = null;              // null = not asked yet, '' = none available
  function loadPhoneOrigin(done) {
    if (phoneOrigin !== null) { done(phoneOrigin); return; }
    if (location.protocol === 'file:' || typeof fetch !== 'function' ||
        !isLoopback(location.hostname)) { phoneOrigin = ''; done(''); return; }
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

  // Keep roughly 3.4px per module so the code stays comfortably scannable as
  // the payload grows, clamped to what a laptop screen can actually show.
  function qrPixelSize(url) {
    const bytes = url.length;
    const modules = bytes > 1500 ? 149 : bytes > 1100 ? 133 : bytes > 700 ? 109 : bytes > 400 ? 85 : 65;
    return Math.max(360, Math.min(520, Math.round((modules + 8) * 3.4 / 10) * 10));
  }

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
        // A class plan makes the payload much larger, which pushes the code
        // to a higher version with far more (and therefore smaller) modules.
        // Phone cameras need roughly 3-4px per module, so the code is grown
        // to suit rather than left at a fixed size — it is shown on the
        // instructor's laptop or TV, where there is room for it.
        svg = QR.svg(url, { size: qrPixelSize(url), level: 'L', margin: 4 });
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

  // 100 Reps used to be a checklist. Anyone who scanned before the update and
  // is mid-class keeps their progress: each ticked box becomes a full count.
  function migrateProgress(p) {
    p = p || {};
    if (cls.mode !== 'h' || p.reps || !p.done) return p;
    p.reps = {};
    cls.items.forEach((it, i) => {
      if (p.done[i]) p.reps[i] = parseInt(it.reps, 10) || 0;
    });
    return p;
  }

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
    prog = migrateProgress(loadProgress(cls.sid, uid));
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

  /* ── Self-paced tracking ──────────────────────────────────────────────
     AMRAP, 100 Reps, Pyramid, Ladder and self-paced Custom all run as one
     clock covering the whole main block. The athlete owns their pace, so
     everything they log is a rep counter keyed by exercise — plus the round
     or rung when the style repeats the list. */

  const repCount = k => { const v = parseInt((prog.reps || {})[k], 10); return v > 0 ? v : 0; };
  const setRep = (k, v) => {
    prog.reps = prog.reps || {};
    prog.reps[k] = Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  };
  const sumReps = (keys, targets) =>
    keys.reduce((s, k, i) => s + Math.min(repCount(k), targets[i] || 0), 0);

  // null when the class has no cap (older links) — the card then counts up.
  function remainingMs() {
    if (!prog.startedAt || !cls.cap) return null;
    return Math.max(0, prog.startedAt + cls.cap * 1000 - Date.now());
  }

  function clockLine() {
    if (!prog.startedAt) return '<div class="ath-elapsed muted">Tap start when your class begins.</div>';
    const rem = remainingMs();
    if (rem === null) {
      return '<div class="ath-elapsed">Elapsed <b id="ath-elapsed">' +
        fmtClock(Date.now() - prog.startedAt) + '</b></div>';
    }
    return '<div class="ath-countdown' + (rem === 0 ? ' is-up' : '') + '">' +
      '<b id="ath-countdown">' + (rem === 0 ? "TIME" : fmtClock(rem)) + '</b>' +
      '<span class="ath-since" id="ath-countdown-label">' +
        (rem === 0 ? 'cap reached' : 'left in the block') + '</span></div>';
  }

  const startBtn = () => prog.startedAt ? ''
    : '<button class="ath-big-btn start" id="ath-start-btn">▶ Start my clock</button>';

  function progressBar(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="ath-bar"><div class="ath-bar-fill" style="width:' + pct + '%"></div></div>';
  }

  // One editable counter. The number is typeable so an athlete who loses
  // count can just correct it, and ✓ fills the target in a single tap.
  function repRow(key, n, name, target, unit) {
    const count = repCount(key);
    const done = target > 0 && count >= target;
    const suffix = unit && unit !== 'reps' ? ' ' + esc(unit) : '';
    return '<li class="ath-rep-row' + (done ? ' is-done' : '') + '">' +
      '<span class="ath-rep-name"><b>' + n + '.</b> ' + esc(name) + '</span>' +
      '<span class="ath-rep-ctl">' +
        '<button class="ath-step" data-rep-dec="' + key + '" aria-label="One less">−</button>' +
        '<input class="ath-rep-input" type="number" inputmode="numeric" pattern="[0-9]*" ' +
               'min="0" max="999" value="' + count + '" data-rep-set="' + key + '" ' +
               'aria-label="Reps for ' + esc(name) + '">' +
        (target > 0 ? '<span class="ath-rep-target">/ ' + target + suffix + '</span>' : '') +
        '<button class="ath-step" data-rep-inc="' + key + '" aria-label="One more">+</button>' +
        '<button class="ath-rep-fill" data-rep-fill="' + key + '" data-target="' + target + '" ' +
                'aria-label="' + (done ? 'Clear' : 'Mark all done') + '">' + (done ? '↺' : '✓') + '</button>' +
      '</span>' +
    '</li>';
  }

  const repList = rows => '<ul class="ath-reps-list">' + rows.join('') + '</ul>';
  const targetOf = it => parseInt(it.reps, 10) || 0;

  // ── AMRAP · rounds of the same list, as many as the cap allows ────────
  function renderAmrap() {
    const rounds = prog.rounds || [];
    const n = rounds.length;
    const perRound = cls.items.reduce((s, i) => s + targetOf(i), 0);
    const curKeys = cls.items.map((_, i) => 'r' + n + '_' + i);
    const partial = sumReps(curKeys, cls.items.map(targetOf));

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
        '<div class="ath-count-row">' +
          '<button class="ath-step big" id="ath-rounds-dec" aria-label="One less round">−</button>' +
          '<input class="ath-count-input" type="number" inputmode="numeric" min="0" max="99" ' +
                 'value="' + n + '" id="ath-rounds-set" aria-label="Rounds complete">' +
          '<button class="ath-step big" id="ath-rounds-inc" aria-label="One more round">+</button>' +
        '</div>' +
        '<div class="ath-count-label">rounds complete' +
          (perRound ? ' · ' + (n * perRound + partial) + ' reps total' : '') + '</div>' +
        clockLine() +
      '</div>' +
      startBtn() +
      (prog.startedAt ? '<button class="ath-big-btn" id="ath-round-btn">✓ Finished a round</button>' : '') +
      '<div class="ath-section">Round ' + (n + 1) + ' — reps so far</div>' +
      (perRound ? progressBar(partial, perRound) : '') +
      repList(cls.items.map((it, i) =>
        repRow(curKeys[i], i + 1, it.name, targetOf(it), it.unit))) +
      (n ? '<div class="ath-section">Your splits</div><ul class="ath-rounds">' + splits + '</ul>' : '');
  }

  // ── 100 Reps · one pass down the ladder ──────────────────────────────
  function renderHundred() {
    const targets = cls.items.map(targetOf);
    const keys = cls.items.map((_, i) => String(i));
    const total = targets.reduce((s, t) => s + t, 0);
    const done = sumReps(keys, targets);
    const complete = keys.filter((k, i) => targets[i] > 0 && repCount(k) >= targets[i]).length;

    return '' +
      '<div class="ath-card">' +
        '<div class="ath-kicker">💯 ' + esc(cls.meta) + '</div>' +
        '<div class="ath-count">' + done + '</div>' +
        '<div class="ath-count-label">of ' + total + ' reps done</div>' +
        progressBar(done, total) +
        clockLine() +
      '</div>' +
      startBtn() +
      '<div class="ath-section">Your reps — tap ± or type as you go</div>' +
      repList(cls.items.map((it, i) => repRow(keys[i], i + 1, it.name, targets[i], it.unit))) +
      (complete === cls.items.length && cls.items.length
        ? '<div class="ath-done-banner">🎉 All ' + total + ' reps done. Great work!</div>' : '');
  }

  // ── Pyramid / Ladder · a climb, one rung at a time ───────────────────
  function renderRungs() {
    const rungs = (cls.rungs && cls.rungs.length) ? cls.rungs : (RUNG_FALLBACK[cls.mode] || [5, 10, 15, 20]);
    const per = cls.items.length;
    const cur = Math.min(Math.max(0, prog.rung || 0), rungs.length - 1);
    const rungDone = g => cls.items.reduce((s, _, i) => s + Math.min(repCount('g' + g + '_' + i), rungs[g]), 0);
    const total = rungs.reduce((s, r) => s + r * per, 0);
    const done = rungs.reduce((s, _, g) => s + rungDone(g), 0);

    const pills = rungs.map((r, g) => {
      const full = per > 0 && rungDone(g) >= r * per;
      return '<button class="ath-rung-pill' + (g === cur ? ' is-current' : '') +
        (full ? ' is-done' : '') + '" data-rung="' + g + '">' + r + '</button>';
    }).join('<span class="ath-rung-sep">→</span>');

    return '' +
      '<div class="ath-card">' +
        '<div class="ath-kicker">' + (cls.mode === 'p' ? '🔺 Pyramid' : '📈 Ladder') + ' · ' + esc(cls.meta) + '</div>' +
        '<div class="ath-count">' + done + '</div>' +
        '<div class="ath-count-label">of ' + total + ' reps climbed</div>' +
        progressBar(done, total) +
        clockLine() +
      '</div>' +
      startBtn() +
      '<div class="ath-section">Where you\u2019ve climbed to — tap a rung</div>' +
      '<div class="ath-rungs">' + pills + '</div>' +
      '<div class="ath-section">Rung ' + (cur + 1) + ' of ' + rungs.length + ' · ' + rungs[cur] + ' reps each</div>' +
      repList(cls.items.map((it, i) =>
        repRow('g' + cur + '_' + i, i + 1, it.name, rungs[cur], 'reps'))) +
      (total && done >= total ? '<div class="ath-done-banner">🎉 Full climb complete!</div>' : '');
  }

  // ── Custom, self-paced · instructor's rounds, athlete's clock ─────────
  function renderSelfCustom() {
    const rounds = Math.max(1, cls.rounds || 1);
    const targets = cls.items.map(targetOf);
    const cur = Math.min(Math.max(0, prog.round || 0), rounds - 1);
    const keysFor = r => cls.items.map((_, i) => 'r' + r + '_' + i);
    const roundDone = r => sumReps(keysFor(r), targets);
    const perRound = targets.reduce((s, t) => s + t, 0);
    const total = perRound * rounds;
    const done = Array.from({ length: rounds }, (_, r) => roundDone(r)).reduce((s, x) => s + x, 0);

    const pills = rounds > 1 ? Array.from({ length: rounds }, (_, r) => {
      const full = perRound > 0 && roundDone(r) >= perRound;
      return '<button class="ath-rung-pill' + (r === cur ? ' is-current' : '') +
        (full ? ' is-done' : '') + '" data-round-pick="' + r + '">' + (r + 1) + '</button>';
    }).join('<span class="ath-rung-sep">→</span>') : '';

    return '' +
      '<div class="ath-card">' +
        '<div class="ath-kicker">🛠️ ' + esc(cls.title) + ' · ' + esc(cls.meta) + '</div>' +
        '<div class="ath-count">' + done + '</div>' +
        '<div class="ath-count-label">of ' + total + ' logged</div>' +
        progressBar(done, total) +
        clockLine() +
      '</div>' +
      startBtn() +
      (pills ? '<div class="ath-section">Which round you\u2019re on</div>' +
               '<div class="ath-rungs">' + pills + '</div>' : '') +
      '<div class="ath-section">Round ' + (cur + 1) + ' of ' + rounds + '</div>' +
      repList(cls.items.map((it, i) =>
        repRow('r' + cur + '_' + i, i + 1, it.name, targets[i], it.unit))) +
      (total && done >= total ? '<div class="ath-done-banner">🎉 Whole class logged. Great work!</div>' : '');
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

  /* ── Mirroring the room's clock ────────────────────────────────────────
     There is no server, so the phone cannot be pushed the instructor's
     clock. Instead the link carries the full step list plus the wall time
     step 0 began, and each phone derives the same position independently.
     Clocks stay together because they are both reading the same schedule
     from the same start point. If the instructor pauses or skips, the
     athlete taps "Re-sync" and picks the move the room is actually on. */

  const PHASE_LABEL = { 'get-ready': 'Get ready', warmup: 'Warm-up', work: 'Work',
                        rest: 'Rest', cooldown: 'Cool-down' };

  // Pure UI state: the panel should never be open on a fresh load.
  let resyncOpen = false;

  const planTotal = () => (cls.plan || []).reduce((s, st) => s + st.duration, 0);

  // Seconds into the class right now, including any manual re-sync nudge.
  function planElapsed() {
    const base = prog.classStart || cls.t0 || 0;
    if (!base) return -1;
    return Math.floor((Date.now() - base) / 1000) - (prog.syncOffset || 0);
  }

  function planPosition() {
    const plan = cls.plan || [];
    const e = planElapsed();
    if (e < 0) return null;
    const total = planTotal();
    if (e >= total) return { done: true, idx: plan.length - 1, left: 0, elapsed: e, total };
    let idx = 0;
    for (let i = 0; i < plan.length; i++) {
      if (e < plan[i].start + plan[i].duration) { idx = i; break; }
    }
    const st = plan[idx];
    return { done: false, idx, step: st, left: st.start + st.duration - e, elapsed: e, total };
  }

  // The next *different* move. Tabata repeats one exercise for eight rounds,
  // so "next" must skip past the repeats or it just echoes the current move.
  function nextWorkStep(from) {
    const plan = cls.plan || [];
    const cur = plan[from] ? plan[from].name : '';
    for (let i = from + 1; i < plan.length; i++) {
      if (plan[i].name && plan[i].phase !== 'rest' && plan[i].name !== cur) return plan[i];
    }
    return null;
  }

  // One place that decides what the clock card says, so the initial render
  // and the per-second tick can never disagree.
  function clockFace(pos) {
    const st = pos.step;
    const nx = nextWorkStep(pos.idx);
    // Rest steps carry no name of their own; what an athlete wants to see
    // while resting is the move they are about to do.
    const now = st.name || (nx ? nx.name : '—');
    const after = st.name ? nx : nextWorkStep(pos.idx + lookaheadFrom(pos.idx));
    return {
      phase: PHASE_LABEL[st.phase] || 'Work',
      time: mmss(pos.left),
      now,
      next: st.name
        ? (nx ? 'Next: ' + nx.name : 'Last one — finish strong')
        : 'Coming up — get set',
      pct: Math.max(0, Math.min(100, Math.round(pos.elapsed / pos.total * 100))),
      totalLeft: mmss(pos.total - pos.elapsed) + ' left in class',
    };
  }

  const lookaheadFrom = i => {
    const plan = cls.plan || [];
    for (let k = i + 1; k < plan.length; k++) if (plan[k].name) return k - i;
    return 1;
  };

  function renderClassClock() {
    const plan = cls.plan || [];
    if (!plan.length) return '';

    if (!(prog.classStart || cls.t0)) {
      return '<div class="ath-card ath-clock ath-clock-idle">' +
        '<div class="ath-kicker">⏱️ Follow the room</div>' +
        '<div class="ath-count-label">Your instructor hasn\'t started the clock yet. ' +
          'Tap below the moment they do and your phone will stay in step.</div>' +
        '<button class="ath-big-btn start" id="ath-clock-start">▶ Start with the class</button>' +
      '</div>';
    }

    const pos = planPosition();
    if (!pos) return '';

    if (pos.done) {
      return '<div class="ath-card ath-clock is-done">' +
        '<div class="ath-kicker">✅ Class complete</div>' +
        '<div class="ath-clock-time" id="ath-clock-time">Done</div>' +
        '<div class="ath-clock-now" id="ath-clock-now">Great work.</div>' +
      '</div>';
    }

    const f = clockFace(pos);
    return '<div class="ath-card ath-clock phase-' + pos.step.phase + '" id="ath-clock-card">' +
      '<div class="ath-clock-phase" id="ath-clock-phase">' + esc(f.phase) + '</div>' +
      '<div class="ath-clock-time" id="ath-clock-time">' + f.time + '</div>' +
      '<div class="ath-clock-now" id="ath-clock-now">' + esc(f.now) + '</div>' +
      '<div class="ath-clock-next" id="ath-clock-next">' + esc(f.next) + '</div>' +
      '<div class="ath-clock-bar"><span id="ath-clock-fill" style="width:' + f.pct + '%"></span></div>' +
      '<div class="ath-clock-total" id="ath-clock-total">' + f.totalLeft + '</div>' +
      '<button class="ath-mini ath-resync" id="ath-resync-btn">⇄ Re-sync to the room</button>' +
      (resyncOpen ? resyncList(pos) : '') +
    '</div>';
  }

  // Tapping the move the room is actually on snaps this phone to the nearest
  // occurrence of it — nearest, so it works both when the instructor paused
  // (snap back) and when they skipped ahead (snap forward), and it picks the
  // right round out of the eight identical rounds in a Tabata.
  // Only moves near the current position are offered: a full class is 30-odd
  // moves, which is an unusable list on a phone, and the room is never more
  // than a few moves away from where this clock thinks it is.
  const RESYNC_BACK = 4, RESYNC_FWD = 5;

  function resyncList(pos) {
    const plan = cls.plan || [];
    const seq = [];
    plan.forEach(s => {
      if (s.name && s.phase !== 'rest' && seq[seq.length - 1] !== s.name) seq.push(s.name);
    });
    if (!seq.length) return '';
    const cur = pos.step ? seq.lastIndexOf(pos.step.name) : -1;
    const at = cur < 0 ? 0 : cur;
    const from = Math.max(0, at - RESYNC_BACK);
    const win = seq.slice(from, at + RESYNC_FWD + 1);
    return '<div class="ath-resync-panel">' +
      '<div class="ath-resync-hint">Which move is the room on?</div>' +
      '<div class="ath-resync-opts">' +
        win.map(n => '<button class="ath-resync-opt' + (n === (pos.step || {}).name ? ' is-current' : '') +
          '" data-resync="1">' + esc(n) + '</button>').join('') +
      '</div>' +
      '<button class="ath-mini ath-resync-cancel" id="ath-resync-cancel">Cancel</button>' +
    '</div>';
  }

  function applyResync(name) {
    const plan = cls.plan || [];
    const e = planElapsed();
    let best = null, bestGap = Infinity;
    plan.forEach(s => {
      if (s.name !== name || s.phase === 'rest') return;
      const gap = Math.abs(s.start - e);
      if (gap < bestGap) { bestGap = gap; best = s; }
    });
    if (!best) return;
    prog.syncOffset = (prog.syncOffset || 0) + (e - best.start);
    resyncOpen = false;
    persist(); render();
    if (navigator.vibrate) navigator.vibrate(30);
  }

  // A class on the clock: the phone is a repeater for the room, plus the
  // full list so nobody has to squint at the screen across the gym. The
  // list is rebuilt from the plan, which already names every move in order.
  // Core Burner moves are left out — they get their own section below.
  function renderClockFollow() {
    const burnerNames = {};
    ((cls.burner && cls.burner.items) || []).forEach(i => { burnerNames[i.name] = 1; });
    const seen = [];
    (cls.plan || []).forEach(s => {
      if (s.phase === 'work' && s.name && !burnerNames[s.name] && seen.indexOf(s.name) < 0) seen.push(s.name);
    });
    const list = seen.length ? seen.map(n => ({ name: n, reps: '', unit: '' })) : cls.items;
    if (!list.length) return '';
    return '<div class="ath-section">Today\'s main workout</div>' +
      '<ul class="ath-list">' + list.map((i, n) =>
        '<li><span class="ath-ex">' + (n + 1) + '. ' + esc(i.name) + '</span>' +
        (i.reps ? '<span class="ath-reps">' + esc(i.reps) + ' ' + esc(i.unit) + '</span>' : '') +
        '</li>').join('') + '</ul>';
  }

  const MAIN_RENDER = { a: renderAmrap, h: renderHundred, p: renderRungs, l: renderRungs,
                        s: renderSelfCustom, c: renderCustom, b: renderBurnerOnly,
                        t: renderClockFollow };

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
      renderClassClock() +
      main() +
      renderBurner() +
      '<div class="ath-foot">Private to ' + esc(me.name) + ' on this phone · saved automatically</div>';
    bind();
    scheduleTick();
  }

  function bind() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

    on('ath-start-btn', () => { prog.startedAt = Date.now(); persist(); requestWake(); render(); });
    on('ath-clock-start', () => { prog.classStart = Date.now(); prog.syncOffset = 0; persist(); requestWake(); render(); });
    on('ath-resync-btn', () => { resyncOpen = !resyncOpen; render(); });
    on('ath-resync-cancel', () => { resyncOpen = false; render(); });
    document.querySelectorAll('[data-resync]').forEach(b => b.addEventListener('click', () => {
      applyResync(b.textContent);
    }));
    on('ath-round-btn', () => {
      prog.rounds = prog.rounds || [];
      prog.rounds.push({ at: Date.now(), note: '' });
      persist(); render();
      if (navigator.vibrate) navigator.vibrate(35);
    });
    on('ath-undo', () => {
      if (prog.rounds && prog.rounds.length) { prog.rounds.pop(); persist(); render(); }
    });
    on('ath-rounds-inc', () => { setRoundCount((prog.rounds || []).length + 1); render(); });
    on('ath-rounds-dec', () => { setRoundCount((prog.rounds || []).length - 1); render(); });
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

    // Rung / round pickers — "where I've climbed to".
    document.querySelectorAll('[data-rung]').forEach(pill => {
      pill.addEventListener('click', () => {
        prog.rung = parseInt(pill.dataset.rung, 10) || 0;
        persist(); render();
      });
    });
    document.querySelectorAll('[data-round-pick]').forEach(pill => {
      pill.addEventListener('click', () => {
        prog.round = parseInt(pill.dataset.roundPick, 10) || 0;
        persist(); render();
      });
    });

    // Rep counters. ± and ✓ re-render (they change totals and the rung state);
    // typing only saves, so the keyboard and caret are never yanked away.
    const bump = (k, d) => { setRep(k, repCount(k) + d); afterRepChange(); render();
      if (navigator.vibrate) navigator.vibrate(15); };
    document.querySelectorAll('[data-rep-inc]').forEach(b =>
      b.addEventListener('click', () => bump(b.dataset.repInc, 1)));
    document.querySelectorAll('[data-rep-dec]').forEach(b =>
      b.addEventListener('click', () => bump(b.dataset.repDec, -1)));
    document.querySelectorAll('[data-rep-fill]').forEach(b =>
      b.addEventListener('click', () => {
        const k = b.dataset.repFill, t = parseInt(b.dataset.target, 10) || 0;
        setRep(k, repCount(k) >= t ? 0 : t);
        afterRepChange(); render();
        if (navigator.vibrate) navigator.vibrate(25);
      }));
    document.querySelectorAll('[data-rep-set]').forEach(inp => {
      inp.addEventListener('input', () => { setRep(inp.dataset.repSet, inp.value); persist(); });
      inp.addEventListener('change', () => { setRep(inp.dataset.repSet, inp.value); afterRepChange(); render(); });
      inp.addEventListener('click', e => e.stopPropagation());
    });
    const roundsInput = document.getElementById('ath-rounds-set');
    if (roundsInput) {
      roundsInput.addEventListener('change', () => {
        setRoundCount(parseInt(roundsInput.value, 10) || 0); render();
      });
      roundsInput.addEventListener('click', e => e.stopPropagation());
    }

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

  // Editing the round count by hand keeps the split log honest: new rounds are
  // stamped now and marked estimated, and trimming drops the most recent.
  function setRoundCount(n) {
    n = Math.max(0, Math.min(99, parseInt(n, 10) || 0));
    prog.rounds = prog.rounds || [];
    if (!n) { prog.rounds = []; }
    while (prog.rounds.length < n) prog.rounds.push({ at: Date.now(), note: '', est: true });
    while (prog.rounds.length > n) prog.rounds.pop();
    if (n && !prog.startedAt) prog.startedAt = Date.now();
    persist();
  }

  // Filling a rung or round moves the athlete on, so they are not left
  // tapping a finished list.
  function afterRepChange() {
    const targetOf2 = it => parseInt(it.reps, 10) || 0;
    if (cls.mode === 'p' || cls.mode === 'l') {
      const rungs = (cls.rungs && cls.rungs.length) ? cls.rungs : (RUNG_FALLBACK[cls.mode] || []);
      const g = Math.min(Math.max(0, prog.rung || 0), rungs.length - 1);
      if (g + 1 < rungs.length && cls.items.length &&
          cls.items.every((_, i) => repCount('g' + g + '_' + i) >= rungs[g])) {
        prog.rung = g + 1;
      }
    } else if (cls.mode === 's') {
      const rounds = Math.max(1, cls.rounds || 1);
      const r = Math.min(Math.max(0, prog.round || 0), rounds - 1);
      if (r + 1 < rounds && cls.items.length &&
          cls.items.every((it, i) => repCount('r' + r + '_' + i) >= targetOf2(it))) {
        prog.round = r + 1;
      }
    } else if (cls.mode === 'a') {
      const n = (prog.rounds || []).length;
      if (cls.items.length && cls.items.every((it, i) => targetOf2(it) > 0 &&
          repCount('r' + n + '_' + i) >= targetOf2(it))) {
        prog.rounds = prog.rounds || [];
        prog.rounds.push({ at: Date.now(), note: '' });
      }
    }
    persist();
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

  // Updates the clock card in place. Re-rendering every second would reset
  // the athlete's scroll position and close the re-sync panel mid-tap.
  let lastClockIdx = -1;
  function tickClassClock() {
    const timeEl = document.getElementById('ath-clock-time');
    if (!timeEl) return;
    const pos = planPosition();
    if (!pos) return;

    if (pos.done) {
      if (lastClockIdx !== -2) { lastClockIdx = -2; render(); }
      return;
    }

    const f = clockFace(pos);
    timeEl.textContent = f.time;
    const totalEl = document.getElementById('ath-clock-total');
    if (totalEl) totalEl.textContent = f.totalLeft;
    const fill = document.getElementById('ath-clock-fill');
    if (fill) fill.style.width = f.pct + '%';

    if (pos.idx !== lastClockIdx) {
      lastClockIdx = pos.idx;
      const ph = document.getElementById('ath-clock-phase');
      if (ph) ph.textContent = f.phase;
      const now = document.getElementById('ath-clock-now');
      if (now) now.textContent = f.now;
      const next = document.getElementById('ath-clock-next');
      if (next) next.textContent = f.next;
      const card = document.getElementById('ath-clock-card');
      if (card) card.className = 'ath-card ath-clock phase-' + pos.step.phase;
      if (pos.step.phase === 'work' && navigator.vibrate) navigator.vibrate(40);
    }
  }

  // Only the clock line ticks, so typing a rep count is never interrupted.
  function scheduleTick() {
    if (tickHandle) clearInterval(tickHandle);
    const mirrors = (cls.plan || []).length && (prog.classStart || cls.t0);
    if (!mirrors && (!SELF_PACED_MODES[cls.mode] || !prog.startedAt)) return;
    tickHandle = setInterval(() => {
      if (mirrors) tickClassClock();
      const cd = document.getElementById('ath-countdown');
      if (cd) {
        const rem = remainingMs();
        if (rem === null) return;
        cd.textContent = rem === 0 ? 'TIME' : fmtClock(rem);
        if (rem === 0) {
          const wrap = cd.parentNode;
          if (wrap && !wrap.classList.contains('is-up')) {
            wrap.classList.add('is-up');
            const lbl = document.getElementById('ath-countdown-label');
            if (lbl) lbl.textContent = 'cap reached';
            if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
          }
          clearInterval(tickHandle); tickHandle = null;
        }
        return;
      }
      const el = document.getElementById('ath-elapsed');
      if (!el) return;
      el.textContent = fmtClock(Date.now() - prog.startedAt);
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
