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

function getTierDisplay(ex, tier) {
  // Returns { reps, unit, note } for a given tier
  const range = ex.repRange?.[tier] || [10, 15];
  let reps, unit;
  switch (state.workout?.style) {
    case 'tabata':   reps = '20s';  unit = 'work'; break;
    case 'circuit':  reps = '45s';  unit = 'work'; break;
    case 'ladder':   reps = '5→20'; unit = 'reps'; break;
    default:
      reps = `${range[0]}–${range[1]}`; unit = 'reps';
  }
  return { reps, unit };
}

function getModForTier(ex, tier) {
  // Returns the appropriate modification suggestion for a tier
  if (tier === 'b') return { label: 'Use:', value: ex.easier || '—' };
  if (tier === 'a') return { label: 'Progress:', value: ex.harder || '—' };
  return { label: 'Standard', value: ex.name };
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
    try { this.people = JSON.parse(localStorage.getItem(this.key()) || '[]'); }
    catch (e) { this.people = []; }
    this.loaded = true;
    return this.people;
  },
  save() {
    try { localStorage.setItem(this.key(), JSON.stringify(this.people)); } catch (e) {}
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
  state.participants = present.length;
  const pInput = document.getElementById('participants-input');
  if (pInput) pInput.value = present.length;
  if (typeof updateStationNote === 'function') updateStationNote();
  renderMixedAbilityPanel();
  showToast('✓ ' + present.length + ' checked in — tiers filled from the roster');
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
        <button class="roster-check" onclick="toggleRosterPresent('${p.id}')" title="Check in / out">${p.present ? '✅' : '⬜'}</button>
        <span class="roster-name">${escapeHtml(p.name)}</span>
        <select class="roster-tier roster-tier-${DIFF_COLOR[p.tier]}" onchange="setRosterTier('${p.id}',this.value)" title="Ability tier — remembered between classes">
          ${MA.groups.map(g => `<option value="${g.id}" ${p.tier === g.id ? 'selected' : ''}>${g.icon} ${g.label}</option>`).join('')}
        </select>
        <span class="roster-stat" title="Classes in the last 30 days">${streak}×/30d</span>
        <span class="roster-last">${last}</span>
        <button class="roster-del" onclick="removeRosterPerson('${p.id}')" title="Remove from roster">✕</button>
      </div>`;
    }).join('');

  return `<div class="roster-block">
    <div class="roster-header">
      <span class="roster-title">👥 Roster &amp; Attendance</span>
      <span class="roster-count">${present.length} of ${people.length} checked in</span>
    </div>
    <div class="roster-add">
      <input type="text" class="form-input" id="roster-new-name" placeholder="Add names (comma-separated)"
             onkeydown="if(event.key==='Enter'){event.preventDefault();addRosterPerson();}"/>
      <select class="form-input roster-new-tier" id="roster-new-tier">
        ${MA.groups.map(g => `<option value="${g.id}" ${g.id === 'i' ? 'selected' : ''}>${g.icon} ${g.label}</option>`).join('')}
      </select>
      <button class="ma-quick-btn" onclick="addRosterPerson()">+ Add</button>
    </div>
    ${people.length
      ? `<div class="roster-list">${rows}</div>
         <div class="roster-actions">
           <button class="ma-quick-btn" onclick="checkInAll()">Check in all</button>
           <button class="ma-quick-btn" onclick="checkInNone()">Clear</button>
           <button class="ma-quick-btn primary" onclick="applyRosterToGroups()">→ Fill tiers from check-in</button>
         </div>`
      : `<div class="roster-empty">No one on the roster yet. Add your regulars once and their tier is remembered every class.</div>`}
  </div>`;
}

function renderMixedAbilityPanel() {
  const panel = document.getElementById('ma-panel');
  if (!panel) return;

  const total = MA.groups.reduce((s, g) => s + (parseInt(g.count) || 0), 0);
  const remaining = state.participants - total;

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
              <label class="ma-field-label">Number of people</label>
              <div class="ma-count-row">
                <button class="ma-count-btn" onclick="changeGroupCount('${g.id}',-1)">−</button>
                <input type="number" class="ma-count-input" id="ma-count-${g.id}"
                  min="0" max="${state.participants}" value="${g.count || 0}"
                  onchange="setGroupCount('${g.id}',this.value)"/>
                <button class="ma-count-btn" onclick="changeGroupCount('${g.id}',1)">+</button>
              </div>
            </div>
            <div class="ma-field">
              <label class="ma-field-label">Names / Notes (optional)</label>
              <input type="text" class="form-input ma-names-input" id="ma-names-${g.id}"
                placeholder="e.g. Sarah, Tom, Alex"
                value="${g.names || ''}"
                onchange="setGroupNames('${g.id}',this.value)"/>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div class="ma-quick-split">
      <span class="ma-quick-label">Quick split:</span>
      <button class="ma-quick-btn" onclick="quickSplit('equal')">Equal thirds</button>
      <button class="ma-quick-btn" onclick="quickSplit('pyramid')">Pyramid (25/50/25)</button>
      <button class="ma-quick-btn" onclick="quickSplit('beginner-heavy')">Beginner-heavy (50/30/20)</button>
      <button class="ma-quick-btn" onclick="quickSplit('advanced-heavy')">Advanced-heavy (20/30/50)</button>
    </div>`;
}

function changeGroupCount(id, delta) {
  const g = MA.groups.find(g => g.id === id);
  if (!g) return;
  g.count = Math.max(0, Math.min(state.participants, (parseInt(g.count) || 0) + delta));
  renderMixedAbilityPanel();
}
function setGroupCount(id, val) {
  const g = MA.groups.find(g => g.id === id);
  if (!g) return;
  g.count = Math.max(0, Math.min(state.participants, parseInt(val) || 0));
  renderMixedAbilityPanel();
}
function setGroupNames(id, val) {
  const g = MA.groups.find(g => g.id === id);
  if (g) g.names = val;
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
}

function toggleMixedAbility(checkbox) {
  MA.enabled = checkbox.checked;
  const panel = document.getElementById('ma-panel-wrap');
  if (panel) panel.style.display = MA.enabled ? 'block' : 'none';
  if (MA.enabled) renderMixedAbilityPanel();
}

// ── PLAN EDITOR: TIERED EXERCISE CARDS ───────────────────────
function makeTieredExCard(ex, i) {
  // Returns a plan card showing B/I/A tiers side by side
  const propCss = PROP_CSS[ex.prop] || 'slate';
  const partnerBadge = ex.isPartner ? '<span class="partner-badge">👥 Partner</span>' : '';
  const customBadge  = ex._custom   ? '<span class="custom-badge">⭐</span>' : '';

  const tiers = ['b','i','a'].map(tier => {
    const { reps, unit } = getTierDisplay(ex, tier);
    const mod = getModForTier(ex, tier);
    const hasGroup = MA.groups.find(g => g.id === tier && (g.count || 0) > 0);
    return `
      <div class="tier-col tier-col-${DIFF_COLOR[tier]}${!hasGroup ? ' tier-col-empty' : ''}">
        <div class="tier-header">
          <span class="tier-icon">${DIFF_ICON[tier]}</span>
          <span class="tier-label">${DIFF_FULL[tier]}</span>
          ${hasGroup ? `<span class="tier-count">${hasGroup.count} ppl</span>` : '<span class="tier-count tier-count-none">—</span>'}
        </div>
        <div class="tier-reps">${reps}</div>
        <div class="tier-unit">${unit}</div>
        <div class="tier-mod">
          <span class="tier-mod-label">${mod.label}</span>
          <span class="tier-mod-value">${mod.value}</span>
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
          <span class="exercise-prop prop-${propCss}">${ex.propLabel}</span>
          <span class="exercise-muscle-tag">${escapeHtml(ex.muscle)}</span>
          ${ex.timed ? '<span class="timed-badge">⏱ Timed</span>' : ''}
        </div>
        <div class="mg-chip-row">${muscleChips}</div>
      </div>
      <div class="plan-card-actions">
        <button class="edit-btn" onclick="editPlanExercise(${i})" title="Edit">✏️</button>
        <button class="swap-btn" onclick="swapExercise(${i})"     title="Swap">⇄</button>
        <button class="del-btn"  onclick="removeExercise(${i})"   title="Remove">✕</button>
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
  zonesContainer.innerHTML = activeTiers.map(tier => {
    const g = MA.groups.find(g => g.id === tier);
    const { reps, unit } = getTierDisplay(ex, tier);
    const mod = getModForTier(ex, tier);
    const isSpotlit = spotlight === tier;
    const hasMembers = (g?.count || 0) > 0;
    return `
      <div class="live-zone live-zone-${DIFF_COLOR[tier]}${isSpotlit ? ' live-zone-spotlight' : ''}${!hasMembers ? ' live-zone-empty' : ''}">
        <div class="live-zone-header">
          <span class="live-zone-icon">${DIFF_ICON[tier]}</span>
          <span class="live-zone-label">${DIFF_FULL[tier]}</span>
          ${g?.count ? `<span class="live-zone-count">${g.count} people</span>` : ''}
        </div>
        <div class="live-zone-exercise">${ex.name}</div>
        <div class="live-zone-reps">${reps}</div>
        <div class="live-zone-unit">${unit}</div>
        ${tier !== 'i' ? `<div class="live-zone-mod">${mod.label} <b>${mod.value}</b></div>` : ''}
        ${g?.names ? `<div class="live-zone-names">${g.names}</div>` : ''}
      </div>`;
  }).join('');
}

// ── INSTRUCTOR CONTROLS: SPOTLIGHT ───────────────────────────
function renderSpotlightControls() {
  const container = document.getElementById('ma-spotlight-controls');
  if (!container) return;
  container.innerHTML = `
    <div class="spotlight-label">Show group:</div>
    <button class="spotlight-btn ${!MA.spotlight ? 'active' : ''}" onclick="setSpotlight(null)">All</button>
    ${MA.groups.map(g => `
      <button class="spotlight-btn spotlight-btn-${g.color} ${MA.spotlight===g.id ? 'active' : ''}"
        onclick="setSpotlight('${g.id}')">
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

  // Add group summary
  if (!document.getElementById('ma-group-summary')) {
    const summary = document.createElement('div');
    summary.id = 'ma-group-summary';
    summary.className = 'ma-group-summary';
    summary.innerHTML = MA.groups
      .filter(g => g.count > 0)
      .map(g => `<div class="ma-summary-row ma-summary-${g.color}">
        ${g.icon} <b>${g.label}</b>: ${g.count} people${g.names ? ` — ${g.names}` : ''}
      </div>`).join('');
    sidebar.insertBefore(summary, document.getElementById('ma-spotlight-controls').nextSibling);
  }
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
    html += `<tr><td>${g.icon} ${g.label}</td><td>${g.count}</td><td>${g.names || '—'}</td></tr>`;
  });
  html += `</table>`;

  html += `<div class="section">⚡ Tiered Exercise Plan</div>
    <table>
      <tr><th>#</th><th>Exercise</th><th>Prop</th>
        ${activeGroups.map(g=>`<th>${g.icon} ${g.label} (${g.count})</th>`).join('')}
      </tr>`;

  exercises.forEach((ex, i) => {
    html += `<tr><td>${i+1}</td><td>${ex.name}</td><td>${ex.propLabel}</td>`;
    activeGroups.forEach(g => {
      const { reps, unit } = getTierDisplay(ex, g.id);
      const mod = getModForTier(ex, g.id);
      html += `<td><b>${reps} ${unit}</b><br/><span style="font-size:10px;color:#888">${mod.label}: ${mod.value}</span></td>`;
    });
    html += `</tr>`;
  });
  html += `</table>`;
  return html;
}

// ── TIERED PLAN EDITOR (called from app.js renderPlanEditor when MA enabled) ──
function renderTieredPlanEditor() {
  const { style, exercises, warmup, cooldown } = state.workout;
  const container = document.getElementById('plan-exercises');
  container.innerHTML = '';

  if (warmup.length > 0) {
    container.appendChild(makeSectionHeader('🔥 Warm-Up', `~${state.workout.warmupDuration} min`, 'warmup-section'));
    warmup.forEach((ex, i) => container.appendChild(makePlanWarmCoolCard(ex, i, 'warmup')));
  }

  const mHeader = makeSectionHeader('⚡ Main Workout', `~${state.workout.mainDur} min`, 'main-section');
  container.appendChild(mHeader);

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
        <input type="checkbox" id="ma-toggle" onchange="toggleMixedAbility(this)"/>
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