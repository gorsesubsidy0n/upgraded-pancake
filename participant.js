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
  const widthFor36 = n => { let w = 1; while (Math.pow(36, w) < n) w++; return w; };
  // A plan that would not fit the original single-character name slot goes
  // out in a "wide" form instead: two-character name refs, marked with a W
  // prefix and carried in a payload field older phones never read, so an
  // out-of-date phone shows the move list rather than a garbled clock.
  const WIDE = 'W';
  const MAX_PLAN_STEPS = 3000;

  function packPlan(seq) {
    if (!seq || !seq.length) return '';
    const nameIdx = new Map();
    seq.forEach(s => { const nm = clean(s.name); if (nm && !nameIdx.has(nm)) nameIdx.set(nm, nameIdx.size); });
    if (nameIdx.size > 36 * 36) return '';
    const nw = nameIdx.size > 36 ? 2 : 1;
    const tokenIdx = new Map(), order = [];
    seq.forEach(s => {
      const dur = Math.min(1295, Math.max(0, Math.round(s.duration || 0)));
      let code = PHASE_CODES.indexOf(s.phase);
      if (code < 0) code = 2;
      const nm = clean(s.name);
      const ref = nm ? pad(nameIdx.get(nm), nw) : '-'.repeat(nw);
      const tok = pad(dur, 2) + code + ref;
      if (!tokenIdx.has(tok)) tokenIdx.set(tok, tokenIdx.size);
      order.push(tokenIdx.get(tok));
    });
    const w = widthFor36(tokenIdx.size);
    return (nw === 2 ? WIDE : '') + [w, [...tokenIdx.keys()].join(''),
            order.map(i => pad(i, w)).join(''),
            [...nameIdx.keys()].join('~')].join('!');
  }

  function unpackPlan(raw) {
    if (!raw) return [];
    let s = String(raw), nw = 1;
    if (s.charAt(0) === WIDE) { nw = 2; s = s.slice(1); }
    const tl = 3 + nw;
    // Split on the first three separators only — the trailing name list is
    // free-form and legitimately contains "!" (e.g. "Get Ready!").
    const i1 = s.indexOf('!');
    const i2 = s.indexOf('!', i1 + 1);
    const i3 = s.indexOf('!', i2 + 1);
    if (i1 < 0 || i2 < 0 || i3 < 0) return [];
    const w = Math.min(4, Math.max(1, parseInt(s.slice(0, i1), 10) || 1));
    const dictRaw = s.slice(i1 + 1, i2);
    const idx = s.slice(i2 + 1, i3);
    const names = s.slice(i3 + 1).split('~');
    const dict = [];
    for (let i = 0; i + tl <= dictRaw.length; i += tl) dict.push(dictRaw.substr(i, tl));
    const out = [];
    for (let i = 0; i + w <= idx.length && out.length < MAX_PLAN_STEPS; i += w) {
      const tok = dict[parseInt(idx.substr(i, w), 36)];
      if (!tok) continue;
      const ref = tok.substr(3, nw);
      out.push({
        duration: parseInt(tok.substr(0, 2), 36) || 0,
        phase: PHASE_CODES[parseInt(tok.charAt(2), 10)] || 'work',
        name: ref.charAt(0) === '-' ? '' : (names[parseInt(ref, 36)] || ''),
      });
    }
    let t = 0;
    out.forEach(st => { st.start = t; t += st.duration; });
    return out;
  }

  // Coaching detail for each move on the clock — prop, form cue and the
  // easier / harder options — so a phone can show more than a bare name.
  //   info → name^prop^cue^easier^harder~…
  const INFO_LIMITS = [60, 40, 90, 40, 40];
  function packInfo(map) {
    return Object.keys(map || {}).map(n => {
      const i = map[n] || {};
      const f = [n, i.prop, i.cue, i.easier, i.harder].map((v, k) => clean(v).slice(0, INFO_LIMITS[k]));
      return f.slice(1).some(Boolean) ? f.join('^') : '';
    }).filter(Boolean).join('~');
  }
  function unpackInfo(raw) {
    const out = Object.create(null);
    String(raw || '').split('~').slice(0, 200).forEach(chunk => {
      const f = chunk.split('^');
      if (!f[0]) return;
      out[f[0]] = { prop: f[1] || '', cue: f[2] || '', easier: f[3] || '', harder: f[4] || '' };
    });
    return out;
  }

  // Counts in a link are clamped: a hand-edited link with rounds=1e9 would
  // otherwise freeze the phone building a billion-row list.
  const clampInt = (v, lo, hi, dflt) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };

  // v2 adds main-block rounds and a Core Burner block. v3 adds the time cap
  // for the whole main block. v4 adds the run-length encoded class plan and
  // the wall-clock time step 0 began, which is what lets a phone mirror the
  // room's clock. Older links are still read, so a code scanned before an
  // update keeps working for that class.
  // Still v4, with optional fields appended — older phones simply ignore
  // them: 15 = seconds into the class when the instructor paused (0 = the
  // clock is running), 16 = a wide plan (see packPlan), 17 = move info.
  function encodePayload(p) {
    const b = p.burner || {};
    const plan = p.plan || '';
    const wide = plan.charAt(0) === WIDE;
    const fields = [
      '4', p.mode, p.sid, clean(p.title), clean(p.meta),
      String(p.rounds || 1), packItems(p.items),
      String(b.rounds || 0), String(b.work || 0), String(b.rest || 0), packItems(b.items),
      String(p.cap || 0), (p.rungs || []).join(','),
      wide ? '' : plan, String(p.t0 || 0),
    ];
    const extra = [String(p.paused || 0), wide ? plan : '', p.info ? packInfo(p.info) : ''];
    while (extra.length && (extra[extra.length - 1] === '' || extra[extra.length - 1] === '0')) extra.pop();
    return b64urlEncode(fields.concat(extra).join('|'));
  }

  function decodePayload(raw) {
    const parts = b64urlDecode(raw).split('|');
    if (parts[0] === '1') {
      return { mode: parts[1], sid: parts[2], title: parts[3], meta: parts[4],
               rounds: 1, items: unpackItems(parts[5]).slice(0, 100), burner: null, cap: 0, rungs: null,
               plan: [], t0: 0, paused: 0, info: {} };
    }
    if (['2', '3', '4'].indexOf(parts[0]) < 0) throw new Error('unsupported payload version');
    const bRounds = clampInt(parts[7], 0, 50, 0);
    const bItems = unpackItems(parts[10]).slice(0, 50);
    const mode = parts[1];
    const rungs = (parts[12] || '').split(',').slice(0, 50).map(n => parseInt(n, 10))
      .filter(n => n > 0).map(n => Math.min(999, n));
    return {
      mode, sid: String(parts[2] || '').replace(/[^a-z0-9]/gi, '').slice(0, 24), title: parts[3], meta: parts[4],
      rounds: clampInt(parts[5], 1, 50, 1),
      items: unpackItems(parts[6]).slice(0, 100),
      cap: clampInt(parts[11], 0, 86400, 0),
      rungs: rungs.length ? rungs : (RUNG_FALLBACK[mode] || null),
      plan: unpackPlan(parts[13] || parts[16] || ''),
      t0: clampInt(parts[14], 0, 8.64e15, 0),
      paused: clampInt(parts[15], 0, 86400, 0),
      info: unpackInfo(parts[17]),
      burner: (bRounds && bItems.length)
        ? { rounds: bRounds, work: clampInt(parts[8], 0, 3600, 0),
            rest: clampInt(parts[9], 0, 3600, 0), items: bItems }
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
    d = IHStore.get(DEVICE_KEY) || '';
    if (!/^d[a-z0-9]{5,}$/.test(d)) {
      d = 'd' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
      IHStore.set(DEVICE_KEY, d);
    }
    return d;
  }
  const isDeviceUid = uid => /^d[a-z0-9]{6,}$/.test(String(uid || ''));
  const slugName = n => String(n || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

  // Through IHStore so a name typed on a phone in Private Browsing still
  // holds for the rest of the class, instead of vanishing between screens.
  function loadNames() { return IHStore.getJSON(NAMES_KEY, {}) || {}; }
  function rememberName(uid, name) {
    const m = loadNames(); m[uid] = name;
    IHStore.setJSON(NAMES_KEY, m);
    IHStore.set(LAST_NAME_KEY, name);
  }
  const lastName = () => IHStore.get(LAST_NAME_KEY) || '';
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
    const cur = IHStore.getJSON(storeKey(sid, uid), null);
    if (cur) return cur;
    // Progress saved before athletes had ids belongs to whoever is here now.
    const old = IHStore.getJSON(legacyKey(sid), null);
    if (old) {
      IHStore.remove(legacyKey(sid));
      saveProgress(sid, uid, old);
      return old;
    }
    return {};
  }
  function saveProgress(sid, uid, data) {
    IHStore.setJSON(storeKey(sid, uid), data);
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
    a: { title: '🔄 Track your rounds', hint: 'Log every round, add partial reps, and watch the block clock.' },
    h: { title: '💯 Your rep counter', hint: 'Count reps as you knock them out — the clock runs on your phone.' },
    p: { title: '🔺 Track your climb', hint: 'Mark the rung you are on and count reps as you go.' },
    l: { title: '📈 Track your climb', hint: 'Mark the rung you are on and count reps as you go.' },
    s: { title: '🛠️ Track your reps', hint: 'Work at your own pace and log reps as you finish them.' },
    c: { title: '🛠️ Your class checklist', hint: 'Keep your place round by round, at your own pace.' },
    b: { title: '🎯 The Core Burner', hint: 'See the finisher and tick each move as you go.' },
    t: { title: '📲 Follow along', hint: 'Your phone shows the same clock as the room.' },
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
    const seq = clockDriven ? currentSequence() : [];
    const plan = clockDriven ? packPlan(seq) : '';
    const paused = clockDriven ? classPausedAt() : 0;

    return {
      mode, meta, rounds: Math.min(50, Math.max(1, rounds)), burner, cap, rungs, plan,
      items: (clockDriven && plan) ? [] : items,
      t0: clockDriven ? classStartEpoch() : 0,
      paused,
      planMissing: clockDriven && !plan && seq.length > 0,
      info: plan ? moveInfo(w, seq) : null,
      sid: workoutSid(w),
      title: (w.styleCfg && w.styleCfg.name ? w.styleCfg.name : w.style) + ' · ' + (w.muscle || 'full') + ' focus',
    };
  }

  const workoutSid = w => (w.athleteSid ||
    (w.athleteSid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)));

  // Prop and form cue come from the timer steps; the easier / harder options
  // from the plan itself. Only moves that appear on the clock are sent.
  function moveInfo(w, seq) {
    const out = {};
    const byName = {};
    [].concat(w.exercises || [], (w.coreBurner && w.coreBurner.exercises) || [])
      .forEach(ex => { if (ex && ex.name && !byName[ex.name]) byName[ex.name] = ex; });
    (seq || []).forEach(s => {
      const nm = clean(s.name);
      if (!nm || out[nm] || (s.phase !== 'work' && s.phase !== 'warmup' && s.phase !== 'cooldown')) return;
      const ex = byName[s.name] || {};
      out[nm] = { prop: s.prop || '', cue: s.cue || ex.cue || '', easier: ex.easier || '', harder: ex.harder || '' };
    });
    return out;
  }

  // The same detail rebuilt from this phone's copy of the exercise library,
  // for links that left it out. Custom moves and edited cues aren't in the
  // library, so those show without detail.
  function libraryInfo(name) {
    try {
      const hit = name && typeof exFind === 'function' ? exFind(name) : null;
      if (hit && hit.ex) {
        const ex = hit.ex;
        const prop = (typeof PROP_LABELS !== 'undefined' && PROP_LABELS[hit.group]) || '';
        return (prop || ex.cue || ex.easier || ex.harder)
          ? { prop, cue: ex.cue || '', easier: ex.easier || '', harder: ex.harder || '' } : null;
      }
      const pools = [].concat(typeof WARMUP_POOL !== 'undefined' ? WARMUP_POOL : [],
                              typeof COOLDOWN_POOL !== 'undefined' ? COOLDOWN_POOL : []);
      const p = pools.find(x => x && x.name === name);
      return p && p.note ? { prop: p.note, cue: '', easier: '', harder: '' } : null;
    } catch (e) { return null; }
  }

  // The live timer, but only when it belongs to the class on screen. A timer
  // left over from an earlier class must never leak into a new link
  // (app.js stamps workoutRef whenever it builds a live sequence).
  function liveTimer() {
    try {
      const t = state.timer;
      if (!t || !t.sequence || !t.sequence.length) return null;
      if (!t.workoutRef || t.workoutRef !== state.workout) return null;
      return t;
    } catch (e) { return null; }
  }

  // The live sequence when class is running, otherwise the plan as it would
  // be built — so a code scanned before Go Live still shows the right class.
  function currentSequence() {
    try {
      const t = liveTimer();
      if (t) return t.sequence;
      return buildTimerSequence();
    } catch (e) { return []; }
  }

  // Seconds of the class already behind the live timer. While running, the
  // step deadline is more precise than the whole-second display.
  function liveElapsed(t) {
    const i = Math.max(0, Math.min(t.current || 0, t.sequence.length - 1));
    let elapsed = 0;
    for (let k = 0; k < i; k++) elapsed += Math.round(t.sequence[k].duration || 0);
    const dur = Math.round(t.sequence[i].duration || 0);
    let left = Math.max(0, t.seconds || 0);
    if (t.isRunning && t.deadline) left = Math.max(0, (t.deadline - Date.now()) / 1000);
    return elapsed + Math.max(0, dur - Math.min(dur, left));
  }

  // Wall-clock time step 0 started, derived by rewinding through the steps
  // already completed. Deriving rather than storing absorbs any pauses that
  // happened before the code was shown. 0 means "not live yet".
  function classStartEpoch() {
    try {
      const t = liveTimer();
      if (!t) return 0;
      const e = liveElapsed(t);
      if (!t.isRunning && !t._started && e <= 0) return 0;
      return Math.round(Date.now() - e * 1000);
    } catch (e) { return 0; }
  }

  // Seconds into the class when the instructor paused, or 0 while the clock
  // runs. A link made during a pause carries this so phones freeze at the
  // same spot instead of racing ahead of the room.
  function classPausedAt() {
    try {
      const t = liveTimer();
      if (!t || t.isRunning) return 0;
      const e = liveElapsed(t);
      if (!t._started && e <= 0) return 0;
      return Math.max(1, Math.round(e));
    } catch (e) { return 0; }
  }

  // Remembered per class, so the "send a fresh link" prompt after a pause
  // still appears once the instructor has reloaded or resumed the class.
  const SHARED_KEY = 'ih_link_shared_v1';
  function markLinkShared() {
    window.__ihLinkShared = true;
    try {
      const w = currentWorkout();
      if (w) IHStore.setJSON(SHARED_KEY, { sid: workoutSid(w), at: Date.now() });
    } catch (e) {}
  }
  window.ihMarkLinkShared = markLinkShared;
  window.ihLinkWasShared = function () {
    if (window.__ihLinkShared) return true;
    try {
      const w = currentWorkout();
      const rec = IHStore.getJSON(SHARED_KEY, null);
      return !!(w && rec && w.athleteSid && rec.sid === w.athleteSid &&
        Date.now() - rec.at < 12 * 3600 * 1000);
    } catch (e) { return false; }
  };

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
    return normalizeBase(IHStore.get(HOST_KEY) || '');
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
    return b.url + '#' + HASH_KEY + '=' + encodePayload(payload) + linkTokenSuffix();
  }

  // The link for the scan code. A clock class's link is mostly per-move
  // coaching text, which makes a code too dense to read off a screen, so
  // the code leaves it out when it has to; the phone fills it back in from
  // its own exercise library (see libraryInfo). Copied links keep it all.
  const SCAN_MAX_VERSION = 25;
  function scanLink(payload, base, url) {
    const full = window.IHQR && IHQR.encode(url);
    if (!payload.info || (full && full.version <= SCAN_MAX_VERSION)) return url;
    return athleteUrl(Object.assign({}, payload, { info: null }), base);
  }

  // The access gate ships a token that unlocks the athlete side straight
  // from the link, so nobody types a code while the class waits. Absent
  // when the gate isn't loaded, which keeps this file usable on its own.
  function linkTokenSuffix() {
    try {
      const t = typeof ihLinkToken === 'function' ? ihLinkToken() : '';
      return t ? '&k=' + t : '';
    } catch (e) { return ''; }
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
        '<button class="qr-btn primary" data-onclick="__ihSaveHost()">Save</button>' +
        (saved ? '<button class="qr-btn" data-onclick="__ihClearHost()">Remove</button>' : '') +
        '<button class="qr-btn" data-onclick="__ihToggleHostForm()">Cancel</button>' +
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
        '<button class="qr-btn tiny" data-onclick="__ihToggleHostForm()">' +
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
    markLinkShared();
    // Ask the server which address phones should use before drawing, so a
    // code generated on localhost still points somewhere reachable.
    loadPhoneOrigin(() => paintClassQR(payload));
  };

  // One tap from the "you paused" bar: rebuild the link at the room's
  // current position and put it on the clipboard, without opening a dialog.
  // Falls back to the panel when the clipboard is unavailable (plain http).
  window.ihCopyFreshClassLink = function () {
    const w = currentWorkout();
    const payload = w && classPayloadFromWorkout(w);
    if (!payload) { window.showClassQR(); return; }
    markLinkShared();
    const url = athleteUrl(payload);
    if (!url || athleteBase().kind === 'loopback' || !navigator.clipboard || !navigator.clipboard.writeText) {
      window.showClassQR(); return;
    }
    navigator.clipboard.writeText(url).then(() => {
      if (window.showToast) showToast(payload.paused
        ? '🔗 Paused link copied — phones freeze here until athletes tap ▶'
        : '🔗 Fresh link copied — paste it into the class chat');
    }, () => window.showClassQR());
  };

  function paintClassQR(payload) {
    const base = athleteBase();
    const url = athleteUrl(payload, base);
    const modal = document.getElementById('qr-modal');
    const body = document.getElementById('qr-modal-body');
    if (!modal || !body) return;

    // A class plan travels inside the link, so its scan code is dense: the
    // panel shows a small copy and a tap puts it full screen, where any
    // phone camera can read it off a laptop or TV. The link stays for chat.
    let linkBlock;
    if (!url) {
      linkBlock = '<div class="qr-error">No address to share yet.<br>' +
                  'Publish a copy below.</div>';
    } else if (base.kind === 'loopback') {
      linkBlock =
        '<div class="qr-error"><b>localhost</b> is not an address another ' +
        'phone can open.<br>Set up a published copy below, or start the app ' +
        'with <code>node serve.js</code>.</div>' +
        '<div class="qr-url-label">Works on this computer only:' +
          '<button class="qr-btn tiny" data-onclick="__ihCopyLink()">Copy</button></div>' +
        '<div class="qr-url" id="qr-url">' + esc(url) + '</div>';
    } else {
      linkBlock =
        (window.IHQR ? IHQR.panelHtml(scanLink(payload, base, url), 'qr-scan-url',
          'Athletes scan this with their phone camera') : '') +
        '<div class="qr-link-box">' +
          '<div class="qr-link-label">Send this link to the class</div>' +
          '<div class="qr-url" id="qr-url">' + esc(url) + '</div>' +
          '<button class="qr-btn qr-copy-big" data-onclick="__ihCopyLink()">' +
            '📋 Copy link</button>' +
          '<div class="qr-link-hint">Paste it into your class group chat, or ' +
            'text it to anyone who arrives late. It opens straight on their ' +
            'phone — no code to type.<br><b>Paused or skipped a move?</b> Copy ' +
            'the link again after you resume. Phones that open it re-align ' +
            'to the room automatically.</div>' +
        '</div>';
    }

    if (url && payload.paused) {
      linkBlock += '<div class="qr-link-hint qr-warn-line">⏸ The class is paused, so this link ' +
        'freezes phones at ' + fmtClock(payload.paused * 1000) + ' into the class. Athletes tap ▶ when you ' +
        'resume — or copy the link again once you are running.</div>';
    }
    if (url && payload.planMissing) {
      linkBlock += '<div class="qr-link-hint qr-warn-line">⚠️ This class is too long to carry the ' +
        'room clock in a link, so phones get the move list without the live timer.</div>';
    }

    const copy = MODE_COPY[payload.mode] || MODE_COPY.h;
    body.innerHTML =
      '<div class="qr-head">' +
        '<div class="qr-title">' + copy.title + '</div>' +
        '<div class="qr-sub">' + esc(payload.title) + ' · ' + esc(payload.meta) +
          (payload.burner && payload.mode !== 'b'
            ? ' · 🎯 ' + payload.burner.items.length + '-move Core Burner' : '') +
        '</div>' +
      '</div>' +
      linkBlock +
      reachHtml(base) +
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
    IHStore.set(HOST_KEY, norm);
    hostFormOpen = false;
    showClassQR();
    if (window.showToast) showToast('📶 Codes now point at ' + norm);
  };
  window.__ihClearHost = function () {
    IHStore.remove(HOST_KEY);
    hostFormOpen = false;
    showClassQR();
    if (window.showToast) showToast('Published address removed.');
  };
  window.__ihCopyLink = function () {
    const el = document.getElementById('qr-url');
    if (!el) return;
    const text = el.textContent;
    const ok = () => { if (window.showToast) showToast('🔗 Link copied'); };
    // Selecting it means that even if both copy routes fail, the link is
    // sitting highlighted and ready for Ctrl-C.
    const select = () => {
      try {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch (e) {}
    };
    // execCommand is the fallback that matters here: navigator.clipboard
    // only exists in a secure context, and the app is often served over
    // plain http on a studio LAN address, where it is simply absent.
    const legacy = () => {
      select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (e) {}
      if (copied) ok();
      else if (window.showToast) showToast('Press Ctrl-C to copy the link');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, legacy);
    } else { legacy(); }
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

  function persist() { saveProgress(cls.sid, me.uid, prog); trackBest(); }

  // ── Personal bests ───────────────────────────────────────────────────
  // Private to the phone, like the rest of the athlete's progress. A class
  // is matched by mode + title, so "Friday AMRAP" compares with last Friday.
  const bestKey = () => 'ih_athlete_best_' + me.uid;
  const bestClassKey = () => cls.mode + ':' + String(cls.title || '').toLowerCase().slice(0, 60);
  function currentTotals() {
    const rounds = (prog.rounds || []).length;
    const reps = Object.values(prog.reps || {}).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
    return { rounds: rounds, reps: reps, score: rounds * 10000 + reps };
  }
  function getBest() {
    const all = IHStore.getJSON(bestKey(), {}) || {};
    return all[bestClassKey()] || null;
  }
  function trackBest() {
    if (!me) return;
    const t = currentTotals();
    if (t.score <= 0) return;
    const all = IHStore.getJSON(bestKey(), {}) || {};
    const k = bestClassKey(), best = all[k];
    if (best && t.score <= best.score) return;
    const beatOlder = best && best.sid !== cls.sid;
    all[k] = { score: t.score, rounds: t.rounds, reps: t.reps, sid: cls.sid, at: Date.now(),
               prev: beatOlder ? { rounds: best.rounds, reps: best.reps } : (best && best.prev) || null };
    const keys = Object.keys(all);
    if (keys.length > 40) {
      keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 40).forEach(x => delete all[x]);
    }
    IHStore.setJSON(bestKey(), all);
    if (beatOlder && window.showToast) showToast('🏅 New personal best!', 'success');
  }
  function renderBest() {
    const b = getBest();
    if (!b) return '';
    const fmt = x => (cls.mode === 'a' ? x.rounds + ' round' + (x.rounds === 1 ? '' : 's') +
      (x.reps ? ' + ' + x.reps + ' reps' : '') : x.reps + ' reps');
    const t = currentTotals();
    const isNow = b.sid === cls.sid && t.score >= b.score;
    return '<div class="ath-card ath-best">' +
      '<div class="ath-best-title">🏅 Personal best for this class</div>' +
      '<div class="ath-best-val">' + esc(fmt(b)) + '</div>' +
      (isNow && b.prev ? '<div class="ath-best-sub">Beat your previous ' + esc(fmt(b.prev)) + '</div>' : '') +
      '</div>';
  }

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
    // Keep the unlock token that came in with the link. Dropping it would
    // lock this phone out the next time it reopened the page from history.
    const k = /[#&?]k=([A-Za-z0-9]+)/.exec(location.href || '');
    const hash = '#' + HASH_KEY + '=' + rawPayload +
      (k ? '&k=' + k[1] : '') +
      '&' + UID_KEY + '=' + encodeURIComponent(uid);
    try { history.replaceState(null, '', location.href.split('#')[0] + hash); }
    catch (e) { try { location.hash = hash.slice(1); } catch (e2) {} }
    rememberLastClass();
    rememberSidUid(cls.sid, uid);
  }

  // The installed app opens on its start URL, not on the link, so the last
  // class is kept for a "Reopen last class" button on the empty screen.
  function rememberLastClass() {
    try {
      localStorage.setItem('ih_last_class_hash', JSON.stringify({ hash: location.hash, at: Date.now() }));
    } catch (e) {}
  }

  // A re-sync link sent mid-class has no &u=, so the phone remembers who it
  // was for each class and goes straight back to that athlete's page.
  const SID_UID_KEY = 'ih_athlete_sid_uid_v1';
  function rememberSidUid(sid, uid) {
    if (!sid || !uid) return;
    try {
      const map = IHStore.getJSON(SID_UID_KEY, {}) || {};
      delete map[sid];
      map[sid] = uid;
      const keys = Object.keys(map);
      keys.slice(0, Math.max(0, keys.length - 30)).forEach(k => delete map[k]);
      IHStore.setJSON(SID_UID_KEY, map);
    } catch (e) {}
  }
  function uidForSid(sid) {
    try {
      const map = IHStore.getJSON(SID_UID_KEY, {}) || {};
      const uid = map[sid];
      return (typeof uid === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(uid)) ? uid : '';
    } catch (e) { return ''; }
  }

  function identify(uid) {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    me = { uid, name: displayName(uid) };
    prog = migrateProgress(loadProgress(cls.sid, uid));
    // A fresh link carries a new class start time (or pause point) that
    // already accounts for anything the room did since. Whatever this phone
    // did by hand — nudges, "start with the class", resuming a pause — was
    // a workaround for an older link, so drop it and trust the new one.
    const linkId = cls.paused ? 'p' + cls.paused + '@' + cls.t0 : (cls.t0 || 0);
    if (linkId && prog.t0seen !== linkId) {
      prog.syncOffset = 0;
      prog.classStart = 0;
      prog.pausedAt = cls.paused || 0;
      prog.t0seen = linkId;
      persist();
    }
    writeUidToUrl(uid);
    render();
    if (!classIsOver()) requestWake();
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
  // A link made while the room was paused stays frozen at that point until
  // the athlete taps "the room has resumed". null = no start time at all.
  const isFrozen = () => !!(prog && prog.pausedAt && !prog.classStart);
  function planElapsed() {
    if (isFrozen()) return prog.pausedAt - (prog.syncOffset || 0);
    const base = prog.classStart || cls.t0 || 0;
    if (!base) return null;
    return Math.floor((Date.now() - base) / 1000) - (prog.syncOffset || 0);
  }

  function planPosition() {
    const plan = cls.plan || [];
    const e = planElapsed();
    if (e === null || !plan.length) return null;
    const total = planTotal();
    // A phone whose clock runs a little behind the laptop's sees a start
    // time in the future; count down to it rather than showing nothing.
    if (e < 0) return { pending: true, idx: 0, step: plan[0], left: -e, elapsed: e, total };
    if (e >= total) return { done: true, idx: plan.length - 1, left: 0, elapsed: e, total };
    let idx = 0;
    for (let i = 0; i < plan.length; i++) {
      if (e < plan[i].start + plan[i].duration) { idx = i; break; }
    }
    const st = plan[idx];
    return { done: false, paused: isFrozen(), idx, step: st, left: st.start + st.duration - e, elapsed: e, total };
  }

  const posKind = pos => !pos ? 'none' : pos.pending ? 'pending' : pos.done ? 'done'
    : pos.paused ? 'paused' : 'live';

  // True once there is nothing left to follow, so the screen may sleep.
  function classIsOver() {
    if (!cls || !prog) return false;
    if ((cls.plan || []).length) { const p = planPosition(); return !!(p && p.done); }
    if (SELF_PACED_MODES[cls.mode]) return remainingMs() === 0;
    return false;
  }

  const isMovePhase = ph => ph === 'work' || ph === 'warmup' || ph === 'cooldown';

  // The next *different* move. Tabata repeats one exercise for eight rounds,
  // so "next" must skip past the repeats or it just echoes the current move.
  function nextWorkStep(from) {
    const plan = cls.plan || [];
    const cur = plan[from] ? plan[from].name : '';
    for (let i = from + 1; i < plan.length; i++) {
      if (plan[i].name && plan[i].phase !== 'rest' && plan[i].phase !== 'get-ready' &&
          plan[i].name !== cur) return plan[i];
    }
    return null;
  }

  // The move an athlete should be thinking about: the one they are doing,
  // or — while resting or getting ready — the one about to start.
  function targetIdx(idx) {
    const plan = cls.plan || [];
    if (plan[idx] && isMovePhase(plan[idx].phase) && plan[idx].name) return idx;
    for (let i = idx + 1; i < plan.length; i++) if (isMovePhase(plan[i].phase) && plan[i].name) return i;
    return -1;
  }

  // "Set 3 of 8" — how many times this move has come up so far, out of how
  // many times it appears in the class. Cached per plan.
  let occCache = null;
  function occurrences() {
    if (occCache) return occCache;
    const plan = cls.plan || [], seen = {}, at = [];
    plan.forEach((s, i) => {
      if (!s.name || !isMovePhase(s.phase)) return;
      seen[s.name] = (seen[s.name] || 0) + 1;
      at[i] = seen[s.name];
    });
    occCache = { at, total: seen };
    return occCache;
  }
  function setLabel(ti) {
    const plan = cls.plan || [];
    if (ti < 0 || !plan[ti] || plan[ti].phase !== 'work') return '';
    const o = occurrences();
    const n = o.total[plan[ti].name] || 0;
    return n > 1 ? 'Set ' + o.at[ti] + ' of ' + n : '';
  }

  // Prop, form cue and easier / harder options for the target move. A
  // scanned link may leave these out, so fall back to the exercise library.
  function detailHtml(ti) {
    const plan = cls.plan || [];
    const st = plan[ti];
    const info = st ? ((cls.info && cls.info[st.name]) || libraryInfo(st.name)) : null;
    if (!info) return '';
    return (info.prop ? '<div class="ath-cd-prop">🏋️ ' + esc(info.prop) + '</div>' : '') +
      (info.cue ? '<div class="ath-cd-cue">💡 ' + esc(info.cue) + '</div>' : '') +
      ((info.easier || info.harder) ? '<div class="ath-cd-opts">' +
        (info.easier ? '<span class="ath-cd-easier"><b>Easier</b> ' + esc(info.easier) + '</span>' : '') +
        (info.harder ? '<span class="ath-cd-harder"><b>Harder</b> ' + esc(info.harder) + '</span>' : '') +
      '</div>' : '');
  }

  // One place that decides what the clock card says, so the initial render
  // and the per-second tick can never disagree.
  function clockFace(pos) {
    const plan = cls.plan || [];
    const st = pos.step;
    const ti = targetIdx(pos.idx);
    const target = ti >= 0 ? plan[ti] : null;
    const resting = !isMovePhase(st.phase);
    const nx = nextWorkStep(ti >= 0 ? ti : pos.idx);
    const set = setLabel(ti);
    return {
      phase: (pos.paused ? '⏸ Paused · ' : '') + (PHASE_LABEL[st.phase] || 'Work') +
        (resting && target ? ' · up next' : ''),
      time: mmss(pos.left),
      now: target ? target.name : (st.name || '—'),
      round: set,
      next: resting
        ? (target ? 'Coming up — get set' : 'Almost done')
        : (nx ? 'Next: ' + nx.name : 'Last one — finish strong'),
      pct: Math.max(0, Math.min(100, Math.round(pos.elapsed / pos.total * 100))),
      totalLeft: mmss(pos.total - pos.elapsed) + ' left in class',
      ti,
      say: (PHASE_LABEL[st.phase] || 'Work') + (target ? (resting ? '. Up next: ' : ': ') + target.name : '') +
        (set ? ', ' + set : ''),
    };
  }

  let renderedKind = '';
  function renderClassClock() {
    const plan = cls.plan || [];
    renderedKind = '';
    if (!plan.length) return '';

    if (!(prog.classStart || cls.t0 || prog.pausedAt)) {
      return '<div class="ath-card ath-clock ath-clock-idle">' +
        '<div class="ath-kicker">⏱️ Follow the room</div>' +
        '<div class="ath-count-label">Your instructor hasn\'t started the clock yet. ' +
          'Tap below the moment they do and your phone will stay in step.</div>' +
        '<button class="ath-big-btn start" id="ath-clock-start">▶ Start with the class</button>' +
      '</div>';
    }

    const pos = planPosition();
    if (!pos) return '';
    renderedKind = posKind(pos);

    if (pos.done) {
      return '<div class="ath-card ath-clock is-done" id="ath-clock-card">' +
        '<div class="ath-kicker">✅ Class complete</div>' +
        '<div class="ath-clock-time" id="ath-clock-time">Done</div>' +
        '<div class="ath-clock-now" id="ath-clock-now">Great work.</div>' +
        '<button class="ath-mini ath-resync" id="ath-resync-btn">⇄ Still going? Re-sync</button>' +
        (resyncOpen ? resyncList(pos) : '') +
      '</div>';
    }

    if (pos.pending) {
      const ti = targetIdx(0);
      return '<div class="ath-card ath-clock ath-clock-pending" id="ath-clock-card">' +
        '<div class="ath-clock-phase" id="ath-clock-phase">Class starts in</div>' +
        '<div class="ath-clock-time" id="ath-clock-time">' + mmss(pos.left) + '</div>' +
        '<div class="ath-clock-now" id="ath-clock-now">' + esc(ti >= 0 ? 'First: ' + plan[ti].name : '') + '</div>' +
      '</div>';
    }

    const f = clockFace(pos);
    return '<div class="ath-card ath-clock phase-' + pos.step.phase + (pos.paused ? ' is-paused' : '') +
        '" id="ath-clock-card">' +
      '<div class="ath-clock-phase" id="ath-clock-phase">' + esc(f.phase) + '</div>' +
      '<div class="ath-clock-time" id="ath-clock-time">' + f.time + '</div>' +
      '<div class="ath-clock-now" id="ath-clock-now">' + esc(f.now) + '</div>' +
      '<div class="ath-clock-round" id="ath-clock-round">' + esc(f.round) + '</div>' +
      '<div class="ath-clock-detail" id="ath-clock-detail">' + detailHtml(f.ti) + '</div>' +
      '<div class="ath-clock-next" id="ath-clock-next">' + esc(f.next) + '</div>' +
      '<div class="ath-clock-bar"><span id="ath-clock-fill" style="width:' + f.pct + '%"></span></div>' +
      '<div class="ath-clock-total" id="ath-clock-total">' + f.totalLeft + '</div>' +
      (pos.paused
        ? '<div class="ath-paused-note">Your instructor paused the class here.</div>' +
          '<button class="ath-big-btn start" id="ath-clock-resume">▶ The room has resumed</button>'
        : '') +
      '<button class="ath-mini ath-resync" id="ath-resync-btn" aria-expanded="' + resyncOpen + '">' +
        '⇄ Re-sync to the room</button>' +
      (resyncOpen ? resyncList(pos) : '') +
    '</div>';
  }

  // Tapping the move the room is on jumps this phone to the start of that
  // exact step — every round of a Tabata is its own button ("· 3/8"), and
  // rest is never offered because it has no move to recognise. Small
  // differences are then trimmed with the ± nudges, which change the time
  // left on this phone's clock.
  // Only steps near the current position are offered: a full class is 30-odd
  // moves, which is an unusable list on a phone, and the room is never more
  // than a few moves away from where this clock thinks it is.
  const RESYNC_BACK = 4, RESYNC_FWD = 5;

  function resyncOptions() {
    const plan = cls.plan || [];
    const opts = [];
    plan.forEach((s, i) => { if (s.name && isMovePhase(s.phase)) opts.push({ idx: i, name: s.name }); });
    for (let a = 0; a < opts.length;) {
      let b = a;
      while (b + 1 < opts.length && opts[b + 1].name === opts[a].name) b++;
      if (b > a) for (let k = a; k <= b; k++) opts[k].tag = (k - a + 1) + '/' + (b - a + 1);
      a = b + 1;
    }
    return opts;
  }

  function resyncList(pos) {
    const opts = resyncOptions();
    if (!opts.length) return '';
    let at = 0;
    opts.forEach((o, k) => { if (o.idx <= pos.idx) at = k; });
    const from = Math.max(0, at - RESYNC_BACK);
    const win = opts.slice(from, at + RESYNC_FWD + 1);
    const curIdx = pos.done ? -1 : pos.idx;
    return '<div class="ath-resync-panel">' +
      '<div class="ath-resync-hint">Tap the move the room is on — your clock jumps to its start.</div>' +
      '<div class="ath-resync-opts">' +
        win.map(o => '<button class="ath-resync-opt' + (o.idx === curIdx ? ' is-current' : '') +
          '" data-resync-idx="' + o.idx + '">' + esc(o.name) +
          (o.tag ? ' <span class="ath-resync-tag">· ' + o.tag + '</span>' : '') + '</button>').join('') +
      '</div>' +
      '<div class="ath-resync-hint">Room\u2019s timer a few seconds off? Adjust yours:</div>' +
      '<div class="ath-nudge-row">' +
        [-10, -3, 3, 10].map(n => '<button class="ath-nudge" data-nudge="' + n + '" aria-label="' +
          (n > 0 ? 'Add ' : 'Take off ') + Math.abs(n) + ' seconds">' +
          (n > 0 ? '+' : '\u2212') + Math.abs(n) + 's</button>').join('') +
      '</div>' +
      '<button class="ath-mini ath-resync-cancel" id="ath-resync-cancel">Done</button>' +
    '</div>';
  }

  function applyResync(idx) {
    const plan = cls.plan || [];
    const st = plan[idx];
    const e = planElapsed();
    if (!st || e === null) return;
    prog.syncOffset = (prog.syncOffset || 0) + (e - st.start);
    resyncOpen = false;
    persist(); render(); requestWake();
    if (navigator.vibrate) navigator.vibrate(30);
  }

  // +N puts N seconds back on this phone's timer; −N takes them off.
  function nudge(n) {
    const e = planElapsed();
    if (e === null) return;
    // Adding time moves this clock back; never past the start of the class,
    // or the phone would drop to the "Class starts in" card mid-class.
    const shift = n > 0 ? Math.min(n, Math.max(0, e)) : n;
    if (!shift) return;
    prog.syncOffset = (prog.syncOffset || 0) + shift;
    persist(); render(); requestWake();
  }

  // The room was paused when the link was made, and has now started again.
  function resumeFromPause() {
    const e = planElapsed();
    if (e === null) return;
    prog.classStart = Date.now() - e * 1000;
    prog.pausedAt = 0;
    prog.syncOffset = 0;
    persist(); render(); requestWake();
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
        '<div class="ath-head-btns">' +
          '<button class="ath-sound sound-toggle-btn" id="ath-sound" type="button" title="Audio cues" aria-label="Toggle audio cues">🔇</button>' +
          '<button class="ath-sound voice-toggle-btn" id="ath-voice" type="button" title="Spoken cues" aria-label="Toggle spoken cues">🗣️</button>' +
          '<button class="ath-reset" id="ath-reset" title="Clear my progress">Reset</button>' +
        '</div>' +
      '</div>' +
      ((typeof ihAudioNeedsUnlock === 'function' && ihAudioNeedsUnlock())
        ? '<button class="ath-unlock ih-unlock-chip" id="ath-unlock" type="button">🔈 Tap to enable sound</button>'
        : '') +
      renderClassClock() +
      main() +
      renderBurner() +
      renderBest() +
      '<div class="ath-foot">Private to  ' + esc(me.name) + ' on this phone · saved automatically</div>';
    bind();
    scheduleTick();
    if (classIsOver()) releaseWake();
  }

  function bind() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

    on('ath-sound', () => { if (typeof toggleSound === 'function') toggleSound(); });
    on('ath-voice', () => { if (typeof toggleVoice === 'function') toggleVoice(); });
    on('ath-unlock', () => { if (typeof ihAudioUnlock === 'function') ihAudioUnlock(); });
    if (typeof syncVoiceButtons === 'function') syncVoiceButtons();
    // Rendered fresh on every render(), so the icon has to be re-synced.
    if (typeof syncSoundButtons === 'function') syncSoundButtons();

    on('ath-start-btn', () => { prog.startedAt = Date.now(); persist(); requestWake(); render(); });
    on('ath-clock-start', () => { prog.classStart = Date.now(); prog.syncOffset = 0; prog.pausedAt = 0; persist(); requestWake(); render(); });
    on('ath-clock-resume', resumeFromPause);
    on('ath-resync-btn', () => { resyncOpen = !resyncOpen; render(); });
    on('ath-resync-cancel', () => { resyncOpen = false; render(); });
    document.querySelectorAll('[data-resync-idx]').forEach(b => b.addEventListener('click', () => {
      applyResync(parseInt(b.dataset.resyncIdx, 10));
    }));
    document.querySelectorAll('[data-nudge]').forEach(b => b.addEventListener('click', () => {
      nudge(parseInt(b.dataset.nudge, 10) || 0);
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
        // Progress only — where this phone sits on the room's clock stays.
        const keep = {};
        ['t0seen', 'pausedAt', 'classStart', 'syncOffset'].forEach(k => { if (prog[k]) keep[k] = prog[k]; });
        prog = keep; persist(); render();
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
    const pos = planPosition();
    if (!pos) return;
    // Starting, finishing or pausing changes the whole card, not just text.
    if (!timeEl || posKind(pos) !== renderedKind) {
      const was = renderedKind;
      // Coming out of the countdown is the start of class: announce it.
      lastClockIdx = was === 'pending' ? -3 : -1;
      render();
      if (pos.done && was === 'live') {
        if (typeof audioCue !== 'undefined' && audioCue.enabled) audioCue.finish();
        if (typeof ihSpeak === 'function') ihSpeak('Class complete. Great work.');
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      }
      return;
    }
    if (pos.done || pos.paused) return;
    if (pos.pending) { timeEl.textContent = mmss(pos.left); return; }

    const f = clockFace(pos);
    timeEl.textContent = f.time;
    const totalEl = document.getElementById('ath-clock-total');
    if (totalEl) totalEl.textContent = f.totalLeft;
    const fill = document.getElementById('ath-clock-fill');
    if (fill) fill.style.width = f.pct + '%';

    const plan = cls.plan || [];
    if (pos.idx !== lastClockIdx) {
      const first = lastClockIdx === -1;
      lastClockIdx = pos.idx;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('ath-clock-phase', f.phase);
      set('ath-clock-now', f.now);
      set('ath-clock-round', f.round);
      set('ath-clock-next', f.next);
      const det = document.getElementById('ath-clock-detail');
      if (det) det.innerHTML = detailHtml(f.ti);
      const card = document.getElementById('ath-clock-card');
      if (card) card.className = 'ath-card ath-clock phase-' + pos.step.phase;
      const live = document.getElementById('ath-live');
      if (live) live.textContent = f.say;
      // A page that has just opened lands mid-step: announce quietly.
      if (!first) {
        if (typeof ihHaptic === 'function') ihHaptic(pos.step.phase);
        else if (pos.step.phase === 'work' && navigator.vibrate) navigator.vibrate(40);
        if (typeof ihSpeakStep === 'function') ihSpeakStep(pos.step, plan[targetIdx(pos.idx + 1)] || plan[pos.idx + 1]);
        athCue(pos.step.phase);
      }
      lastBeepSec = -1;
    }
    const spoke = typeof ihVoiceTick === 'function' &&
      ihVoiceTick(pos.left, pos.step, plan[pos.idx + 1], pos.idx) === true;
    athCountdown(pos.left, spoke);
  }

  // Audio is opt-in on a phone, so all of this is silent unless the athlete
  // turned it on. audioCue lives in app.js, which loads here too.
  let lastBeepSec = -1;
  function athCue(phase) {
    if (typeof audioCue === 'undefined' || !audioCue.enabled) return;
    if (phase === 'work') audioCue.startWork();
    else if (phase === 'rest') audioCue.startRest();
  }
  function athCountdown(left, spoke) {
    if (typeof audioCue === 'undefined' || !audioCue.enabled) return;
    const s = Math.ceil(left);
    if (s === lastBeepSec) return;
    lastBeepSec = s;
    // The spoken "3, 2, 1" replaces the beep rather than talking over it.
    if (s > 0 && s <= 3 && !spoke) audioCue.countdown();
  }

  // Let the screen sleep once there is nothing left to follow.
  function releaseWake() {
    const wl = wakeLock;
    wakeLock = null;
    if (wl) { try { wl.release(); } catch (e) {} }
  }

  // Only the clock line ticks, so typing a rep count is never interrupted.
  function scheduleTick() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    const plan = cls.plan || [];
    const pos = plan.length ? planPosition() : null;
    const mirrors = !!pos && !pos.done && !pos.paused;
    if (!mirrors && (!SELF_PACED_MODES[cls.mode] || !prog.startedAt || remainingMs() === 0)) return;
    tickHandle = setInterval(() => {
      if (mirrors) { tickClassClock(); return; }
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
            if (typeof audioCue !== 'undefined' && audioCue.enabled) audioCue.finish();
            if (typeof ihSpeak === 'function') ihSpeak('Time');
          }
          clearInterval(tickHandle); tickHandle = null;
          releaseWake();
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
    rememberLastClass();

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById('athlete-screen');
    if (screen) screen.classList.add('active');
    document.body.classList.add('athlete-mode');

    // Phase and move changes are announced for screen readers. Lives outside
    // #athlete-root so re-renders never wipe it mid-announcement.
    if (!document.getElementById('ath-live')) {
      const live = document.createElement('div');
      live.id = 'ath-live';
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');
      document.body.appendChild(live);
    }

    // A link that already names its athlete goes straight to their page. A
    // fresh re-sync link from the instructor has no name in it, so the
    // phone falls back to whoever it last tracked for this class.
    const u = /[#&]u=([^&#]+)/.exec(location.hash || '');
    let uid = '';
    if (u) { try { uid = slugName(decodeURIComponent(u[1])) || decodeURIComponent(u[1]); } catch (e) { uid = u[1]; } }
    if (!uid) uid = uidForSid(cls.sid);
    if (uid) identify(uid); else renderGate(false);

    // Elapsed time is always recomputed from timestamps, so sleeping the
    // phone or backgrounding the tab cannot drift the clock.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && me) {
        lastClockIdx = -1;
        render();
        if (!classIsOver()) requestWake();
      }
    });
    return true;
  }

  // remote.js builds the instructor's own phone link from the same address
  // logic the athlete link uses.
  window.__ihPhoneBridge = { base: athleteBase, load: loadPhoneOrigin, start: classStartEpoch,
                             paused: classPausedAt, markShared: markLinkShared };

  // For tests/live.test.js: the codec and the clock maths, nothing stateful.
  window.__ihLiveTest = {
    encodePayload, decodePayload, packPlan, unpackPlan, classPayloadFromWorkout,
    liveTimer, classStartEpoch, classPausedAt,
    athlete(c, p) { cls = c; prog = p; occCache = null; },
    planPosition, resyncOptions, resyncList, clockFace,
  };

  window.__ATHLETE_MODE = /[#&]c=/.test(location.hash || '');
  document.addEventListener('DOMContentLoaded', boot);

  // Opening a class link in a tab that already has the app loaded only
  // changes the fragment, so DOMContentLoaded never fires again and the
  // instructor screens stay up. Reload so the athlete page boots properly.
  window.addEventListener('hashchange', () => {
    const m = /[#&]c=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
    if (!m) return;
    // Re-scanning a re-sync QR while the page is open swaps the payload.
    if (!document.body.classList.contains('athlete-mode') || m[1] !== rawPayload) location.reload();
  });
})();