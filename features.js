// ============================================================
//  INSPIRE HABITS — features.js
//  Live-class extras that sit on top of the timer and roster:
//  spoken cues, haptics, TV mode, live swap, injury flags,
//  end-of-class summary, trends, printable card, backup safety
//  nets and accessibility helpers.
//
//  Loaded after every other app script and before boot.js.
//  Everything here is optional: if a hook is missing the app
//  behaves exactly as before.
// ============================================================

// ─── Small shared helpers ────────────────────────────────────
function ihEl(id) { return document.getElementById(id); }
function ihEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function ihToast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); }

/** A bottom bar like the "resume class" one. Same id replaces itself.
 *  Several bars at once stack upwards instead of covering each other. */
function ihBar(id, html, ttlMs) {
  const old = ihEl(id);
  if (old) old.remove();
  const bar = document.createElement('div');
  bar.className = 'resume-bar';
  bar.id = id;
  bar.setAttribute('role', 'status');
  bar.innerHTML = html;
  document.body.appendChild(bar);
  ihRestackBars();
  if (ttlMs) setTimeout(() => { if (bar.parentNode) { bar.remove(); ihRestackBars(); } }, ttlMs);
  return bar;
}
function ihCloseBar(id) { const b = ihEl(id); if (b) b.remove(); ihRestackBars(); }
function ihRestackBars() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  const bars = Array.from(document.querySelectorAll('.resume-bar'));
  const base = (typeof window !== 'undefined' && window.innerWidth <= 560) ? 12 : 20;
  let y = base;
  bars.forEach(b => {
    b.style.bottom = y + 'px';
    y += (b.offsetHeight || 56) + 8;
  });
}
if (typeof document !== 'undefined' && document.addEventListener) {
  // app.js removes its own bars directly; restack whenever a button in one is used.
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('.resume-bar')) setTimeout(ihRestackBars, 0);
  });
}

function ihWhenUnlocked(fn) {
  const de = document.documentElement;
  if (!de.classList.contains('ih-locked')) { fn(); return; }
  const mo = new MutationObserver(() => {
    if (!de.classList.contains('ih-locked')) { mo.disconnect(); fn(); }
  });
  mo.observe(de, { attributes: true, attributeFilter: ['class'] });
}

// ─── Spoken cues ─────────────────────────────────────────────
// Off by default. The instructor's laptop and a athlete's phone keep
// separate switches, as sound does, so one never overrides the other.
function ihVoiceKey() {
  return (typeof soundIsAthlete === 'function' && soundIsAthlete()) ? 'hiit_voice_athlete' : 'hiit_voice';
}
function ihVoiceSupported() { return typeof window !== 'undefined' && 'speechSynthesis' in window; }
function ihVoiceEnabled() { return ihVoiceSupported() && IHStore.get(ihVoiceKey()) === 'on'; }

function ihSpeak(text) {
  if (!ihVoiceEnabled() || !text) return;
  try {
    const synth = window.speechSynthesis;
    // iOS Safari can swallow an utterance queued right after cancel(), so
    // only cancel when something is actually being said.
    if (synth.speaking || synth.pending) synth.cancel();
    if (synth.paused) synth.resume();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 1.05;
    u.lang = document.documentElement.lang || 'en-US';
    synth.speak(u);
  } catch (e) { /* speech is a nicety */ }
}

function ihSpeakStep(step, next) {
  if (!step || !ihVoiceEnabled()) return;
  const nm = step.name || '';
  if (step.phase === 'work') ihSpeak(nm ? 'Go. ' + nm : 'Go');
  else if (step.phase === 'rest') ihSpeak(next && next.name ? 'Rest. Next, ' + next.name : 'Rest');
  else if (step.phase === 'warmup' || step.phase === 'cooldown') ihSpeak(nm || step.label || '');
  else ihSpeak(step.label || 'Get ready');
}

function toggleVoice() {
  if (!ihVoiceSupported()) { ihToast('This browser has no speech voices', 'error'); return; }
  const on = !ihVoiceEnabled();
  IHStore.set(ihVoiceKey(), on ? 'on' : 'off');
  syncVoiceButtons();
  if (on) ihSpeak('Spoken cues on');
  else { try { window.speechSynthesis.cancel(); } catch (e) {} }
  ihToast(on ? '🗣️ Spoken cues on' : '🤐 Spoken cues off');
}

function syncVoiceButtons() {
  const on = ihVoiceEnabled();
  document.querySelectorAll('.voice-toggle-btn').forEach(b => {
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('is-muted', !on);
    b.title = on ? 'Spoken cues on — tap to turn off' : 'Spoken cues off — tap to turn on';
  });
}

// ─── Haptics ─────────────────────────────────────────────────
// Different shapes so a pocketed phone says what changed without a glance.
function ihHaptic(phase) {
  if (!navigator.vibrate) return;
  const pattern = phase === 'work' ? [70, 40, 70]
    : phase === 'rest' ? [220]
    : phase === 'cooldown' || phase === 'warmup' ? [90]
    : null;
  if (pattern) navigator.vibrate(pattern);
}

// ─── Step hook (called by app.js loadTimerStep) ──────────────
function ihOnStep(step, next, idx, quiet) {
  if (!step) return;
  const live = ihEl('ih-live');
  if (live && !quiet) {
    const bits = [step.label || step.phase || '', step.name || ''].filter(Boolean);
    live.textContent = bits.join(': ');
  }
  if (!quiet) ihSpeakStep(step, next);
  ihRefreshFlagStrip(step, next);
}

// ─── Per-second voice cues ───────────────────────────────────
// "3, 2, 1" in the last seconds before work starts, and "Halfway" on a long
// work interval. Called once per whole second by whichever clock is
// running (the athlete phone, and app.js timerTick when it calls ihOnTick).
// Returns true when it spoke, so the caller can skip its countdown beep
// rather than beep over the voice.
let _ihVoiceLast = '';
function ihVoiceTick(left, step, next, idx) {
  if (!step || !ihVoiceEnabled()) return false;
  const sec = Math.ceil(Number(left) || 0);
  const dur = Math.round(Number(step.duration) || 0);
  let say = '';
  if (step.phase !== 'work' && next && next.phase === 'work' && dur >= 5 && sec >= 1 && sec <= 3) {
    say = String(sec);
  } else if (step.phase === 'work' && dur >= 30 && sec === Math.floor(dur / 2)) {
    say = 'Halfway';
  }
  if (!say) return false;
  const key = idx + ':' + sec;
  if (key === _ihVoiceLast) return true;
  _ihVoiceLast = key;
  ihSpeak(say);
  return true;
}
const ihOnTick = ihVoiceTick;

// ─── Unlocking sound after a reload ──────────────────────────
// iOS and Android keep WebAudio suspended, and speech silent, until a
// user gesture on *this* page load. Sound being "on" from a previous visit
// is not enough, so the first tap anywhere quietly unlocks both. A touch
// pointerdown does not count as activation on iOS, hence click / touchend.
let _ihAudioUnlocked = false;
function ihAudioWanted() {
  let snd = false;
  try { snd = typeof audioCue !== 'undefined' && !!audioCue.enabled; } catch (e) {}
  return snd || ihVoiceEnabled();
}
function ihAudioNeedsUnlock() {
  if (_ihAudioUnlocked || !ihAudioWanted()) return false;
  try {
    if (typeof audioCue !== 'undefined' && audioCue.ctx && audioCue.ctx.state === 'running' && !ihVoiceEnabled()) return false;
  } catch (e) {}
  return true;
}
function ihAudioUnlock() {
  _ihAudioUnlocked = true;
  try { if (typeof audioCue !== 'undefined' && audioCue.enabled) audioCue.ensure(); } catch (e) {}
  try {
    if (ihVoiceEnabled()) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch (e) {}
  document.querySelectorAll('.ih-unlock-chip').forEach(el => el.remove());
  ihRemoveUnlockListeners();
}
const _ihUnlockEvents = ['click', 'touchend', 'keydown'];
function _ihUnlockHandler() { if (ihAudioWanted()) ihAudioUnlock(); }
function ihRemoveUnlockListeners() {
  _ihUnlockEvents.forEach(ev => document.removeEventListener(ev, _ihUnlockHandler, true));
}
function ihInstallUnlockListeners() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  _ihUnlockEvents.forEach(ev => document.addEventListener(ev, _ihUnlockHandler, true));
}
ihInstallUnlockListeners();
if (typeof document !== 'undefined' && document.addEventListener) {
  // A phone that was locked can come back with its audio context suspended.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    let running = true;
    try { running = !(typeof audioCue !== 'undefined' && audioCue.ctx && audioCue.ctx.state !== 'running'); } catch (e) {}
    if (!running) { _ihAudioUnlocked = false; ihInstallUnlockListeners(); }
  });
}

// ─── Re-sync prompt after the instructor pauses ──────────────
// Athletes' phones follow a start time baked into their link, so a pause,
// skip or swap on the laptop leaves them behind until they get a new one.
function offerResyncLink(msg) {
  const athletes = !!(window.__ihLinkShared || (typeof window.ihLinkWasShared === 'function' && window.ihLinkWasShared()));
  const phone = !!window.__ihPhoneLinkSent;
  if (!athletes && !phone) return;
  ihBar('ih-resync-bar',
    '<span class="resume-icon">📲</span>' +
    '<span class="resume-text">' + ihEsc(msg || 'You paused or skipped. Phones that joined earlier are now ' +
    'out of step — send a fresh link and they re-align when it opens.') + '</span>' +
    (athletes
      ? '<button class="resume-btn" type="button" data-onclick="ihCloseBar(\'ih-resync-bar\');ihCopyFreshClassLink()">📋 Copy fresh link</button>' +
        '<button class="resume-btn ghost" type="button" data-onclick="ihCloseBar(\'ih-resync-bar\');showClassQR()">Show link</button>'
      : '') +
    (phone
      ? '<button class="resume-btn ghost" type="button" data-onclick="ihCloseBar(\'ih-resync-bar\');ihSendToPhone()">Re-send to my phone</button>'
      : '') +
    '<button class="resume-btn ghost" type="button" data-onclick="ihCloseBar(\'ih-resync-bar\')">Dismiss</button>',
    30000);
}

// ─── TV mode ─────────────────────────────────────────────────
function ihTvAvailable() {
  return !!document.querySelector('#timer-screen.active, #participant-screen.active');
}

function toggleTvMode() {
  const body = document.body;
  const on = !body.classList.contains('tv-mode');
  if (on && !ihTvAvailable()) { ihToast('Start a class first, then use TV mode'); return; }
  body.classList.toggle('tv-mode', on);
  let exit = ihEl('ih-tv-exit');
  if (on) {
    if (!exit) {
      exit = document.createElement('button');
      exit.id = 'ih-tv-exit';
      exit.type = 'button';
      exit.className = 'ih-tv-exit';
      exit.textContent = '✕ Exit TV mode';
      exit.setAttribute('data-onclick', 'toggleTvMode()');
      body.appendChild(exit);
    }
    try {
      const de = document.documentElement;
      if (de.requestFullscreen) de.requestFullscreen().catch(() => {});
    } catch (e) {}
  } else {
    if (exit) exit.remove();
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('tv-mode')) toggleTvMode();
});

// ─── Injuries and limitations ────────────────────────────────
// A tag on a roster person is matched against the move on screen. The match
// is a keyword heuristic over the exercise name: it nudges the instructor to
// offer a regression, it never decides anything on its own.
const IHFlags = (function () {
  // \b keeps "hop" out of "chop" and "bound" out of "rebound". Plain "box",
  // "jack", "tuck" and "slam" are left out of impact: box squats, kettlebell
  // jacks, tuck crunches and ball slams are low impact (jumping jacks and
  // tuck jumps are still caught by "jump").
  const DEFS = {
    knee:     { label: 'Knee',      re: /lunge|squat|jump|burpee|step-?up|box (jump|step)|skater|plyo|split|pistol|\bbound|\bhop|thruster|high knee/i },
    shoulder: { label: 'Shoulder',  re: /press|push-?up|plank|pike|overhead|thruster|dip|snatch|swing|burpee|renegade|slam|pull-?up|fly|raise|crawl/i },
    back:     { label: 'Low back',  re: /deadlift|good ?morning|swing|bent|row|superman|v-?up|sit-?up|russian|burpee|thruster|slam|twist|hyperextension|windmill/i },
    wrist:    { label: 'Wrist',     re: /push-?up|plank|mountain|bear|crawl|burpee|renegade|dip|pike|walkout|inchworm|handstand/i },
    impact:   { label: 'Low impact', re: /jump|burpee|\bhop|\bbound|plyo|skater|high knee|plank jack|seal jack|\bsprint|butt kick/i },
    pregnancy:{ label: 'Pregnant / postnatal', re: /crunch|sit-?up|v-?up|russian|lying|supine|prone|jump|burpee|plank|twist|bicycle|leg raise|hollow|toe touch|slam/i },
  };
  let openFor = null;

  function findExercise(name) {
    const w = (typeof state !== 'undefined') ? state.workout : null;
    if (!w) return null;
    const lists = [w.exercises, w.coreBurner && w.coreBurner.exercises, w.warmup, w.cooldown];
    for (const l of lists) {
      if (!Array.isArray(l)) continue;
      const hit = l.find(e => e && e.name === name);
      if (hit) return hit;
    }
    return null;
  }

  function matches(flag, name) {
    if (flag === 'impact' && typeof exIsHighImpact === 'function') {
      try {
        const r = exIsHighImpact(findExercise(name) || { name: name });
        if (typeof r === 'boolean') return r;
      } catch (e) {}
    }
    return DEFS[flag].re.test(name);
  }

  function conflicts(person, exName) {
    const name = String(exName || '');
    return (person.flags || []).filter(f => DEFS[f] && matches(f, name));
  }

  function editorHtml(p) {
    if (openFor !== p.id) return '';
    const flags = p.flags || [];
    const boxes = Object.keys(DEFS).map(k =>
      '<label class="flag-opt"><input type="checkbox"' + (flags.includes(k) ? ' checked' : '') +
      ' data-onchange="' + ihEsc('setPersonFlag(' + JSON.stringify(String(p.id)) + ',' + JSON.stringify(k) + ',this.checked)') + '"/> ' + ihEsc(DEFS[k].label) + '</label>'
    ).join('');
    return '<div class="roster-flag-editor">' +
      '<div class="flag-hint">Flagged moves show on the instructor screen for anyone checked in. ' +
      'Kept on this device only.</div>' +
      '<div class="flag-opts">' + boxes + '</div></div>';
  }

  return {
    DEFS: DEFS, conflicts: conflicts, editorHtml: editorHtml,
    toggle: function (id) { openFor = openFor === id ? null : id; },
  };
})();

function toggleFlagEditor(id) {
  IHFlags.toggle(id);
  if (typeof renderMixedAbilityPanel === 'function') renderMixedAbilityPanel();
}

function setPersonFlag(id, flag, on) {
  const p = Roster.get(id);
  if (!p || !IHFlags.DEFS[flag]) return;
  const set = new Set(p.flags || []);
  if (on) set.add(flag); else set.delete(flag);
  p.flags = Array.from(set);
  Roster.save();
  if (typeof renderMixedAbilityPanel === 'function') renderMixedAbilityPanel();
}

/** What to show for a flagged person on a given move. */
function ihRegressionFor(exName) {
  const w = (typeof state !== 'undefined') ? state.workout : null;
  const ex = w && (w.exercises || []).find(e => e.name === exName);
  return ex && ex.easier ? ex.easier : '';
}

function ihRefreshFlagStrip(step, next) {
  const strip = ihEl('ih-flag-strip');
  if (!strip) return;
  strip.style.display = 'none';
  strip.innerHTML = '';
  if (typeof Roster === 'undefined' || !step) return;
  // During rest the useful warning is about the move that is coming.
  const target = step.phase === 'work' ? step : (next && next.phase === 'work' ? next : null);
  if (!target || !target.name) return;
  const chips = [];
  Roster.present().forEach(p => {
    const hit = IHFlags.conflicts(p, target.name);
    if (!hit.length) return;
    const alt = ihRegressionFor(target.name);
    chips.push('<span class="ih-flag-chip">⚠️ <b>' + ihEsc(p.name) + '</b> · ' +
      hit.map(f => ihEsc(IHFlags.DEFS[f].label)).join(', ') +
      (alt ? ' → ' + ihEsc(alt) : '') + '</span>');
  });
  if (!chips.length) return;
  strip.innerHTML = '<span class="ih-flag-label">' + (step.phase === 'work' ? 'Offer a regression:' : 'Coming up — heads up:') + '</span>' + chips.join('');
  strip.style.display = 'flex';
}

// ─── Live swap ───────────────────────────────────────────────
function swapLive(i) {
  const w = state.workout, t = state.timer;
  if (!w || !w.exercises[i]) return;
  const before = w.exercises[i].name;
  swapExercise(i, { silent: true });
  const after = w.exercises[i].name;
  if (after === before) { ihToast('No alternative move available'); return; }

  const seq = buildTimerSequence();
  const secs = t.seconds, deadline = t.deadline, lastWhole = t.lastWhole;
  const sameShape = Array.isArray(t.sequence) && seq.length === t.sequence.length;
  if (sameShape) {
    t.sequence = seq;
    t._silentLoad = true;
    loadTimerStep(t.current);
    t.seconds = secs; t.deadline = deadline; t.lastWhole = lastWhole;
    updateTimerDisplay();
  } else {
    t.sequence = seq;
    t.totalSteps = seq.length;
  }
  t.workoutRef = w;
  buildSidebar();
  if (typeof persistLiveSession === 'function') persistLiveSession();
  ihToast('⇄ ' + before + ' → ' + after);
  offerResyncLink('Swapped ' + before + ' for ' + after + '. Phones still show ' + before +
    ' — send a fresh link so they see the new move.');
}

// ─── End-of-class summary ────────────────────────────────────
let _ihSummaryText = '';
// The history entry this summary belongs to. Saving by position would put
// the note on whatever class happens to be first when it is typed (a sync
// or another finished class can change that).
let _ihSummaryTs = null;

function ihSummaryData() {
  const w = state.workout;
  if (!w) return null;
  const exs = w.exercises || [];
  const load = w.muscleLoad || (typeof muscleLoadForExercises === 'function' ? muscleLoadForExercises(exs) : {});
  const top = Object.entries(load).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const present = (typeof Roster !== 'undefined' && typeof MA !== 'undefined' && MA.enabled) ? Roster.present().length : 0;
  return {
    style: (w.styleCfg && w.styleCfg.name) || '',
    focus: muscleFocus(w.muscle || state.muscle).label,
    duration: w.duration, moves: exs.length, athletes: present || w.participants || 0,
    names: exs.map(e => e.name), top: top,
  };
}

function ihShowSummary() {
  const d = ihSummaryData();
  if (!d || window.__ATHLETE_MODE) return;
  const head = state.workoutHistory && state.workoutHistory[0];
  _ihSummaryTs = head && head.ts != null ? head.ts : null;
  const groups = d.top.map(id => (typeof muscleIcon === 'function' ? muscleIcon(id) + ' ' : '') +
    (typeof muscleLabel === 'function' ? muscleLabel(id, true) : id));
  _ihSummaryText = [
    '🔥 ' + d.style + (d.focus ? ' — ' + d.focus : ''),
    d.duration + ' min · ' + d.moves + ' moves · ' + d.athletes + ' people',
    groups.length ? 'Worked: ' + groups.join(', ') : '',
    '',
    d.names.map((n, i) => (i + 1) + '. ' + n).join('\n'),
  ].filter((l, i) => l || i === 3).join('\n');

  const old = ihEl('ih-summary'); if (old) old.remove();
  const m = document.createElement('div');
  m.className = 'qr-modal';
  m.id = 'ih-summary';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-label', 'Class summary');
  m.style.display = 'flex';
  m.innerHTML =
    '<div class="qr-modal-inner ih-summary-inner">' +
      '<button class="modal-close qr-close" type="button" data-onclick="ihCloseSummary()" aria-label="Close summary">✕</button>' +
      '<div class="qr-title">🎉 Class complete</div>' +
      '<div class="qr-sub">' + ihEsc(d.style) + (d.focus ? ' · ' + ihEsc(d.focus) : '') + '</div>' +
      '<div class="ih-summary-stats">' +
        '<div><b>' + ihEsc(d.duration) + '</b><span>minutes</span></div>' +
        '<div><b>' + ihEsc(d.moves) + '</b><span>moves</span></div>' +
        '<div><b>' + ihEsc(d.athletes) + '</b><span>people</span></div>' +
      '</div>' +
      (groups.length ? '<div class="ih-summary-groups">' + groups.map(g => '<span class="hist-mg">' + ihEsc(g) + '</span>').join('') + '</div>' : '') +
      '<label class="save-class-label" for="ih-summary-note">How did it go? (kept in history)</label>' +
      '<textarea class="save-class-input ih-summary-note" id="ih-summary-note" rows="3" maxlength="400" ' +
        'placeholder="Too easy? Great energy? What to change next time…" data-onchange="ihSaveNote(this.value)"></textarea>' +
      '<div class="ih-summary-actions">' +
        '<button class="action-btn secondary" type="button" data-onclick="ihCopySummary()">📋 Copy summary</button>' +
        '<button class="action-btn go-live-btn" type="button" data-onclick="ihCloseSummary()">Done</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
}

function ihSaveNote(v) {
  const h = state.workoutHistory || [];
  const e = _ihSummaryTs != null ? h.find(x => x && x.ts === _ihSummaryTs) : h[0];
  if (!e) return;
  e.note = String(v || '').slice(0, 400);
  if (typeof saveToStorage === 'function') saveToStorage();
}

function ihCloseSummary() {
  const m = ihEl('ih-summary');
  if (!m) return;
  const note = ihEl('ih-summary-note');
  if (note && note.value) ihSaveNote(note.value);
  m.remove();
}

function ihCopySummary() {
  const text = _ihSummaryText;
  const done = ok => ihToast(ok ? '📋 Summary copied' : 'Couldn\'t copy — select the text instead', ok ? 'success' : 'error');
  if (navigator.share) {
    navigator.share({ title: 'Class summary', text: text }).catch(() => {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  } else done(false);
}

// ─── Trends (history tab) ────────────────────────────────────
function ihWeekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function ihBarSvg(vals, labels, title) {
  const W = 560, H = 150, pad = 26, top = 16;
  const max = Math.max(1, ...vals);
  const slot = (W - pad * 2) / vals.length, bw = Math.max(6, slot * 0.62);
  let g = '';
  vals.forEach((v, i) => {
    const h = Math.round((H - top) * (v / max));
    const x = pad + i * slot + (slot - bw) / 2, y = H - h;
    g += '<rect class="ih-bar" x="' + x.toFixed(1) + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + h + '" rx="3"></rect>';
    if (v > 0) g += '<text class="ih-bar-val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4) + '" text-anchor="middle">' + ihEsc(v) + '</text>';
    if (i % 2 === 0 || vals.length <= 8) g += '<text class="ih-bar-lbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H + 15) + '" text-anchor="middle">' + ihEsc(labels[i]) + '</text>';
  });
  return '<svg class="ih-chart" viewBox="0 0 ' + W + ' ' + (H + 22) + '" role="img" aria-label="' + ihEsc(title) + '">' +
    '<title>' + ihEsc(title) + '</title><line class="ih-axis" x1="' + pad + '" y1="' + H + '" x2="' + (W - pad) + '" y2="' + H + '"></line>' + g + '</svg>';
}

function renderTrends() {
  const host = ihEl('trends');
  if (!host) return;
  if (typeof syncHistory === 'function') syncHistory();
  const hist = (state.workoutHistory || []).filter(e => e && e.ts);
  if (!hist.length) {
    host.innerHTML = '<div class="empty-state">Trends appear after your first completed class.</div>';
    return;
  }
  const WEEKS = 12, now = Date.now();
  const thisWeek = ihWeekStart(now);
  const counts = new Array(WEEKS).fill(0), ppl = new Array(WEEKS).fill(0), pplN = new Array(WEEKS).fill(0), labels = [];
  for (let i = 0; i < WEEKS; i++) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - 7 * (WEEKS - 1 - i));
    labels.push((d.getMonth() + 1) + '/' + d.getDate());
  }
  hist.forEach(e => {
    const idx = WEEKS - 1 - Math.round((thisWeek - ihWeekStart(e.ts)) / (7 * 86400000));
    if (idx < 0 || idx >= WEEKS) return;
    counts[idx]++;
    if (e.participants) { ppl[idx] += e.participants; pplN[idx]++; }
  });
  const avg = ppl.map((s, i) => pplN[i] ? Math.round(s / pplN[i]) : 0);

  const last30 = hist.filter(e => now - e.ts <= 30 * 86400000);
  const withP = hist.filter(e => e.participants);
  const avgAll = withP.length ? Math.round(withP.reduce((s, e) => s + e.participants, 0) / withP.length) : 0;
  const styles = {};
  hist.forEach(e => { if (e.style) styles[e.style] = (styles[e.style] || 0) + 1; });
  const favStyle = Object.entries(styles).sort((a, b) => b[1] - a[1])[0];

  const load = {};
  last30.forEach(e => Object.entries(e.muscleLoad || {}).forEach(([id, v]) => { load[id] = (load[id] || 0) + (Number(v) || 0); }));
  const loadRows = Object.entries(load).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const loadMax = loadRows.length ? loadRows[0][1] || 1 : 1;
  const loadHtml = loadRows.length
    ? loadRows.map(([id, v]) => '<div class="ih-load-row"><span class="ih-load-name">' +
        ihEsc((typeof muscleIcon === 'function' ? muscleIcon(id) + ' ' : '') + (typeof muscleLabel === 'function' ? muscleLabel(id, true) : id)) +
        '</span><span class="ih-load-track"><span class="ih-load-fill" style="width:' + Math.round(v / loadMax * 100) + '%"></span></span></div>').join('')
    : '<div class="empty-state">No muscle data in the last 30 days.</div>';

  host.innerHTML =
    '<div class="ih-trend-stats">' +
      '<div><b>' + hist.length + '</b><span>classes taught</span></div>' +
      '<div><b>' + last30.length + '</b><span>last 30 days</span></div>' +
      '<div><b>' + (avgAll || '—') + '</b><span>avg people</span></div>' +
      '<div><b>' + (favStyle ? ihEsc(favStyle[0]) : '—') + '</b><span>most used style</span></div>' +
    '</div>' +
    '<div class="ih-trend-card"><div class="ih-trend-title">Classes per week</div>' + ihBarSvg(counts, labels, 'Classes taught per week, last 12 weeks') + '</div>' +
    '<div class="ih-trend-card"><div class="ih-trend-title">Average people per class</div>' + ihBarSvg(avg, labels, 'Average attendance per class by week, last 12 weeks') + '</div>' +
    '<div class="ih-trend-card"><div class="ih-trend-title">Muscle focus, last 30 days</div>' + loadHtml + '</div>';
}

// ─── Printable class card ────────────────────────────────────
// One page, big type: for the clipboard or the studio wall. (The PDF
// button is the detailed plan; this is the glanceable version.)
function printClassCard() {
  const w = state.workout;
  if (!w) { ihToast('Build a class first', 'error'); return; }
  const list = (title, items, fmt) => items && items.length
    ? '<h2>' + title + '</h2><ol>' + items.map(it => '<li>' + fmt(it) + '</li>').join('') + '</ol>' : '';
  const cb = w.coreBurner;
  const focus = muscleFocus(w.muscle || state.muscle).label;
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Class card</title><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:26px;color:#111}' +
    'h1{font-size:30px;margin:0 0 4px;color:#d63d00}.meta{font-size:15px;color:#444;margin-bottom:14px}' +
    'h2{font-size:17px;margin:16px 0 6px;border-bottom:2px solid #d63d00;padding-bottom:2px;text-transform:uppercase;letter-spacing:.04em}' +
    'ol{margin:0;padding-left:28px;column-count:2;column-gap:32px}li{font-size:18px;line-height:1.35;margin-bottom:5px;break-inside:avoid}' +
    '.main li{font-size:21px;font-weight:700}.sub{display:block;font-size:12px;font-weight:400;color:#555}' +
    '.foot{margin-top:18px;font-size:11px;color:#888}' +
    '</style></head><body>' +
    '<h1>' + ihEsc((w.styleCfg && w.styleCfg.name) || 'Class') + '</h1>' +
    '<div class="meta">' + ihEsc(focus) + ' · ' + ihEsc(w.duration) + ' min · ' + ihEsc(w.participants) + ' people · ' + new Date().toLocaleDateString() + '</div>' +
    list('Warm-up', w.warmup, e => ihEsc(e.name) + ' <span class="sub">' + ihEsc(e.duration) + 's</span>') +
    '<div class="main">' + list('Main workout', w.exercises, e =>
      ihEsc(e.name) + ' — ' + ihEsc(e.reps) + (e.unit ? ' ' + ihEsc(e.unit) : '') +
      '<span class="sub">' + ihEsc(e.propLabel || '') +
      (e.easier ? ' · easier: ' + ihEsc(e.easier) : '') + (e.harder ? ' · harder: ' + ihEsc(e.harder) : '') + '</span>') + '</div>' +
    (cb && cb.exercises && cb.exercises.length
      ? list('Core burner · ' + ihEsc(cb.work) + 's on / ' + ihEsc(cb.rest) + 's off', cb.exercises, e => ihEsc(e.name)) : '') +
    list('Cool-down', w.cooldown, e => ihEsc(e.name) + ' <span class="sub">' + ihEsc(e.duration) + 's</span>') +
    '<div class="foot">Inspire Habits</div></body></html>';
  const win = window.open('', '_blank');
  if (!win) { ihToast('Pop-ups are blocked — allow them to print', 'error'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

// ─── Backup safety nets ──────────────────────────────────────
function ihRestoreLost(btn) {
  const lost = window.__ihLost || {};
  IHStore.restoreLost(lost);
  ihCloseBar('ih-restore-bar');
  ihToast('Restored — reloading…', 'success');
  setTimeout(() => location.reload(), 500);
}
function ihDiscardLost() {
  IHStore.discardLost();
  window.__ihLost = null;
  ihCloseBar('ih-restore-bar');
}

function ihCheckMirror() {
  if (!IHStore.checkMirror) return;
  IHStore.checkMirror(res => {
    if (!res || !res.count) return;
    window.__ihLost = res.lost;
    ihBar('ih-restore-bar',
      '<span class="resume-icon">🛟</span>' +
      '<span class="resume-text">Your saved classes look like they were cleared by the browser. ' +
      'A copy kept on this device can bring back <b>' + res.count + '</b> item' + (res.count === 1 ? '' : 's') + '.</span>' +
      '<button class="resume-btn" type="button" data-onclick="ihRestoreLost()">Restore</button>' +
      '<button class="resume-btn ghost" type="button" data-onclick="ihCloseBar(\'ih-restore-bar\')">Not now</button>' +
      '<button class="resume-btn ghost" type="button" data-onclick="ihDiscardLost()">Discard</button>');
  });
}

function ihBackupNudge() {
  const saved = (typeof state !== 'undefined' && state.savedWorkouts) || [];
  if (!saved.length || ihEl('ih-restore-bar')) return;
  const DAY = 86400000, now = Date.now();
  const last = Number(IHStore.get('hiit_last_backup')) || 0;
  let since = Number(IHStore.get('hiit_backup_clock')) || 0;
  if (!since) { since = now; IHStore.set('hiit_backup_clock', String(now)); }
  const age = now - (last || since);
  if (age < (last ? 30 : 14) * DAY) return;
  if (IHStore.getSession('ih_nudge_seen')) return;
  IHStore.setSession('ih_nudge_seen', '1');
  ihBar('ih-backup-bar',
    '<span class="resume-icon">💾</span>' +
    '<span class="resume-text">' + (last ? 'It has been ' + Math.floor(age / DAY) + ' days since your last backup.' :
      'Your saved classes live only in this browser.') + ' A file backup takes a second.</span>' +
    '<button class="resume-btn" type="button" data-onclick="ihCloseBar(\'ih-backup-bar\');exportSavedClasses()">Back up now</button>' +
    '<button class="resume-btn ghost" type="button" data-onclick="ihCloseBar(\'ih-backup-bar\')">Later</button>');
}

// ─── Accessibility ───────────────────────────────────────────
const IH_ICON_LABELS = { '⏮': 'Previous interval', '⏭': 'Next interval', '✕': 'Close', '←': 'Back' };

function ihLabelIconButtons() {
  document.querySelectorAll('button').forEach(b => {
    if (b.id === 'play-pause-btn' || b.id === 'p-play-pause') {
      b.setAttribute('aria-label', (b.textContent || '').trim() === '⏸' ? 'Pause' : 'Play');
      return;
    }
    if (b.hasAttribute('aria-label')) return;
    const text = (b.textContent || '').trim();
    if (/[\p{L}\p{N}]/u.test(text)) return;
    const label = b.title || IH_ICON_LABELS[text] ||
      (b.classList.contains('modal-close') ? 'Close' : '');
    if (label) b.setAttribute('aria-label', label);
  });
}

const IH_MODAL_SEL = '.modal-overlay, .qr-modal';
function ihVisibleModals() {
  return Array.from(document.querySelectorAll(IH_MODAL_SEL)).filter(m => getComputedStyle(m).display !== 'none');
}
const IH_FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ihInitModals() {
  const returnTo = new WeakMap();
  const watch = m => {
    if (m.__ihWatched) return;
    m.__ihWatched = true;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    let wasOpen = getComputedStyle(m).display !== 'none';
    new MutationObserver(() => {
      const open = getComputedStyle(m).display !== 'none';
      if (open && !wasOpen) {
        returnTo.set(m, document.activeElement);
        const first = m.querySelector(IH_FOCUSABLE);
        if (first) setTimeout(() => first.focus(), 30);
      } else if (!open && wasOpen) {
        const back = returnTo.get(m);
        if (back && back.focus) try { back.focus(); } catch (e) {}
      }
      wasOpen = open;
    }).observe(m, { attributes: true, attributeFilter: ['style', 'class'] });
  };
  document.querySelectorAll(IH_MODAL_SEL).forEach(watch);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = ihVisibleModals();
      const top = open[open.length - 1];
      if (top) {
        const close = top.querySelector('.modal-close, .qr-close');
        if (close) { e.preventDefault(); close.click(); return; }
      }
      if (document.body.classList.contains('tv-mode') && !document.fullscreenElement) toggleTvMode();
      return;
    }
    if (e.key !== 'Tab') return;
    const open = ihVisibleModals();
    const top = open[open.length - 1];
    if (!top) return;
    const items = Array.from(top.querySelectorAll(IH_FOCUSABLE)).filter(x => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

function ihInitA11y() {
  ihLabelIconButtons();
  ihInitModals();
  let pending = null;
  new MutationObserver(muts => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      ihLabelIconButtons();
      document.querySelectorAll(IH_MODAL_SEL).forEach(m => {
        if (!m.__ihWatched) { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); }
      });
    }, 250);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  syncVoiceButtons();
}

// ─── Start-up (called by boot.js) ────────────────────────────
function ihFeaturesInit() {
  ihInitA11y();
  if (window.__ATHLETE_MODE) return;
  ihWhenUnlocked(() => {
    ihCheckMirror();
    setTimeout(ihBackupNudge, 2500);
  });
}
