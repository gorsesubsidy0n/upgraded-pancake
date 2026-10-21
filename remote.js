// ============================================================
//  INSPIRE HABITS — remote.js
//  Run the class from the instructor's own phone.
//
//  Going live builds a link that carries the whole class plan, and
//  hands it to the phone's share sheet (AirDrop on Apple devices).
//  Opening that link on the phone, signed in as the instructor,
//  loads the class on the normal instructor screen. One tap then
//  joins the room's clock wherever it has got to.
//
//  A web page cannot address AirDrop directly: the browser's share
//  sheet is the only door, and it lists AirDrop on Safari and
//  iPhone/iPad/Mac. Share sheets only exist on https, so on a plain
//  http address the same link is offered to copy instead.
//
//  The link is a fragment (#i=...), which browsers never send to the
//  host, and it holds the class plan only — no roster, no injury
//  flags, no athlete names.
// ============================================================
(function () {
  'use strict';

  const OPT_KEY = 'hiit_phone_handoff_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Compact codec ────────────────────────────────────────────────────
  // A class plan is ~9 KB of JSON, which makes an awkward link. LZW with a
  // growing code width brings it to roughly a third, and — unlike the
  // browser's CompressionStream — it runs synchronously, so the share sheet
  // can still be opened inside the tap that asked for it (Safari refuses
  // otherwise). The code width is derived from how many codes have been
  // written, so the two sides never have to agree on anything else.
  const widthFor = j => Math.max(9, (255 + j).toString(2).length);

  function toBytes(str) {
    const bin = unescape(encodeURIComponent(str));
    const out = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function fromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
    return decodeURIComponent(escape(bin));
  }

  function lzPack(str) {
    const bytes = toBytes(str);
    if (!bytes.length) return '';
    const dict = new Map();
    const out = [];
    let acc = 0, bits = 0, next = 256, j = 0;
    const put = code => {
      acc |= code << bits; bits += widthFor(j++);
      while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; }
    };
    let cur = bytes[0];
    for (let i = 1; i < bytes.length; i++) {
      const key = cur * 256 + bytes[i];
      const hit = dict.get(key);
      if (hit !== undefined) { cur = hit; continue; }
      put(cur);
      dict.set(key, next++);
      cur = bytes[i];
    }
    put(cur);
    if (bits > 0) out.push(acc & 255);
    return b64urlFromBytes(out);
  }

  function lzUnpack(text) {
    const data = b64urlToBytes(text);
    if (!data.length) return '';
    const dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    let acc = 0, bits = 0, pos = 0, j = 0, prev = null;
    const out = [];
    for (;;) {
      const w = widthFor(j);
      while (bits < w && pos < data.length) { acc |= data[pos++] << bits; bits += 8; }
      if (bits < w) break;
      const code = acc & ((1 << w) - 1);
      acc >>>= w; bits -= w; j++;
      let entry;
      if (code < dict.length) entry = dict[code];
      else if (code === dict.length && prev) entry = prev.concat(prev[0]);
      else throw new Error('bad class link');
      if (prev) dict.push(prev.concat(entry[0]));
      for (let k = 0; k < entry.length; k++) out.push(entry[k]);
      // A crafted link can expand quadratically; a real class is ~10 KB.
      if (out.length > 2000000) throw new Error('class link too large');
      prev = entry;
    }
    return fromBytes(out);
  }

  function b64urlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  window.ihLzPack = lzPack;
  window.ihLzUnpack = lzUnpack;

  // ── Building the link ────────────────────────────────────────────────
  const bridge = () => window.__ihPhoneBridge || null;
  const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t); };

  // Mixed-ability group names are people's names, so they stay behind.
  function maForLink() {
    try {
      if (typeof MA === 'undefined' || !MA.enabled) return null;
      return { enabled: true, groups: (MA.groups || []).map(g => Object.assign({}, g, { names: '' })) };
    } catch (e) { return null; }
  }

  function buildPhoneLink() {
    const b = bridge();
    const w = (typeof state !== 'undefined' && state) ? state.workout : null;
    if (!b || !w) return null;
    // Coverage is rebuilt from the plan whenever it is shown, so it only
    // adds weight here.
    const lean = Object.assign({}, w);
    delete lean.coverage;
    delete lean.recentClasses;
    const packed = lzPack(JSON.stringify({ v: 1, w: lean, muscle: state.muscle, ma: maForLink() }));
    const base = b.base();
    // Only a timer that belongs to this class counts (see liveTimer in
    // participant.js). A paused class sends where it stopped instead of a
    // start time, which would otherwise run on without the room.
    const paused = typeof b.paused === 'function' ? b.paused() : 0;
    const t0 = paused ? 0 : b.start();
    const url = base.url ? base.url + '#i=' + packed +
      (paused ? '&p=' + paused : (t0 ? '&t=' + t0 : '')) : '';
    return {
      url, base, live: !!t0, paused,
      reachable: !!url && base.kind !== 'loopback' && base.kind !== 'file',
      title: (w.styleCfg && w.styleCfg.name ? w.styleCfg.name : w.style) + ' · ' + (w.duration || '') + ' min',
    };
  }

  // ── Sending it ───────────────────────────────────────────────────────
  const handoffOn = () => {
    try { return IHStore.get(OPT_KEY) !== '0'; } catch (e) { return true; }
  };
  window.setPhoneHandoff = function (on) {
    try { IHStore.set(OPT_KEY, on ? '1' : '0'); } catch (e) {}
    toast(on ? '📲 Go Live will send the class to your phone' : 'Phone hand-off turned off');
  };

  // Called by goLive(), inside the tap, so the share sheet is allowed to open.
  window.ihPhoneHandoff = function () {
    if (window.__ATHLETE_MODE) return;
    // Athletes sent the link before Go Live have no start time to follow.
    try {
      if (typeof window.ihLinkWasShared === 'function' && window.ihLinkWasShared() &&
          typeof offerResyncLink === 'function') {
        setTimeout(() => offerResyncLink('The class is live. Phones that got the link before you ' +
          'started need the live link to follow the room clock.'), 1200);
      }
    } catch (e) {}
    if (!handoffOn()) return;
    try { sendToPhone(true); } catch (e) { /* the class must start regardless */ }
  };
  window.ihSendToPhone = function () {
    window.ihCloseBar && ihCloseBar('ih-phone-bar');
    sendToPhone(false);
  };

  function sendToPhone(auto) {
    const link = buildPhoneLink();
    if (!link) return;
    window.__ihPhoneLinkSent = true;
    if (link.reachable && typeof navigator.share === 'function') {
      navigator.share({
        title: 'Run my class from my phone',
        text: 'Inspire Habits — ' + link.title + '. Open this on your phone to run the class from there.',
        url: link.url,
      }).catch(err => {
        // Closing the sheet is a decision, not a failure.
        if (err && err.name === 'AbortError') return;
        showPanel(link);
      });
      return;
    }
    // Going live must never be covered by a dialog, so an automatic send
    // that cannot use the share sheet leaves a dismissible bar instead.
    if (auto && typeof ihBar === 'function') {
      ihBar('ih-phone-bar',
        '<span class="resume-icon">📲</span>' +
        '<span class="resume-text">Run this class from your phone?</span>' +
        '<button class="resume-btn" type="button" data-onclick="ihSendToPhone()">Send to phone</button>' +
        '<button class="resume-btn ghost" type="button" data-onclick="ihCloseBar(\'ih-phone-bar\')">Not now</button>',
        15000);
      return;
    }
    showPanel(link);
  }

  function showPanel(link) {
    const modal = document.getElementById('qr-modal');
    const body = document.getElementById('qr-modal-body');
    if (!modal || !body) return;
    const canShare = typeof navigator.share === 'function';
    let inner;
    if (!link.reachable) {
      inner =
        '<div class="qr-error"><b>' + (link.base.kind === 'file' ? 'This page is open from a file' : 'localhost') +
        '</b> is not an address your phone can open.<br>Start the app with <code>node serve.js</code> and ' +
        'open the wifi address it prints, or set up a published copy under 🔗 Share Link.</div>';
    } else {
      inner =
        '<div class="qr-link-box">' +
          '<div class="qr-link-label">Your instructor link</div>' +
          '<div class="qr-url" id="phone-url">' + esc(link.url) + '</div>' +
          (canShare ? '<button class="qr-btn primary qr-copy-big" type="button" data-onclick="ihSendToPhone()">📲 AirDrop / Share to my phone</button>' : '') +
          '<button class="qr-btn qr-copy-big" type="button" data-onclick="ihCopyPhoneLink()">📋 Copy link</button>' +
          '<div class="qr-link-hint">' +
            (canShare ? '' : 'AirDrop and the share sheet need an <b>https</b> address, so copy this and send it to ' +
              'yourself (Messages, Notes, email).<br>') +
            'Open it on your phone and sign in with your instructor code — only the first time. ' +
            'Then tap <b>Join the class clock</b> and the phone picks up exactly where the room is.' +
            (link.base.kind === 'lan' ? '<br><b>Your phone must be on the same wifi</b> as this computer, ' +
              'unless you set up a published copy under 🔗 Share Link.' : '') +
          '</div>' +
        '</div>';
    }
    body.innerHTML =
      '<div class="qr-head"><div class="qr-title">📲 Run the class from your phone</div>' +
      '<div class="qr-sub">' + esc(link.title) + '</div></div>' + inner +
      (link.paused && link.reachable ? '<div class="qr-link-hint qr-warn-line">⏸ The class is paused, so the ' +
        'phone opens at this exact point and waits for you to press ▶.</div>' : '') +
      '<div class="qr-hint">The link holds the class plan only — no roster, flags or names. ' +
        'Send it again after a long pause to re-align the phone.</div>';
    modal.style.display = 'flex';
  }

  window.ihCopyPhoneLink = function () {
    const el = document.getElementById('phone-url');
    if (!el) return;
    const text = el.textContent;
    const ok = () => toast('🔗 Link copied');
    const legacy = () => {
      try {
        const r = document.createRange(); r.selectNodeContents(el);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        if (document.execCommand('copy')) ok(); else toast('Press Ctrl-C to copy the link');
      } catch (e) { toast('Press Ctrl-C to copy the link'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, legacy);
    else legacy();
  };

  // ── Receiving it (on the phone) ──────────────────────────────────────
  const HASH_RE = /[#&]i=([^&]+)/;
  const START_RE = /[#&]t=(\d+)/;
  const PAUSE_RE = /[#&]p=(\d+)/;
  let joinT0 = 0;

  // The link is attacker-controllable — anyone can send an instructor a
  // crafted #i= — and app.js paints parts of the workout with innerHTML.
  // So the decoded class is rebuilt from plain data only: no markup
  // characters in any string, numbers forced to numbers within sane
  // limits, and only the expected shapes for the lists the timer walks.
  const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const NUM_CLAMP = {
    duration: [0, 3600], work: [0, 600], rest: [0, 600], cWork: [0, 600], cRest: [0, 600],
    roundRest: [0, 600], participants: [0, 500], mainDur: [0, 180], cReps: [0, 500],
    ygigWorkSec: [5, 600], seconds: [0, 3600], warmupDuration: [0, 60], stationCount: [0, 60],
  };
  const COUNT_KEYS = { rounds: 1 };
  const LIST_KEYS = { exercises: 1, warmup: 1, cooldown: 1 };
  const ID_KEYS = { style: 1, muscle: 1 };
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  // Custom focus keys look like "custom:chest,glutes".
  const MUSCLE_RE = /^[A-Za-z0-9_-]{1,40}(:[A-Za-z0-9_,-]{0,300})?$/;

  const cleanStr = s => String(s).slice(0, 300).replace(/[<>"`\\]/g, '').replace(/'/g, '\u2019');
  const clampNum = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
  };

  function scrub(v, depth, key) {
    if (key && NUM_CLAMP[key] && v != null && typeof v !== 'object') {
      return clampNum(v, NUM_CLAMP[key][0], NUM_CLAMP[key][1]);
    }
    if (key && COUNT_KEYS[key] && v != null && typeof v !== 'object') {
      const n = Math.round(clampNum(v, 0, 50));
      return n > 0 ? n : 0;
    }
    if (key === 'reps' && v != null && typeof v !== 'object') {
      return typeof v === 'number' ? clampNum(v, 0, 1000) : cleanStr(v).slice(0, 30);
    }
    if (key === 'rungs') {
      return Array.isArray(v)
        ? v.slice(0, 50).map(n => Math.round(clampNum(n, 1, 999))) : [];
    }
    if (key && ID_KEYS[key]) {
      return (typeof v === 'string' && (key === 'muscle' ? MUSCLE_RE : ID_RE).test(v)) ? v : '';
    }
    if (key && LIST_KEYS[key]) {
      if (!Array.isArray(v)) return [];
      return v.slice(0, 200)
        .filter(x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.name === 'string')
        .map(x => scrub(x, depth + 1));
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') return cleanStr(v);
    if (depth > 8 || typeof v !== 'object') return null;
    if (Array.isArray(v)) return v.slice(0, 200).map(x => scrub(x, depth + 1));
    const out = {};
    Object.keys(v).slice(0, 200).forEach(k => {
      if (!KEY_RE.test(k) || BAD_KEYS.has(k)) return;
      out[k] = scrub(v[k], depth + 1, k);
    });
    return out;
  }

  function sanitizeLink(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const w = scrub(data.w, 0);
    if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
    if (!Array.isArray(w.exercises) || !w.exercises.length) return null;
    if (!w.styleCfg || typeof w.styleCfg !== 'object' || Array.isArray(w.styleCfg)) return null;
    w.styleCfg.name = String(w.styleCfg.name || w.style || 'Class');
    w.styleCfg.icon = String(w.styleCfg.icon || '');
    if (!w.style) return null;
    const muscle = (typeof data.muscle === 'string' && MUSCLE_RE.test(data.muscle)) ? data.muscle : '';
    const ma = (data.ma && typeof data.ma === 'object') ? scrub(data.ma, 0) : null;
    if (ma) {
      ma.groups = Array.isArray(ma.groups) ? ma.groups.filter(g => g && typeof g === 'object' && !Array.isArray(g)) : [];
      // Group names are people's names; they never travel, whatever the link says.
      ma.groups.forEach(g => { g.names = ''; });
      delete ma.assignments;
    }
    return { w, muscle, ma };
  }
  window.ihSanitizePhoneLink = sanitizeLink;

  // Where in the sequence a given number of elapsed seconds falls.
  function seekTo(seq, elapsed) {
    let acc = 0;
    for (let i = 0; i < seq.length; i++) {
      const d = Math.round(seq[i].duration || 0);
      if (elapsed < acc + d) return { idx: i, left: acc + d - elapsed };
      acc += d;
    }
    return null;
  }
  window.ihSeekTo = seekTo;

  // Marks the timer as belonging to the class just loaded (see liveTimer in
  // participant.js), in case app.js has not already done so.
  function stampTimer() {
    try {
      if (state.timer && state.timer.sequence && state.timer.sequence.length) state.timer.workoutRef = state.workout;
    } catch (e) {}
  }

  function importLink() {
    const m = HASH_RE.exec(location.hash || '');
    if (!m) return;
    if (typeof ihRole !== 'function' || ihRole() !== 'instructor') return;
    let data;
    try { data = sanitizeLink(JSON.parse(lzUnpack(m[1]))); } catch (e) { data = null; }
    if (!data) {
      toast('That class link looks damaged. Send it again from the computer.', 'error');
      return;
    }
    const t = START_RE.exec(location.hash || '');
    const p = PAUSE_RE.exec(location.hash || '');
    joinT0 = t ? parseInt(t[1], 10) || 0 : 0;
    const pausedAt = p ? Math.min(86400, parseInt(p[1], 10) || 0) : 0;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}

    document.querySelectorAll('.resume-bar').forEach(b => b.remove());
    if (typeof clearLiveSession === 'function') clearLiveSession();
    state.style = data.w.style || state.style;
    state.participants = data.w.participants || state.participants;
    resumeLiveSession({
      workout: data.w, muscle: data.muscle || undefined, viewMode: 'instructor',
      current: 0, seconds: 0, ma: data.ma || null,
    }, { silent: true });
    stampTimer();

    if (pausedAt) {
      // The room is paused: park the phone on the same second and wait.
      const seq = state.timer && state.timer.sequence;
      const r = seq && seq.length ? seekTo(seq, pausedAt) : null;
      if (r) {
        state.timer.current = r.idx;
        state.timer._silentLoad = true;
        loadTimerStep(r.idx);
        state.timer.seconds = Math.max(1, Math.ceil(r.left));
        state.timer._started = true;
        if (typeof updateTimerDisplay === 'function') updateTimerDisplay();
        stampTimer();
      }
      const at = Math.floor(pausedAt / 60) + ':' + String(pausedAt % 60).padStart(2, '0');
      if (typeof ihBar === 'function') {
        ihBar('ih-join-bar',
          '<span class="resume-icon">⏸</span>' +
          '<span class="resume-text">Class paused at ' + esc(at) + ' — press ▶ when the room resumes.</span>' +
          '<button class="resume-btn ghost" type="button" data-onclick="ihCloseBar(\'ih-join-bar\')">OK</button>');
      } else {
        toast('📲 Class loaded, paused at ' + at + '. Press ▶ when the room resumes.');
      }
      return;
    }

    const when = joinT0 ? 'The class is running — tap to join the room clock.' : 'Tap play when the class starts.';
    if (typeof ihBar === 'function' && joinT0) {
      ihBar('ih-join-bar',
        '<span class="resume-icon">📲</span>' +
        '<span class="resume-text">' + when + '</span>' +
        '<button class="resume-btn" type="button" data-onclick="ihJoinClassClock()">▶ Join the class clock</button>');
    } else {
      toast('📲 Class loaded. ' + when);
    }
  }

  // Recomputed at the tap, not at load, so the time spent signing in or
  // finding the button is already accounted for.
  window.ihJoinClassClock = function () {
    const seq = state.timer && state.timer.sequence;
    if (!seq || !seq.length || !joinT0) return;
    const r = seekTo(seq, Math.max(0, (Date.now() - joinT0) / 1000));
    if (!r) {
      window.ihCloseBar && ihCloseBar('ih-join-bar');
      toast('That class has already finished. Send a fresh link from the computer.', 'error');
      return;
    }
    if (state.timer.isRunning) toggleTimer();
    state.timer.current = r.idx;
    state.timer._silentLoad = true;
    loadTimerStep(r.idx);
    state.timer.seconds = Math.max(1, Math.ceil(r.left));
    toggleTimer();
    // toggleTimer rounds up to a whole second; the exact remainder keeps the
    // phone on the room's clock to the tick.
    state.timer.deadline = Date.now() + r.left * 1000;
    stampTimer();
    window.ihCloseBar && ihCloseBar('ih-join-bar');
    toast('▶ Joined the class clock');
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.__ATHLETE_MODE) return;
    const chk = document.getElementById('phone-handoff-chk');
    if (chk) chk.checked = handoffOn();
    const b = bridge();
    if (b) b.load(() => {});          // learn the wifi address before it is needed
    if (HASH_RE.test(location.hash || '')) {
      if (typeof ihWhenUnlocked === 'function') ihWhenUnlocked(importLink); else importLink();
    }
  });

  // A second link opened in a tab that is already loaded.
  window.addEventListener('hashchange', () => {
    if (HASH_RE.test(location.hash || '')) location.reload();
  });
})();
