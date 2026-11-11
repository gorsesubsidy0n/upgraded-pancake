// ============================================================
//  INSPIRE HABITS — simple.js
//  Simple class design. By default the setup screen shows only
//  the choices most classes need (people, muscle focus, length)
//  and a one-tap Quick class. Everything else is still there:
//  folded under "More options", behind "More styles", in the
//  plan screen's ⋯ menu, or shown in full by the per-instructor
//  "Advanced editing" switch. Each instructor's last class setup
//  is remembered and pre-filled next time.
// ============================================================

const IH_ALL_STYLES = ['random','tabata','circuit','amrap','emom','ladder','pyramid','hundred','superset','ygig','custom'];
const IH_CORE_STYLES = ['random','circuit','tabata','emom'];
const IH_DIFF_LABEL = { b:'Beginner', i:'Intermediate', a:'Advanced' };

// ── Pure helpers (tested) ─────────────────────────────────────

// Styles shown before "More styles": the everyday four plus whatever the
// instructor used last, so their go-to format is always one tap away.
function ihFavouriteStyles(last) {
  const out = IH_CORE_STYLES.slice();
  if (last && IH_ALL_STYLES.indexOf(last) !== -1 && out.indexOf(last) === -1) out.push(last);
  return out;
}

function ihDiffKey(d) {
  const k = String(d || '').charAt(0).toLowerCase();
  return IH_DIFF_LABEL[k] ? k : null;
}

// Stored prefs come from localStorage, so treat every field as untrusted.
// Anything unknown or out of range is dropped rather than guessed.
function ihSanitizePrefs(obj, validProps, isValidMuscle) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const last = src.last && typeof src.last === 'object' ? src.last : {};
  const out = { advanced: src.advanced === true, last: {} };
  const L = out.last;
  const int = (v, lo, hi) => { const n = parseInt(v, 10); return isNaN(n) ? null : Math.min(hi, Math.max(lo, n)); };

  const p = int(last.participants, 1, 16); if (p !== null) L.participants = p;
  const d = int(last.duration, 5, 120); if (d !== null) L.duration = d;
  if ([5, 7, 10].indexOf(parseInt(last.warmupDuration, 10)) !== -1) L.warmupDuration = parseInt(last.warmupDuration, 10);
  const dk = ihDiffKey(last.difficulty); if (dk) L.difficulty = dk;
  if (typeof last.includeWarmup === 'boolean') L.includeWarmup = last.includeWarmup;
  if (typeof last.includeCooldown === 'boolean') L.includeCooldown = last.includeCooldown;
  if (typeof last.atHome === 'boolean') L.atHome = last.atHome;
  if (typeof last.funTheme === 'string') L.funTheme = last.funTheme;
  if (typeof last.style === 'string' && IH_ALL_STYLES.indexOf(last.style) !== -1) L.style = last.style;
  if (typeof last.muscle === 'string' && last.muscle.length <= 200 &&
      (typeof isValidMuscle !== 'function' || isValidMuscle(last.muscle))) L.muscle = last.muscle;
  if (Array.isArray(last.props)) {
    const allowed = validProps ? new Set(validProps) : null;
    const props = last.props.filter(x => typeof x === 'string' && (!allowed || allowed.has(x)));
    if (props.length) L.props = Array.from(new Set(props));
  }
  return out;
}

// One line telling the instructor what is folded away, so nothing hidden
// is a surprise.
function ihMoreSummary(s) {
  s = s || {};
  const parts = [];
  parts.push(IH_DIFF_LABEL[ihDiffKey(s.difficulty) || 'i']);
  parts.push(s.includeWarmup === false ? 'no warm-up' : (s.warmupDuration || 7) + '-min warm-up');
  parts.push(s.includeCooldown === false ? 'no cool-down' : 'cool-down');
  const n = Array.isArray(s.props) ? s.props.length : 0;
  parts.push(n + (n === 1 ? ' prop' : ' props'));
  return parts.join(' · ');
}

// ── Per-instructor prefs ──────────────────────────────────────

function ihPrefsKey() {
  const id = typeof currentInstructorId === 'function' ? currentInstructorId() : null;
  return 'hiit_profile_' + (id || 'shared') + '_prefs';
}

function ihValidMuscle(m) {
  if (m === 'custom') return true;
  if (typeof MUSCLE_FOCUS !== 'undefined' && MUSCLE_FOCUS[m]) return true;
  return typeof customFocusIds === 'function' && !!customFocusIds(m);
}

function ihGetPrefs() {
  const raw = typeof IHStore !== 'undefined' ? IHStore.getJSON(ihPrefsKey(), {}) : {};
  const owned = typeof state !== 'undefined' && state.inventory ? Object.keys(state.inventory) : null;
  return ihSanitizePrefs(raw, owned, ihValidMuscle);
}

function ihSavePrefs(prefs) {
  if (typeof IHStore !== 'undefined') IHStore.setJSON(ihPrefsKey(), prefs);
}

// Called by generateWorkout once a plan has been built.
function ihRememberClass(s) {
  if (!s) return;
  const prefs = ihGetPrefs();
  prefs.last = {
    participants: s.participants, difficulty: s.difficulty, muscle: s.muscle,
    duration: s.duration, includeWarmup: s.includeWarmup, includeCooldown: s.includeCooldown,
    warmupDuration: s.warmupDuration, style: s.style, props: (s.props || []).slice(),
    atHome: !!s.atHome,
    funTheme: s.funTheme || '',
  };
  ihSavePrefs(prefs);
  ihMarkFavouriteStyles();
}

function ihSetActive(selector, attr, value) {
  document.querySelectorAll(selector).forEach(b => {
    b.classList.toggle('active', String(b.dataset[attr]) === String(value));
  });
}

// Pre-fill setup with this instructor's last class and restore their mode.
function ihApplyInstructorPrefs() {
  if (typeof state === 'undefined') return;
  const prefs = ihGetPrefs();
  const L = prefs.last;
  if (L.participants) {
    state.participants = L.participants;
    const c = document.getElementById('participant-count'); if (c) c.textContent = L.participants;
    const sl = document.getElementById('participant-slider'); if (sl) sl.value = L.participants;
  }
  if (typeof L.atHome === 'boolean') {
    state.atHome = L.atHome;
    const ah = document.getElementById('at-home-chk'); if (ah) ah.checked = L.atHome;
  }
  // A remembered theme only carries over while it is still in season.
  if (typeof L.funTheme === 'string' && typeof ihSuggestedFunThemes === 'function') {
    const inSeason = ihSuggestedFunThemes().some(t => t.id === L.funTheme);
    state.funTheme = inSeason ? L.funTheme : '';
    if (typeof ihSyncFunThemeUi === 'function') ihSyncFunThemeUi();
  }
  if (L.difficulty) { state.difficulty = L.difficulty; ihSetActive('.diff-btn', 'diff', L.difficulty); }
  if (L.duration) {
    state.duration = L.duration;
    ihSetActive('.dur-btn', 'dur', L.duration);
    const cd = document.getElementById('custom-duration-val'); if (cd) cd.value = L.duration;
  }
  if (L.warmupDuration) { state.warmupDuration = L.warmupDuration; ihSetActive('.wdur-btn', 'wdur', L.warmupDuration); }
  if (typeof L.includeWarmup === 'boolean') {
    state.includeWarmup = L.includeWarmup;
    const w = document.getElementById('include-warmup'); if (w) w.checked = L.includeWarmup;
  }
  if (typeof L.includeCooldown === 'boolean') {
    state.includeCooldown = L.includeCooldown;
    const cl = document.getElementById('include-cooldown'); if (cl) cl.checked = L.includeCooldown;
  }
  if (L.muscle) {
    state.muscle = L.muscle;
    if (typeof renderMuscleFocus === 'function') renderMuscleFocus();
  }
  if (typeof renderPropsGrid === 'function') {
    // The grid ticks everything on its first paint; paint first so the
    // remembered selection is what survives.
    if (typeof _propsGridPainted !== 'undefined' && !_propsGridPainted) renderPropsGrid();
    if (L.props) state.props = L.props.slice();
    renderPropsGrid();
  }
  ihSetAdvanced(prefs.advanced, true);
  ihMarkFavouriteStyles();
  ihUpdateMoreSummary();
}

// ── Mode and toggles ──────────────────────────────────────────

function ihSetAdvanced(on, noSave) {
  on = !!on;
  document.body.classList.toggle('ih-advanced', on);
  const chk = document.getElementById('ih-advanced-chk');
  if (chk) chk.checked = on;
  if (!noSave) {
    const prefs = ihGetPrefs();
    prefs.advanced = on;
    ihSavePrefs(prefs);
    if (typeof showToast === 'function') showToast(on ? '🛠️ Advanced editing on — every option is shown' : '✨ Simple mode — extras are tucked away');
  }
}

function ihToggleMore() {
  const open = document.body.classList.toggle('ih-more-open');
  const btn = document.getElementById('ih-more-toggle');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  ihUpdateMoreSummary();
}

function ihUpdateMoreSummary() {
  const el = document.getElementById('ih-more-summary');
  if (!el || typeof state === 'undefined') return;
  let text = ihMoreSummary(state);
  const ma = document.getElementById('ma-toggle');
  if (ma && ma.checked) text += ' · mixed-ability on';
  el.textContent = text;
  const caret = document.getElementById('ih-more-caret');
  if (caret) caret.textContent = document.body.classList.contains('ih-more-open') ? '▴' : '▾';
}

// Everything needed for a sensible class is already set, so go straight
// to the plan using the instructor's usual style.
function ihQuickClass() {
  if (typeof state === 'undefined') return;
  if (!state.props || state.props.length === 0) {
    if (typeof showToast === 'function') showToast('Please select at least one prop!', 'error');
    if (!document.body.classList.contains('ih-more-open')) ihToggleMore();
    return;
  }
  let style = ihGetPrefs().last.style;
  // Custom needs the instructor to set it up; never pick it silently.
  if (!style || style === 'custom') style = 'random';
  if (typeof pickStyle === 'function') pickStyle(style); else state.style = style;
  if (typeof generateWorkout === 'function') generateWorkout();
}

function ihMarkFavouriteStyles() {
  const favs = ihFavouriteStyles(ihGetPrefs().last.style);
  document.querySelectorAll('.style-pick-btn[data-style]').forEach(b => {
    const fav = favs.indexOf(b.dataset.style) !== -1;
    b.classList.toggle('spb-extra', !fav);
    b.classList.toggle('spb-fav', fav && IH_CORE_STYLES.indexOf(b.dataset.style) === -1);
  });
}

function ihToggleMoreStyles() {
  const scr = document.getElementById('style-picker-screen');
  if (!scr) return;
  const open = scr.classList.toggle('show-all');
  const btn = document.getElementById('ih-more-styles-btn');
  if (btn) btn.textContent = open ? 'Fewer styles ▴' : 'More styles ▾';
}

function ihTogglePlanMenu() {
  const menu = document.getElementById('plan-more');
  if (!menu) return;
  const open = menu.classList.toggle('open');
  const btn = document.getElementById('plan-more-btn');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// ── Wiring ────────────────────────────────────────────────────

document.addEventListener('click', e => {
  const t = e.target;
  if (!t || typeof t.closest !== 'function') return;
  // Close the drop-downs when tapping anywhere else.
  const menu = document.getElementById('plan-more');
  if (menu && menu.classList.contains('open') &&
      ((!t.closest('#plan-more') && !t.closest('#plan-more-btn')) || t.closest('#plan-more button'))) {
    menu.classList.remove('open');
    const mb = document.getElementById('plan-more-btn');
    if (mb) mb.setAttribute('aria-expanded', 'false');
  }
  document.querySelectorAll('details.hero-menu[open]').forEach(d => {
    if (!d.contains(t)) d.removeAttribute('open');
    else if (t.closest('.hero-menu-list button')) d.removeAttribute('open');
  });
  // Any setup change can alter the folded summary; read it after the
  // action dispatcher has applied the change.
  if (t.closest('.setup-grid')) setTimeout(ihUpdateMoreSummary, 0);
});
document.addEventListener('change', e => {
  if (e.target && typeof e.target.closest === 'function' && e.target.closest('.setup-grid')) setTimeout(ihUpdateMoreSummary, 0);
});

document.addEventListener('DOMContentLoaded', () => {
  // The mixed-ability card is injected at load; fold it with the extras.
  const ma = document.getElementById('ma-setup-card');
  if (ma) ma.classList.add('ih-more');
  ihMarkFavouriteStyles();
  ihUpdateMoreSummary();
});
