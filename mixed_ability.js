// ============================================================
//  HIIT CLASS GENERATOR V6 — mixed_ability.js
//  Mixed-ability scaling: group setup, tiered plan view,
//  3-zone live class display, instructor spotlight controls
// ============================================================

// ── MIXED ABILITY STATE (extends global state) ────────────────
// Merged into state object at init time
const MA = {
  enabled: false,
  groups: [
    { id:'b', label:'Beginner',     icon:'🌱', color:'green',  count:0, names:'' },
    { id:'i', label:'Intermediate', icon:'🔥', color:'yellow', count:0, names:'' },
    { id:'a', label:'Advanced',     icon:'💀', color:'red',    count:0, names:'' },
  ],
  spotlight: null,   // null = show all, 'b'|'i'|'a' = spotlight one group
  overrides: {},     // { exerciseIndex: 'b'|'i'|'a'|null } — per-exercise spotlight override
};

// ── DIFFICULTY DISPLAY HELPERS ────────────────────────────────
const DIFF_COLOR = { b:'green', i:'yellow', a:'red' };
const DIFF_ICON  = { b:'🌱', i:'🔥', a:'💀' };
const DIFF_FULL  = { b:'Beginner', i:'Intermediate', a:'Advanced' };

const TIER_KEY = { b:'beginner', i:'intermediate', a:'advanced' };
const _maEsc = s => (typeof escapeHtml === 'function') ? escapeHtml(s == null ? '' : String(s))
  : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function _maGroupCount(tier) {
  const g = MA.groups.find(x => x.id === tier);
  return Math.max(1, parseInt(g && g.count) || 0);
}

/** True when the class has equipment `group` for this tier (bodyweight and the station's own prop always are). */
function maEquipOk(group, stationProp, tier) {
  if (!group || group === 'bodyweight' || group === stationProp) return true;
  const props = (typeof state !== 'undefined' && Array.isArray(state.props)) ? state.props : [];
  if (!props.includes(group)) return false;
  if (typeof propUsable === 'function') {
    try { return propUsable(group, tier ? _maGroupCount(tier) : undefined); } catch (e) { return true; }
  }
  return true;
}

const _maPrimaryCache = new Map();
function _maPrimary(ex) {
  if (!ex) return [];
  if (ex.muscles && Array.isArray(ex.muscles.primary)) return ex.muscles.primary;
  if (typeof resolveMuscles !== 'function') return [];
  const k = ex.name;
  if (k && _maPrimaryCache.has(k)) return _maPrimaryCache.get(k);
  let p = [];
  try { p = (resolveMuscles(ex) || {}).primary || []; } catch (e) { p = []; }
  if (k) _maPrimaryCache.set(k, p);
  return p;
}

function _maHighImpact(exOrName) {
  return typeof exIsHighImpact === 'function' ? exIsHighImpact(exOrName) : false;
}

/** Can `move` (name or exercise) be shown to `tier` at a station built on `baseEx`? */
function maMoveFitsTier(move, tier, baseEx) {
  if (!move) return false;
  const hit = typeof move === 'string'
    ? (typeof exFind === 'function' ? exFind(move) : null)
    : { ex: move, group: move.prop };
  if (tier === 'b' && _maHighImpact(hit ? hit.ex : move)) return false;
  if (!hit) return true;  // free-text variant of the station move (e.g. "Knee Push-Up")
  if (tier === 'b' && Array.isArray(hit.ex.difficulty) && !hit.ex.difficulty.includes('b')) return false;
  return maEquipOk(hit.group, baseEx && baseEx.prop, tier);
}

/**
 * Library moves a tier could do instead of `ex`: level-tagged, beginner-safe,
 * using equipment the class has, ranked by shared primary muscles.
 */
function maTierCandidates(ex, tier, limit = 12) {
  if (typeof DB === 'undefined' || !ex) return [];
  const prim = new Set(_maPrimary(ex));
  const foc = new Set(ex.focus || []);
  const out = [];
  Object.entries(DB).forEach(([group, list]) => {
    if (!maEquipOk(group, ex.prop, tier)) return;
    list.forEach(c => {
      if (c.name === ex.name || !(c.difficulty || []).includes(tier)) return;
      if (tier === 'b' && _maHighImpact(c)) return;
      const shared = _maPrimary(c).filter(m => prim.has(m)).length;
      const fShared = (c.focus || []).filter(f => foc.has(f)).length;
      if (!shared && !(prim.size === 0 && fShared)) return;
      const score = shared * 10 + fShared * 2 + (group === ex.prop ? 4 : 0) + (group === 'bodyweight' ? 2 : 0);
      out.push({ name: c.name, group, score });
    });
  });
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}

function _maMod(label, move, ex, extra) {
  return Object.assign({ label, value: move, move, changed: move !== ex.name, note: '', source: 'auto' }, extra || {});
}

/**
 * The move a tier actually does for station `ex`.
 * Returns { label, value, move, changed, note, source }. `label`/`value` are kept for older callers.
 * Order: instructor override (ex.tierOverride) → easier/harder if safe and equipped → base move → safe substitute.
 * Beginners never get a high-impact move.
 */
function getModForTier(ex, tier) {
  if (!ex) return { label: '', value: '—', move: '', changed: false, note: '', source: 'none' };
  const ov = ex.tierOverride && ex.tierOverride[TIER_KEY[tier]];
  if (ov && typeof ov === 'string') {
    const unsafe = tier === 'b' && _maHighImpact(ov);
    return _maMod('Instructor pick:', ov, ex, { source: 'override', note: unsafe ? '⚠️ High-impact — check this suits beginners' : '' });
  }
  const loaded = ex.prop && ex.prop !== 'bodyweight';
  if (tier === 'i') return _maMod('Standard', ex.name, ex);

  if (tier === 'a') {
    if (ex.harder && maMoveFitsTier(ex.harder, 'a', ex)) return _maMod('Progress:', ex.harder, ex, { source: 'harder' });
    return _maMod('Progress:', ex.name, ex, { note: loaded ? 'Heavier load or faster pace' : 'Faster pace, full range' });
  }

  // Beginner
  if (ex.easier && maMoveFitsTier(ex.easier, 'b', ex)) return _maMod('Use:', ex.easier, ex, { source: 'easier' });
  const baseOk = !_maHighImpact(ex) && (!Array.isArray(ex.difficulty) || ex.difficulty.includes('b'));
  if (baseOk) return _maMod('Same move', ex.name, ex, { note: loaded ? 'Lighter load, slower tempo' : 'Slower tempo, smaller range' });
  const sub = maTierCandidates(ex, 'b', 1)[0];
  if (sub) return _maMod('Use:', sub.name, ex, { source: 'substitute' });
  return _maMod('Use:', 'Marching', ex, { source: 'fallback', note: 'Low-impact option' });
}

/** Per-tier dose. Beginners work a shorter slice of timed intervals; `workSec` overrides the style default. */
function getTierDisplay(ex, tier, workSec) {
  const style = (typeof state !== 'undefined' && state.workout) ? state.workout.style : null;
  const mod = getModForTier(ex, tier);
  const hit = (mod.changed && typeof exFind === 'function') ? exFind(mod.move) : null;
  const src = (hit && hit.ex.repRange) ? hit.ex : ex;
  const range = (src.repRange && src.repRange[tier]) || (ex.repRange && ex.repRange[tier]) || [10, 15];
  const fixed = Number(workSec) || (ex.unit === 'work' && Number(ex.seconds)) ||
                ({ tabata: 20, circuit: 45 })[style] || 0;
  const timedStyle = ex.unit === 'work' || style === 'tabata' || style === 'circuit';
  if (timedStyle && fixed) {
    if (tier === 'b') {
      const w = Math.min(fixed, Math.max(10, Math.round(fixed * 0.75 / 5) * 5));
      return { reps: w + 's', unit: 'work', note: w < fixed ? `then rest ${fixed - w}s` : '' };
    }
    return { reps: fixed + 's', unit: 'work', note: tier === 'a' ? 'push the pace' : '' };
  }
  if (style === 'ladder' && ex.reps == null) return { reps: '5→20', unit: 'reps', note: '' };
  if (['ladder', 'pyramid', 'hundred'].includes(style) && ex.reps != null) {
    return { reps: String(ex.reps), unit: ex.unit || 'reps', note: '' };
  }
  return { reps: `${range[0]}–${range[1]}`, unit: 'reps', note: '' };
}

/** Instructor per-level pick. `name` '' clears it (back to Auto). */
function setTierOverride(i, tier, name) {
  const ex = state.workout && state.workout.exercises && state.workout.exercises[i];
  const key = TIER_KEY[tier];
  if (!ex || !key) return;
  const val = String(name || '').trim();
  const next = Object.assign({}, ex.tierOverride || {});
  if (val) next[key] = val; else delete next[key];
  if (Object.keys(next).length) ex.tierOverride = next; else delete ex.tierOverride;
  if (typeof renderPlanEditor === 'function') renderPlanEditor(); else renderTieredPlanEditor();
  if (typeof showToast === 'function') showToast(val ? `${DIFF_FULL[tier]}: ${val}` : `${DIFF_FULL[tier]}: back to auto`);
}

/** Swap a tier column's "Change" button for a picker of suitable moves. */
function openTierPicker(i, tier) {
  const ex = state.workout && state.workout.exercises && state.workout.exercises[i];
  const slot = document.getElementById(`tier-pick-${i}-${tier}`);
  if (!ex || !slot) return;
  slot.innerHTML = tierPickerHtml(ex, i, tier);
  const sel = slot.querySelector('select');
  if (sel) sel.focus();
}

function tierPickerHtml(ex, i, tier) {
  const current = ex.tierOverride && ex.tierOverride[TIER_KEY[tier]];
  const auto = getModForTier(Object.assign({}, ex, { tierOverride: null }), tier);
  const opts = [];
  const seen = new Set();
  const add = (name, why) => {
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    opts.push(`<option value="${_maEsc(name)}"${current === name ? ' selected' : ''}>${_maEsc(name)}${why ? ' — ' + _maEsc(why) : ''}</option>`);
  };
  if (current) add(current, 'current pick');
  add(ex.name, 'class move');
  if (tier === 'b' && ex.easier && maMoveFitsTier(ex.easier, 'b', ex)) add(ex.easier, 'easier');
  if (tier === 'a' && ex.harder && maMoveFitsTier(ex.harder, 'a', ex)) add(ex.harder, 'harder');
  maTierCandidates(ex, tier, 14).forEach(c => add(c.name, _maPropShort(c.group)));
  return `<select class="form-input tier-pick-select" aria-label="${_maEsc(DIFF_FULL[tier])} move for ${_maEsc(ex.name)}"
      data-onchange="setTierOverride(${i},'${tier}',this.value)">
      <option value=""${current ? '' : ' selected'}>Auto: ${_maEsc(auto.move)}</option>
      ${opts.join('')}
    </select>`;
}
function _maPropShort(group) {
  if (!group || group === 'bodyweight') return 'bodyweight';
  return (typeof PROP_LABELS !== 'undefined' && PROP_LABELS[group]) ? String(PROP_LABELS[group]).replace(/^\S+\s/, '') : group;
}

// ── SETUP SCREEN: MIXED ABILITY PANEL ────────────────────────
// ══════════════════════════════════════════════════════════════
//  PARTICIPANT ROSTER + ATTENDANCE
//  Tiers used to be re-typed from scratch every single class.
//  The roster remembers who trains with you and what tier they
//  are on, so setup becomes "tap the people who showed up".
// ══════════════════════════════════════════════════════════════
const Roster = {
  people: [],
  loaded: false,

  key() {
    const pid = (typeof profileState !== 'undefined' && profileState.activeProfile) ? profileState.activeProfile : 'default';
    return 'hiit_roster_' + pid;
  },
  load() {
    this.people = IHStore.getJSON(this.key(), []) || [];
    this.loaded = true;
    return this.people;
  },
  save() {
    IHStore.setJSON(this.key(), this.people);
  },
  ensure() { if (!this.loaded) this.load(); return this.people; },

  add(name, tier) {
    const clean = (name || '').trim();
    if (!clean) return null;
    this.ensure();
    if (this.people.some(p => p.name.toLowerCase() === clean.toLowerCase())) return null;
    const person = { id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
                     name: clean, tier: tier || 'i', present: false,
                     attended: [], classes: 0, lastSeen: null, note: '' };
    this.people.push(person);
    this.save();
    return person;
  },
  remove(id) { this.ensure(); this.people = this.people.filter(p => p.id !== id); this.save(); },
  get(id)    { this.ensure(); return this.people.find(p => p.id === id); },
  setTier(id, tier) { const p = this.get(id); if (p) { p.tier = tier; this.save(); } },
  togglePresent(id) { const p = this.get(id); if (p) { p.present = !p.present; this.save(); } },
  present()  { this.ensure(); return this.people.filter(p => p.present); },
  clearPresent() { this.ensure(); this.people.forEach(p => p.present = false); this.save(); },

  /** Record today's attendance against everyone marked present. */
  commitAttendance() {
    this.ensure();
    const ts = Date.now();
    this.present().forEach(p => {
      p.attended = (p.attended || []).concat(ts).slice(-60);
      p.classes = (p.classes || 0) + 1;
      p.lastSeen = ts;
    });
    this.save();
  },
  /** Classes attended in the last `days` days. */
  recentCount(p, days = 30) {
    const cut = Date.now() - days * 86400000;
    return (p.attended || []).filter(t => t >= cut).length;
  },
  daysSince(p) {
    if (!p.lastSeen) return null;
    return Math.floor((Date.now() - p.lastSeen) / 86400000);
  },
};

/** Push the checked-in roster into the MA tier groups + participant count. */
function applyRosterToGroups() {
  const present = Roster.present();
  if (!present.length) { showToast('Check in at least one person first', 'error'); return; }
  MA.groups.forEach(g => {
    const mine = present.filter(p => p.tier === g.id);
    g.count = mine.length;
    g.names = mine.map(p => p.name).join(', ');
  });
  const n = present.length;
  const capped = Math.min(16, n);
  if (typeof syncParticipants === 'function') syncParticipants(capped);
  else state.participants = capped;
  const slider = document.getElementById('participant-slider');
  if (slider) slider.value = capped;
  if (typeof updateStationNote === 'function') updateStationNote();
  renderMixedAbilityPanel();
  renderMAGroupSummary();
  if (n > 16) showToast(`⚠️ ${n} checked in — the class is capped at 16. Tiers list everyone; stations are planned for 16.`, 'error');
  else showToast('✓ ' + n + ' checked in — tiers filled from the roster');
}

function addRosterPerson() {
  const input = document.getElementById('roster-new-name');
  const tierSel = document.getElementById('roster-new-tier');
  if (!input) return;
  const names = input.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!names.length) { showToast('Type a name first', 'error'); return; }
  let added = 0;
  names.forEach(n => { if (Roster.add(n, tierSel ? tierSel.value : 'i')) added++; });
  input.value = '';
  renderMixedAbilityPanel();
  showToast(added ? '✓ Added ' + added + ' to the roster' : 'Already on the roster');
}
function toggleRosterPresent(id) { Roster.togglePresent(id); renderMixedAbilityPanel(); }
function setRosterTier(id, tier) { Roster.setTier(id, tier); renderMixedAbilityPanel(); }
function removeRosterPerson(id) {
  const p = Roster.get(id);
  if (!p) return;
  if (!confirm('Remove ' + p.name + ' from the roster? Attendance history will be lost.')) return;
  Roster.remove(id);
  renderMixedAbilityPanel();
}
function checkInAll()  { Roster.ensure(); Roster.people.forEach(p => p.present = true);  Roster.save(); renderMixedAbilityPanel(); }
function checkInNone() { Roster.clearPresent(); renderMixedAbilityPanel(); }

function renderRosterSection() {
  const people = Roster.ensure();
  const present = Roster.present();

  const rows = people
    .slice()
    .sort((a, b) => (b.present - a.present) || a.name.localeCompare(b.name))
    .map(p => {
      const days = Roster.daysSince(p);
      const last = days === null ? 'new' : days === 0 ? 'today' : days === 1 ? 'yesterday' : days + 'd ago';
      const streak = Roster.recentCount(p, 30);
      return `<div class="roster-row ${p.present ? 'roster-present' : ''}">
        <button class="roster-check" data-onclick="toggleRosterPresent('${p.id}')" title="Check in / out" aria-pressed="${p.present ? 'true' : 'false'}" aria-label="${p.present ? 'Checked in' : 'Check in'}: ${escapeHtml(p.name)}">${p.present ? '✅' : '⬜'}</button>
        <span class="roster-name">${escapeHtml(p.name)}</span>
        <select class="roster-tier roster-tier-${DIFF_COLOR[p.tier]}" data-onchange="setRosterTier('${p.id}',this.value)" title="Ability tier — remembered between classes" aria-label="Ability tier for ${escapeHtml(p.name)}">
          ${MA.groups.map(g => `<option value="${g.id}" ${p.tier === g.id ? 'selected' : ''}>${g.icon} ${g.label}</option>`).join('')}
        </select>
        <span class="roster-stat" title="Classes in the last 30 days">${streak}×/30d</span>
        <span class="roster-last">${last}</span>
        <button class="roster-flag${(p.flags||[]).length ? ' has-flags' : ''}" data-onclick="toggleFlagEditor('${p.id}')" title="Injuries &amp; limitations" aria-label="Injuries and limitations for ${escapeHtml(p.name)}">🩹${(p.flags||[]).length ? ' ' + p.flags.length : ''}</button>
        <button class="roster-del" data-onclick="removeRosterPerson('${p.id}')" title="Remove from roster" aria-label="Remove ${escapeHtml(p.name)} from roster">✕</button>
      </div>${typeof IHFlags !== 'undefined' ? IHFlags.editorHtml(p) : ''}`;
    }).join('');

  return `<div class="roster-block">
    <div class="roster-header">
      <span class="roster-title">👥 Roster &amp; Attendance</span>
      <span class="roster-count">${present.length} of ${people.length} checked in</span>
    </div>
    <div class="roster-add">
      <input type="text" class="form-input" id="roster-new-name" placeholder="Add names (comma-separated)" aria-label="Add names to the roster (comma-separated)"
             data-onkeydown="if(event.key==='Enter'){event.preventDefault();addRosterPerson();}"/>
      <select class="form-input roster-new-tier" id="roster-new-tier" aria-label="Tier for new names">
        ${MA.groups.map(g => `<option value="${g.id}" ${g.id === 'i' ? 'selected' : ''}>${g.icon} ${g.label}</option>`).join('')}
      </select>
      <button class="ma-quick-btn" data-onclick="addRosterPerson()">+ Add</button>
    </div>
    ${people.length
      ? `<div class="roster-list">${rows}</div>
         <div class="roster-actions">
           <button class="ma-quick-btn" data-onclick="checkInAll()">Check in all</button>
           <button class="ma-quick-btn" data-onclick="checkInNone()">Clear</button>
           <button class="ma-quick-btn primary" data-onclick="applyRosterToGroups()">→ Fill tiers from check-in</button>
         </div>`
      : `<div class="roster-empty">No one on the roster yet. Add your regulars once and their tier is remembered every class.</div>`}
  </div>`;
}

function renderMixedAbilityPanel() {
  const panel = document.getElementById('ma-panel');
  if (!panel) return;

  const total = MA.groups.reduce((s, g) => s + (parseInt(g.count) || 0), 0);
  const remaining = state.participants - total;
  const capNote = total > 16
    ? `<div class="ma-cap-note" role="status">⚠️ ${total} people in tiers but a class is planned for at most 16 — stations and equipment are sized for 16. Split into two classes or double up at stations.</div>`
    : '';

  panel.innerHTML = `
    ${renderRosterSection()}
    <div class="ma-intro">
      <p class="ma-intro-text">Assign participants to ability tiers. Each group will see their own rep ranges and modifications during the workout.</p>
      <div class="ma-total-bar">
        <span class="ma-total-label">Assigned:</span>
        <div class="ma-total-chips">
          ${MA.groups.map(g => `
            <span class="ma-chip ma-chip-${g.color}">
              ${g.icon} ${g.label}: <b>${g.count || 0}</b>
            </span>`).join('')}
        </div>
        <span class="ma-remaining ${remaining < 0 ? 'over' : remaining === 0 ? 'done' : ''}">
          ${remaining > 0 ? `${remaining} unassigned` : remaining === 0 ? '✓ All assigned' : `⚠️ ${Math.abs(remaining)} over`}
        </span>
      </div>
      ${capNote}
    </div>
    <div class="ma-groups">
      ${MA.groups.map(g => `
        <div class="ma-group-card ma-group-${g.color}">
          <div class="ma-group-header">
            <span class="ma-group-icon">${g.icon}</span>
            <span class="ma-group-name">${g.label}</span>
          </div>
          <div class="ma-group-body">
            <div class="ma-field">
              <label class="ma-field-label" for="ma-count-${g.id}">Number of people</label>
              <div class="ma-count-row">
                <button class="ma-count-btn" data-onclick="changeGroupCount('${g.id}',-1)" aria-label="One fewer ${g.label}">−</button>
                <input type="number" class="ma-count-input" id="ma-count-${g.id}"
                  min="0" max="${state.participants}" value="${g.count || 0}"
                  data-onchange="setGroupCount('${g.id}',this.value)"/>
                <button class="ma-count-btn" data-onclick="changeGroupCount('${g.id}',1)" aria-label="One more ${g.label}">+</button>
              </div>
            </div>
            <div class="ma-field">
              <label class="ma-field-label" for="ma-names-${g.id}">Names / Notes (optional)</label>
              <input type="text" class="form-input ma-names-input" id="ma-names-${g.id}"
                placeholder="e.g. Sarah, Tom, Alex"
                value="${_maEsc(g.names || '')}"
                data-onchange="setGroupNames('${g.id}',this.value)"/>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div class="ma-quick-split">
      <span class="ma-quick-label">Quick split:</span>
      <button class="ma-quick-btn" data-onclick="quickSplit('equal')">Equal thirds</button>
      <button class="ma-quick-btn" data-onclick="quickSplit('pyramid')">Pyramid (25/50/25)</button>
      <button class="ma-quick-btn" data-onclick="quickSplit('beginner-heavy')">Beginner-heavy (50/30/20)</button>
      <button class="ma-quick-btn" data-onclick="quickSplit('advanced-heavy')">Advanced-heavy (20/30/50)</button>
    </div>`;
}

function changeGroupCount(id, delta) {
  const g = MA.groups.find(g => g.id === id);
  if (!g) return;
  g.count = Math.max(0, Math.min(state.participants, (parseInt(g.count) || 0) + delta));
  renderMixedAbilityPanel();
  renderMAGroupSummary();
}
function setGroupCount(id, val) {
  const g = MA.groups.find(g => g.id === id);
  if (!g) return;
  g.count = Math.max(0, Math.min(state.participants, parseInt(val) || 0));
  renderMixedAbilityPanel();
  renderMAGroupSummary();
}
function setGroupNames(id, val) {
  const g = MA.groups.find(g => g.id === id);
  if (g) g.names = val;
  renderMAGroupSummary();
}
function quickSplit(mode) {
  const n = state.participants;
  let splits;
  switch (mode) {
    case 'equal':          splits = [Math.floor(n/3), Math.floor(n/3), n - 2*Math.floor(n/3)]; break;
    case 'pyramid':        splits = [Math.round(n*0.25), Math.round(n*0.50), n - Math.round(n*0.25) - Math.round(n*0.50)]; break;
    case 'beginner-heavy': splits = [Math.round(n*0.50), Math.round(n*0.30), n - Math.round(n*0.50) - Math.round(n*0.30)]; break;
    case 'advanced-heavy': splits = [Math.round(n*0.20), Math.round(n*0.30), n - Math.round(n*0.20) - Math.round(n*0.30)]; break;
    default: splits = [Math.floor(n/3), Math.floor(n/3), n - 2*Math.floor(n/3)];
  }
  MA.groups.forEach((g, i) => { g.count = Math.max(0, splits[i]); });
  renderMixedAbilityPanel();
  renderMAGroupSummary();
}

function toggleMixedAbility(checkbox) {
  MA.enabled = checkbox.checked;
  const panel = document.getElementById('ma-panel-wrap');
  if (panel) panel.style.display = MA.enabled ? 'block' : 'none';
  if (MA.enabled) renderMixedAbilityPanel();
  else {
    // Turning MA off must not leave the last class's tier zones / banner on the live screen.
    const z = document.getElementById('ma-live-zones'); if (z) { z.style.display = 'none'; z.innerHTML = ''; }
    const b = document.getElementById('ma-group-banner'); if (b) b.style.display = 'none';
    const w = document.getElementById('p-exercise-wrap'); if (w) w.style.display = 'flex';
  }
  if (state.workout && typeof renderPlanEditor === 'function') { try { renderPlanEditor(); } catch (e) { /* plan screen not built yet */ } }
}

// ── PLAN EDITOR: TIERED EXERCISE CARDS ───────────────────────
function makeTieredExCard(ex, i) {
  // Returns a plan card showing B/I/A tiers side by side
  const propCss = PROP_CSS[ex.prop] || 'slate';
  const partnerBadge = ex.isPartner ? '<span class="partner-badge">👥 Partner</span>' : '';
  const customBadge  = ex._custom   ? '<span class="custom-badge">⭐</span>' : '';

  const tiers = ['b','i','a'].map(tier => {
    const { reps, unit, note } = getTierDisplay(ex, tier);
    const mod = getModForTier(ex, tier);
    const hasGroup = MA.groups.find(g => g.id === tier && (g.count || 0) > 0);
    const isPick = mod.source === 'override';
    const tip = [mod.note, note].filter(Boolean).join(' · ');
    return `
      <div class="tier-col tier-col-${DIFF_COLOR[tier]}${!hasGroup ? ' tier-col-empty' : ''}">
        <div class="tier-header">
          <span class="tier-icon" aria-hidden="true">${DIFF_ICON[tier]}</span>
          <span class="tier-label">${DIFF_FULL[tier]}</span>
          ${hasGroup ? `<span class="tier-count">${hasGroup.count} ppl</span>` : '<span class="tier-count tier-count-none">—</span>'}
        </div>
        <div class="tier-move${mod.changed ? ' tier-move-changed' : ''}">${_maEsc(mod.move)}${isPick ? ' <span class="tier-pick-badge" title="Picked by you">✎</span>' : ''}</div>
        <div class="tier-reps">${_maEsc(reps)} <span class="tier-unit">${_maEsc(unit)}</span></div>
        ${tip ? `<div class="tier-mod">${_maEsc(tip)}</div>` : ''}
        <div class="tier-pick" id="tier-pick-${i}-${tier}">
          <button type="button" class="tier-change-btn" data-onclick="openTierPicker(${i},'${tier}')"
            aria-label="Change the ${DIFF_FULL[tier]} move for ${_maEsc(ex.name)}">✎ Change</button>
        </div>
      </div>`;
  }).join('');

  const card = document.createElement('div');
  card.className = 'exercise-card plan-card tiered-card';
  card.dataset.index = i;
  card.style.animationDelay = `${i * 0.04}s`;
  const sig = (ex.muscles && ex.muscles.primary) ? ex.muscles : resolveMuscles(ex);
  const muscleChips =
    sig.primary.map(id => `<span class="mg-chip mg-primary">${muscleIcon(id)} ${escapeHtml(muscleLabel(id,true))}</span>`).join('') +
    sig.secondary.map(id => `<span class="mg-chip mg-secondary">${muscleIcon(id)} ${escapeHtml(muscleLabel(id,true))}</span>`).join('');
  card.innerHTML = `
    <div class="tiered-card-top">
      <div class="plan-drag-handle">⠿</div>
      <div class="exercise-num">${i + 1}</div>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)} ${partnerBadge}${customBadge}</div>
        <div class="exercise-details">
          <span class="exercise-prop prop-${propCss}">${escapeHtml(ex.propLabel || '')}</span>
          <span class="exercise-muscle-tag">${escapeHtml(ex.muscle)}</span>
          ${ex.timed ? '<span class="timed-badge">⏱ Timed</span>' : ''}
        </div>
        <div class="mg-chip-row">${muscleChips}</div>
      </div>
      <div class="plan-card-actions">
        <button class="edit-btn" data-onclick="editPlanExercise(${i})" title="Edit" aria-label="Edit ${escapeHtml(ex.name)}">✏️</button>
        <button class="swap-btn" data-onclick="swapExercise(${i})"     title="Swap" aria-label="Swap ${escapeHtml(ex.name)}">⇄</button>
        <button class="del-btn"  data-onclick="removeExercise(${i})"   title="Remove" aria-label="Remove ${escapeHtml(ex.name)}">✕</button>
      </div>
    </div>
    <div class="tier-grid">${tiers}</div>`;
  return card;
}

// ── LIVE CLASS VIEW: 3-ZONE DISPLAY ──────────────────────────
function renderLiveClassView(stepIdx) {
  const seq = state.timer.sequence;
  if (!seq || stepIdx >= seq.length) return;
  const step = seq[stepIdx];

  // Find the exercise index from the sequence
  const exIdx = step._exIdx !== undefined ? step._exIdx : null;
  const ex = (exIdx !== null && state.workout) ? state.workout.exercises[exIdx] : null;

  const spotlight = MA.overrides[stepIdx] !== undefined ? MA.overrides[stepIdx] : MA.spotlight;

  // Update phase label
  const pPhase = document.getElementById('p-phase');
  if (pPhase) {
    pPhase.textContent = step.label;
    pPhase.className = 'p-phase-label';
    if (step.phase === 'work') pPhase.classList.add('work');
    else if (step.phase === 'rest') pPhase.classList.add('rest');
    else pPhase.classList.add('neutral');
  }

  // Update next label
  const next = seq[stepIdx + 1];
  const pNext = document.getElementById('p-next');
  if (pNext) pNext.textContent = next?.name ? `Next: ${next.name}` : (next?.label ? `Next: ${next.label}` : '');

  // Update prop tag
  const pProp = document.getElementById('p-prop');
  if (pProp) { pProp.textContent = step.prop || ''; pProp.style.display = step.prop ? 'block' : 'none'; }

  // Render tier zones
  const zonesContainer = document.getElementById('ma-live-zones');
  if (!zonesContainer) return;

  if (!MA.enabled || !ex || step.phase !== 'work') {
    // Non-MA mode or rest/warmup: show single big display
    zonesContainer.style.display = 'none';
    const pEx = document.getElementById('p-exercise');
    if (pEx) pEx.textContent = step.name || '';
    const wrap = document.getElementById('p-exercise-wrap');
    if (wrap) wrap.style.display = 'flex';
    return;
  }

  // MA mode: show tier zones
  const wrap = document.getElementById('p-exercise-wrap');
  if (wrap) wrap.style.display = 'none';
  zonesContainer.style.display = 'flex';

  const activeTiers = spotlight ? [spotlight] : ['b','i','a'];
  const workSec = step.duration;
  zonesContainer.innerHTML = activeTiers.map(tier =>
    liveZoneHtml(ex, tier, { spotlight, workSec, group: MA.groups.find(g => g.id === tier) })).join('');
}

/** One tier's live panel: that group's own move is the headline. Pure (string in → string out). */
function liveZoneHtml(ex, tier, opts = {}) {
  const g = opts.group || null;
  const { reps, unit, note } = getTierDisplay(ex, tier, opts.workSec);
  const mod = getModForTier(ex, tier);
  const isSpotlit = opts.spotlight === tier;
  const hasMembers = (g?.count || 0) > 0;
  const tip = [mod.note, note].filter(Boolean).join(' · ');
  return `
      <div class="live-zone live-zone-${DIFF_COLOR[tier]}${isSpotlit ? ' live-zone-spotlight' : ''}${!hasMembers ? ' live-zone-empty' : ''}">
        <div class="live-zone-header">
          <span class="live-zone-icon" aria-hidden="true">${DIFF_ICON[tier]}</span>
          <span class="live-zone-label">${DIFF_FULL[tier]}</span>
          ${g?.count ? `<span class="live-zone-count">${g.count} people</span>` : ''}
        </div>
        <div class="live-zone-exercise">${_maEsc(mod.move)}</div>
        ${mod.changed ? `<div class="live-zone-base">Class move: ${_maEsc(ex.name)}</div>` : ''}
        <div class="live-zone-reps">${_maEsc(reps)}</div>
        <div class="live-zone-unit">${_maEsc(unit)}</div>
        ${tip ? `<div class="live-zone-mod">${_maEsc(tip)}</div>` : ''}
        ${g?.names ? `<div class="live-zone-names">${_maEsc(g.names)}</div>` : ''}
      </div>`;
}

// ── INSTRUCTOR CONTROLS: SPOTLIGHT ───────────────────────────
function renderSpotlightControls() {
  const container = document.getElementById('ma-spotlight-controls');
  if (!container) return;
  container.innerHTML = `
    <div class="spotlight-label">Show group:</div>
    <button class="spotlight-btn ${!MA.spotlight ? 'active' : ''}" data-onclick="setSpotlight(null)" aria-pressed="${!MA.spotlight}">All</button>
    ${MA.groups.map(g => `
      <button class="spotlight-btn spotlight-btn-${g.color} ${MA.spotlight===g.id ? 'active' : ''}"
        data-onclick="setSpotlight('${g.id}')" aria-pressed="${MA.spotlight===g.id}">
        ${g.icon} ${g.label}
        ${g.count ? `<span class="spotlight-count">${g.count}</span>` : ''}
      </button>`).join('')}`;
}

function setSpotlight(tier) {
  MA.spotlight = tier;
  renderSpotlightControls();
  renderLiveClassView(state.timer.current);
  showToast(tier ? `Spotlighting ${DIFF_FULL[tier]}` : 'Showing all groups');
}

// ── PARTICIPANT SCREEN INJECTION ──────────────────────────────
function injectMALiveUI() {
  // Inject the 3-zone container into the participant screen
  const pBody = document.getElementById('p-body');
  if (!pBody) return;

  // Wrap existing exercise display
  const pExWrap = document.getElementById('p-exercise-wrap');
  if (!pExWrap) {
    const existingEx = document.getElementById('p-exercise');
    const existingProp = document.getElementById('p-prop');
    if (existingEx) {
      const wrap = document.createElement('div');
      wrap.id = 'p-exercise-wrap';
      wrap.className = 'p-exercise-wrap';
      existingEx.parentNode.insertBefore(wrap, existingEx);
      wrap.appendChild(existingEx);
      if (existingProp) wrap.appendChild(existingProp);
    }
  }

  // Add MA zones container if not present
  if (!document.getElementById('ma-live-zones')) {
    const zones = document.createElement('div');
    zones.id = 'ma-live-zones';
    zones.className = 'ma-live-zones';
    zones.style.display = 'none';
    const timerCircle = document.querySelector('.p-timer-circle');
    if (timerCircle) pBody.insertBefore(zones, timerCircle);
    else pBody.appendChild(zones);
  }
}

// ── INSTRUCTOR SCREEN INJECTION ───────────────────────────────
function injectMAInstructorUI() {
  if (!MA.enabled) return;
  const sidebar = document.querySelector('.instructor-sidebar');
  if (!sidebar) return;

  // Add spotlight controls to sidebar
  if (!document.getElementById('ma-spotlight-controls')) {
    const div = document.createElement('div');
    div.id = 'ma-spotlight-controls';
    div.className = 'ma-spotlight-controls';
    sidebar.insertBefore(div, sidebar.firstChild);
    renderSpotlightControls();
  }

  // Add group summary (rebuilt every time — counts/names may have changed since the last class)
  let summary = document.getElementById('ma-group-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'ma-group-summary';
    summary.className = 'ma-group-summary';
    sidebar.insertBefore(summary, document.getElementById('ma-spotlight-controls').nextSibling);
  }
  renderSpotlightControls();
  renderMAGroupSummary();
}

/** Instructor sidebar: who is in each tier. Safe to call any time. */
function renderMAGroupSummary() {
  const summary = document.getElementById('ma-group-summary');
  if (!summary) return;
  summary.innerHTML = MA.groups
    .filter(g => g.count > 0)
    .map(g => `<div class="ma-summary-row ma-summary-${g.color}">
      ${g.icon} <b>${g.label}</b>: ${g.count} people${g.names ? ` — ${_maEsc(g.names)}` : ''}
    </div>`).join('');
}

// ── ANNOTATE TIMER SEQUENCE WITH EXERCISE INDEX ───────────────
// (Removed: buildTimerSequence() in app.js already tags every step with
//  `_exIdx`. The old local re-derivation double-counted rest steps and
//  could point the tier zones at the wrong exercise.)

// ── PDF EXPORT: TIERED TABLE ──────────────────────────────────
function buildTieredPDFSection(exercises) {
  if (!MA.enabled) return '';
  const activeGroups = MA.groups.filter(g => g.count > 0);
  if (!activeGroups.length) return '';

  let html = `<div class="section">👥 Mixed-Ability Group Summary</div>
    <table><tr><th>Group</th><th>Count</th><th>Names / Notes</th></tr>`;
  activeGroups.forEach(g => {
    html += `<tr><td>${g.icon} ${g.label}</td><td>${g.count}</td><td>${_maEsc(g.names || '—')}</td></tr>`;
  });
  html += `</table>`;

  html += `<div class="section">⚡ Tiered Exercise Plan</div>
    <table>
      <tr><th>#</th><th>Exercise</th><th>Prop</th>
        ${activeGroups.map(g=>`<th>${g.icon} ${g.label} (${g.count})</th>`).join('')}
      </tr>`;

  exercises.forEach((ex, i) => {
    html += `<tr><td>${i+1}</td><td>${_maEsc(ex.name)}</td><td>${_maEsc(ex.propLabel || '')}</td>`;
    activeGroups.forEach(g => {
      const { reps, unit, note } = getTierDisplay(ex, g.id);
      const mod = getModForTier(ex, g.id);
      const tip = [mod.note, note].filter(Boolean).join(' · ');
      html += `<td><b>${_maEsc(mod.move)}</b><br/>${_maEsc(reps)} ${_maEsc(unit)}${tip ? `<br/><span style="font-size:10px;color:#666">${_maEsc(tip)}</span>` : ''}</td>`;
    });
    html += `</tr>`;
  });
  html += `</table>`;
  return html;
}

// ── TIERED PLAN EDITOR (called from app.js renderPlanEditor when MA enabled) ──
// renderPlanEditor returns early in MA mode, so the plan header badges are filled here.
function _maSetPlanBadges() {
  const w = state.workout;
  if (!w) return;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  try {
    if (w.styleCfg) { set('plan-style-badge', w.styleCfg.icon + ' ' + w.styleCfg.name); set('plan-style-desc', w.styleCfg.desc || ''); }
    if (typeof muscleFocus === 'function') set('plan-muscle-badge', '💪 ' + muscleFocus(state.muscle).label);
    const groups = MA.groups.filter(g => g.count > 0).map(g => `${g.icon}${g.count}`).join(' ');
    set('plan-people-badge', '👥 ' + w.participants + (groups ? ' · ' + groups : ''));
    set('plan-diff-badge', '⭐ Mixed ability');
    const stNote = document.getElementById('plan-station-note');
    if (stNote) {
      if (w.participants >= 8 && w.stationCount) { stNote.textContent = '📍 Suggested stations: ' + w.stationCount + ' (pairs share props)'; stNote.style.display = 'block'; }
      else stNote.style.display = 'none';
    }
  } catch (e) { /* header badges are cosmetic */ }
}
function renderTieredPlanEditor() {
  const { style, exercises, warmup, cooldown } = state.workout;
  _maSetPlanBadges();
  const container = document.getElementById('plan-exercises');
  container.innerHTML = '';

  if (warmup.length > 0) {
    container.appendChild(makeSectionHeader('🔥 Warm-Up', `~${state.workout.warmupDuration} min`, 'warmup-section'));
    warmup.forEach((ex, i) => container.appendChild(makePlanWarmCoolCard(ex, i, 'warmup')));
  }

  const mHeader = makeSectionHeader('⚡ Main Workout', `~${state.workout.mainDur} min`, 'main-section');
  container.appendChild(mHeader);
  const legend = document.createElement('div');
  legend.className = 'style-info-banner ma-plan-legend';
  legend.innerHTML = '<span class="sib-icon" aria-hidden="true">👥</span><span>Each column is the move that level does. Beginners never get jumping moves, and only equipment you picked is suggested. Tap <b>✎ Change</b> to choose a different move for one level.</span>';
  container.appendChild(legend);

  // MA mode: show tiered cards
  if (style === 'superset') {
    for (let i = 0; i < exercises.length; i += 2) {
      const pair = exercises.slice(i, i + 2);
      const pairDiv = document.createElement('div');
      pairDiv.className = 'superset-pair';
      pairDiv.innerHTML = `<div class="superset-label">Superset ${Math.floor(i/2)+1}</div>`;
      pair.forEach((ex, j) => pairDiv.appendChild(makeTieredExCard(ex, i + j)));
      container.appendChild(pairDiv);
    }
  } else {
    exercises.forEach((ex, i) => container.appendChild(makeTieredExCard(ex, i)));
  }

  if (cooldown.length > 0) {
    container.appendChild(makeSectionHeader('❄️ Cool-Down', '~5 min', 'cooldown-section'));
    cooldown.forEach((ex, i) => container.appendChild(makePlanWarmCoolCard(ex, i, 'cooldown')));
  }
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inject MA toggle into setup screen after participants card
  injectMASetupToggle();
});

function injectMASetupToggle() {
  // Find the duration card and inject MA panel after it
  const setupGrid = document.querySelector('.setup-grid');
  if (!setupGrid) return;

  // Create MA card
  const maCard = document.createElement('div');
  maCard.className = 'card card-wide ma-setup-card';
  maCard.id = 'ma-setup-card';
  maCard.innerHTML = `
    <h2>
      <span class="card-icon">👥</span> Mixed-Ability Mode
      <label class="ma-toggle-switch" style="margin-left:auto">
        <input type="checkbox" id="ma-toggle" aria-label="Mixed-ability mode" data-onchange="toggleMixedAbility(this)"/>
        <span class="ma-toggle-slider"></span>
      </label>
    </h2>
    <p class="ma-toggle-desc">Assign participants to Beginner / Intermediate / Advanced groups. Each group sees their own rep ranges and modifications during the workout.</p>
    <div id="ma-panel-wrap" style="display:none">
      <div id="ma-panel"></div>
    </div>`;

  // Insert before the generate button (after props card)
  setupGrid.appendChild(maCard);
}