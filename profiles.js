// ============================================================
//  HIIT CLASS GENERATOR V9 — profiles.js
//  Instructor profiles, class scheduling, Google Drive sync
// ============================================================

// ── EMOJI OPTIONS ─────────────────────────────────────────────
const EMOJI_OPTIONS = [
  '🌸','⚡','🔥','💪','🏋️','🎯','🌟','🦁','🐯','🦊','🐺','🦅',
  '🌈','🍀','🌙','☀️','❄️','🌊','🎲','🎸','🎤','🏆','💎','🚀',
  '🦋','🌺','🍉','🎃','🦄','🐉','🌴','🏄','🧠','💡','🥊','🔮',
];

// ── PROFILE DEFINITIONS ───────────────────────────────────────
// These run at file scope, so an unguarded throw here takes the whole file
// with it — no PROFILES, no instructor picker, no Studio View. Safari throws
// rather than returning null whenever storage is off-limits, so every one of
// them goes through IHStore.
function loadProfileIcons() {
  return IHStore.getJSON('hiit_profile_icons', {}) || {};
}
function saveProfileIcon(id, icon) {
  const icons = loadProfileIcons();
  icons[id] = icon;
  return IHStore.setJSON('hiit_profile_icons', icons);
}

const _savedIcons = loadProfileIcons();
const PROFILES = {
  kat:     { id:'kat',     name:'Kat',     icon: _savedIcons.kat     || '🌠', color:'pink'   },
  carson:  { id:'carson',  name:'Carson',  icon: _savedIcons.carson  || '⚡', color:'yellow' },
  melissa: { id:'melissa', name:'Melissa', icon: _savedIcons.melissa || '🔥', color:'orange' },
};

// Everything below that builds markup goes through these. Saved plans and
// imported files are data, and data must never become markup or code.
// app.js defines escapeHtml; the local copy keeps this file safe on its own.
function _pEsc(v) {
  if (typeof escapeHtml === 'function') return escapeHtml(v);
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// A value placed as an argument inside a click-handler attribute.
function _pArg(v) { return _pEsc(JSON.stringify(v === undefined ? null : v)); }

// Instructors can rename their card (a new colleague takes over a slot).
// Names are cleaned on the way in, so no other screen has to worry.
const PROFILE_NAME_MAX = 24;
function cleanProfileName(name) {
  return String(name == null ? '' : name).replace(/[<>"'`&\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, PROFILE_NAME_MAX);
}
function loadProfileNames() {
  const v = IHStore.getJSON('hiit_profile_names', {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
(function applySavedProfileNames() {
  const names = loadProfileNames();
  Object.keys(PROFILES).forEach(id => {
    const n = cleanProfileName(names[id]);
    if (n) PROFILES[id].name = n;
  });
  // Icons come from storage too; only short, markup-free values are kept.
  Object.keys(PROFILES).forEach(id => {
    const ic = String(PROFILES[id].icon || '');
    if (ic.length > 16 || /[<>"'`&]/.test(ic)) PROFILES[id].icon = '👤';
  });
})();

function renameProfile(profileId, rawName) {
  if (!PROFILES[profileId]) return false;
  const name = cleanProfileName(rawName);
  if (!name) { showToast('Please type a name', 'error'); return false; }
  const old = PROFILES[profileId].name;
  const names = loadProfileNames();
  names[profileId] = name;
  if (!IHStore.setJSON('hiit_profile_names', names)) {
    showToast('Could not save the new name on this device', 'error');
    return false;
  }
  PROFILES[profileId].name = name;
  closeEmojiPicker();
  renderProfileSwitcher();
  updateProfileBadge();
  const sched = document.getElementById('schedule-screen');
  if (sched && sched.classList.contains('active')) renderSchedule();
  if (old !== name) showToast(old + ' is now ' + name);
  return true;
}

function saveProfileNameFromPicker(profileId) {
  const input = document.getElementById('profile-rename-input');
  if (input) renameProfile(profileId, input.value);
}

function profileRenameKey(profileId, ev) {
  if (ev && ev.key === 'Enter') { ev.preventDefault(); saveProfileNameFromPicker(profileId); }
}

// ── PROFILE STATE ─────────────────────────────────────────────
const profileState = {
  activeProfile: IHStore.get('hiit_active_profile') || 'kat',
  // Per-profile data stored as: hiit_profile_{id}_plans
  scheduleFilter: 'all', // 'all' | profile id
};

// ── HELPERS ───────────────────────────────────────────────────
function getProfilePlans(profileId) {
  const v = IHStore.getJSON('hiit_profile_'+profileId+'_plans', []);
  return Array.isArray(v) ? v.filter(p => p && typeof p === 'object') : [];
}
function saveProfilePlans(profileId, plans) {
  return IHStore.setJSON('hiit_profile_'+profileId+'_plans', plans);
}
function getAllPlans() {
  // Returns all plans across all profiles, sorted chronologically
  const all = [];
  Object.keys(PROFILES).forEach(id => {
    getProfilePlans(id).forEach(plan => all.push({...plan, profileId: id}));
  });
  return all.sort((a,b) => new Date(a.classDateTime) - new Date(b.classDateTime));
}
function getActiveProfile() {
  return PROFILES[profileState.activeProfile] || PROFILES.kat;
}

// ── PROFILE SWITCHER UI ───────────────────────────────────────
function renderProfileSwitcher() {
  const container = document.getElementById('profile-switcher');
  if (!container) return;
  container.innerHTML = Object.values(PROFILES).map(p => `
    <div class="profile-btn-wrap">
      <button class="profile-btn profile-btn-${p.color} ${profileState.activeProfile===p.id?'active':''}"
        data-onclick="switchProfile(${_pArg(p.id)})">
        <span class="profile-icon">${_pEsc(p.icon)}</span>
        <span class="profile-name">${_pEsc(p.name)}</span>
      </button>
      <button class="profile-emoji-pick-btn" data-onclick="openEmojiPicker(${_pArg(p.id)},this)" title="Change name or emoji" aria-label="Change name or emoji for ${_pEsc(p.name)}">✏️</button>
    </div>`).join('');
}

// ── EMOJI PICKER ──────────────────────────────────────────────
let _emojiPickerTarget = null;

function openEmojiPicker(profileId, triggerBtn) {
  // Close any existing picker
  closeEmojiPicker();
  if (!PROFILES[profileId]) return;

  _emojiPickerTarget = profileId;
  const picker = document.createElement('div');
  picker.id = 'emoji-picker-popup';
  picker.className = 'emoji-picker-popup';
  picker.innerHTML =
    '<div class="emoji-picker-title">Name and emoji for ' + _pEsc(PROFILES[profileId].name) + '</div>' +
    '<div class="profile-rename-row">' +
      '<input id="profile-rename-input" class="profile-rename-input" type="text" maxlength="' + PROFILE_NAME_MAX + '"' +
        ' aria-label="Instructor name" value="' + _pEsc(PROFILES[profileId].name) + '"' +
        ' data-onkeydown="profileRenameKey(' + _pArg(profileId) + ',event)">' +
      '<button type="button" class="profile-rename-save" data-onclick="saveProfileNameFromPicker(' + _pArg(profileId) + ')">Save name</button>' +
    '</div>' +
    '<div class="emoji-picker-grid">' +
    EMOJI_OPTIONS.map(e =>
      `<button class="emoji-opt ${PROFILES[profileId].icon===e?'active':''}"
        data-onclick="selectProfileEmoji(${_pArg(profileId)},${_pArg(e)})">${_pEsc(e)}</button>`
    ).join('') +
    '</div>' +
    '<button class="emoji-picker-close" data-onclick="closeEmojiPicker()">✕ Close</button>';

  // Position near the trigger button
  const rect = triggerBtn.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 8) + 'px';
  picker.style.left = Math.max(8, rect.left - 80) + 'px';
  picker.style.zIndex = '3000';
  document.body.appendChild(picker);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', outsideEmojiClick);
  }, 10);
}

function outsideEmojiClick(e) {
  const picker = document.getElementById('emoji-picker-popup');
  if (picker && !picker.contains(e.target) && !e.target.classList.contains('profile-emoji-pick-btn')) {
    closeEmojiPicker();
  }
}

function closeEmojiPicker() {
  const picker = document.getElementById('emoji-picker-popup');
  if (picker) picker.remove();
  document.removeEventListener('click', outsideEmojiClick);
  _emojiPickerTarget = null;
}

function selectProfileEmoji(profileId, emoji) {
  PROFILES[profileId].icon = emoji;
  saveProfileIcon(profileId, emoji);
  closeEmojiPicker();
  renderProfileSwitcher();
  updateProfileBadge();
  showToast(PROFILES[profileId].name + ' is now ' + emoji);
}

function switchProfile(id) {
  if (!PROFILES[id]) return;
  if (id === profileState.activeProfile) return;
  // Switching mid-class would swap the plan out from under a running timer
  // and file the class under the wrong person.
  if (typeof state !== 'undefined' && state.timer && state.timer.isRunning) {
    showToast('Finish or stop the class before switching instructor', 'error');
    renderProfileSwitcher();
    return;
  }
  profileState.activeProfile = id;
  IHStore.set('hiit_active_profile', id);
  if (typeof setCurrentInstructorId === 'function') setCurrentInstructorId(id);
  // Their classes, not the last person's.
  if (typeof loadPersonalData === 'function') loadPersonalData();
  if (typeof Roster !== 'undefined' && Roster.load) Roster.load();
  renderProfileSwitcher();
  updateProfileBadge();
  const hs = document.getElementById('history-screen');
  if (hs && hs.classList.contains('active') && typeof showHistory === 'function') showHistory();
  showToast('Switched to ' + PROFILES[id].name + ' ' + PROFILES[id].icon);
}

// ── WHO IS TEACHING? ──────────────────────────────────────────
// The studio laptop gets handed between instructors all day. Rather than
// trusting whoever was last active, the app asks on every fresh open and
// keeps the answer only for that sitting, so nobody accidentally saves a
// class into a colleague's list or teaches from theirs.
function ihNeedsInstructorPick() {
  if (window.__ATHLETE_MODE) return false;
  if (typeof ihRole === 'function' && ihRole() !== 'instructor') return false;
  return typeof currentInstructorId === 'function' && !currentInstructorId();
}

function ihInstructorPickerMarkup() {
  const cards = Object.values(PROFILES).map(p =>
    '<button type="button" class="who-card who-' + _pEsc(p.color) + '" data-who="' + _pEsc(p.id) + '">' +
      '<span class="who-icon">' + _pEsc(p.icon) + '</span>' +
      '<span class="who-name">' + _pEsc(p.name) + '</span>' +
    '</button>').join('');
  const signOut = typeof ihSignOut === 'function'
    ? '<p class="who-hint"><button type="button" class="who-signout" data-onclick="ihSignOut()">' +
        'Not an instructor? Sign this laptop out</button></p>'
    : '';
  return '<div class="who-card-wrap">' +
      '<div class="who-title">Who\u2019s teaching?</div>' +
      '<p class="who-sub">Your saved classes and history are kept separately, ' +
        'so pick yourself before you build or teach.</p>' +
      '<div class="who-grid">' + cards + '</div>' +
      '<p class="who-hint">This laptop will forget when you close it. ' +
        'To change a name, use the \u270f\ufe0f next to it after you pick.</p>' +
      signOut +
    '</div>';
}

/** Blocks the app until an instructor identifies themselves. */
function ihMountInstructorPicker(onPick) {
  if (document.getElementById('ih-who')) return;
  const wrap = document.createElement('div');
  wrap.id = 'ih-who';
  wrap.innerHTML = ihInstructorPickerMarkup();
  document.body.appendChild(wrap);
  document.documentElement.classList.add('ih-choosing');
  wrap.addEventListener('click', e => {
    const btn = e.target.closest('[data-who]');
    if (!btn) return;
    const id = btn.getAttribute('data-who');
    if (!PROFILES[id]) return;
    wrap.remove();
    document.documentElement.classList.remove('ih-choosing');
    onPick(id);
  });
}

function updateProfileBadge() {
  const badge = document.getElementById('active-profile-badge');
  if (!badge) return;
  const p = getActiveProfile();
  badge.textContent = p.icon + ' ' + p.name;
  badge.className = 'active-profile-badge profile-badge-' + p.color;
}

// ── SAVE PLAN MODAL ───────────────────────────────────────────
function openSavePlanModal() {
  if (!state.workout) { showToast('Generate a workout first!', 'error'); return; }
  const modal = document.getElementById('save-plan-modal');
  if (!modal) return;

  // Pre-fill date with today, time with next round hour
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours()+1, 0, 0, 0);
  const timeStr = nextHour.toTimeString().slice(0,5);

  document.getElementById('plan-save-date').value = dateStr;
  document.getElementById('plan-save-time').value = timeStr;
  document.getElementById('plan-save-notes').value = '';

  // Show which profile it will save to
  const p = getActiveProfile();
  document.getElementById('plan-save-profile-label').textContent = p.icon + ' ' + p.name;
  document.getElementById('plan-save-profile-label').className = 'save-profile-label profile-badge-' + p.color;

  modal.style.display = 'flex';
}

function closeSavePlanModal() {
  const modal = document.getElementById('save-plan-modal');
  if (modal) modal.style.display = 'none';
}

function confirmSavePlan() {
  const date = document.getElementById('plan-save-date').value;
  const time = document.getElementById('plan-save-time').value;
  const notes = document.getElementById('plan-save-notes').value.trim();

  if (!date || !time) { showToast('Please enter date and time', 'error'); return; }

  const p = getActiveProfile();
  const classDateTime = date + 'T' + time;
  const displayDate = new Date(classDateTime).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
  const displayTime = new Date(classDateTime).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});

  const plan = {
    id: Date.now(),
    profileId: p.id,
    profileName: p.name,
    profileIcon: p.icon,
    classDateTime,
    displayDate,
    displayTime,
    notes,
    style: state.workout.styleCfg.name,
    styleIcon: state.workout.styleCfg.icon,
    muscle: muscleFocus(state.muscle).label,
    difficulty: DIFF_LABEL[state.workout.diff] || state.workout.diff,
    duration: state.workout.duration,
    participants: state.workout.participants,
    exerciseCount: state.workout.exercises.length,
    exerciseNames: state.workout.exercises.map(e => e.name),
    muscleLoad: muscleLoadForExercises(state.workout.exercises),
    accessoryFocus: state.workout.accessoryFocus || [],
    workout: state.workout,
    savedAt: new Date().toISOString(),
  };

  const plans = getProfilePlans(p.id);
  plans.push(plan);
  // Keep sorted by classDateTime
  plans.sort((a,b) => new Date(a.classDateTime) - new Date(b.classDateTime));
  saveProfilePlans(p.id, plans);

  closeSavePlanModal();
  showToast('✅ Plan saved for ' + p.name + ' — ' + displayDate + ' at ' + displayTime, 'success');

  // Auto-export to linked folder whenever a plan is saved
  if (typeof folderSync !== 'undefined' && folderSync.dirHandle) {
    exportToFolder();
  }
}

// ── SCHEDULE SCREEN ───────────────────────────────────────────
function showSchedule() {
  renderSchedule();
  updateFolderSyncUI();
  showScreen('schedule-screen');
}

function renderSchedule() {
  const filterBtns = document.getElementById('schedule-filter-btns');
  if (filterBtns) {
    filterBtns.innerHTML =
      `<button class="sched-filter-btn ${profileState.scheduleFilter==='all'?'active':''}" data-onclick="filterSchedule('all')">All Instructors</button>` +
      Object.values(PROFILES).map(p =>
        `<button class="sched-filter-btn sched-filter-${_pEsc(p.color)} ${profileState.scheduleFilter===p.id?'active':''}" data-onclick="filterSchedule(${_pArg(p.id)})">${_pEsc(p.icon)} ${_pEsc(p.name)}</button>`
      ).join('');
  }

  const container = document.getElementById('schedule-list');
  if (!container) return;
  container.innerHTML = '';

  let plans = getAllPlans();
  if (profileState.scheduleFilter !== 'all') {
    plans = plans.filter(p => p.profileId === profileState.scheduleFilter);
  }

  if (!plans.length) {
    container.innerHTML = '<div class="empty-state">No class plans saved yet.<br>Generate a workout and save it with a date and time.</div>';
    return;
  }

  // Group by date
  const byDate = {};
  plans.forEach(plan => {
    const d = plan.displayDate || plan.classDateTime?.split('T')[0] || 'Unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(plan);
  });

  const now = new Date();

  Object.entries(byDate).forEach(([date, datePlans]) => {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'sched-date-header';
    const planDate = new Date(datePlans[0].classDateTime);
    const isPast = planDate < now;
    const isToday = planDate.toDateString() === now.toDateString();
    dateHeader.innerHTML = `
      <span class="sched-date-label ${isToday?'sched-today':isPast?'sched-past':''}">${isToday?'📅 TODAY — ':isPast?'✓ ':'📅 '}${_pEsc(date)}</span>`;
    container.appendChild(dateHeader);

    datePlans.forEach(plan => {
      const prof = PROFILES[plan.profileId] || {};
      const card = document.createElement('div');
      card.className = `sched-card sched-card-${prof.color||'slate'} ${isPast?'sched-card-past':''}`;
      card.innerHTML = `
        <div class="sched-card-time">
          <div class="sched-time">${_pEsc(plan.displayTime || '—')}</div>
          <div class="sched-instructor">
            <span class="sched-instructor-icon">${_pEsc(prof.icon||'👤')}</span>
            <span>${_pEsc(prof.name||plan.profileName)}</span>
          </div>
        </div>
        <div class="sched-card-info">
          <div class="sched-workout-title">${_pEsc(plan.styleIcon||'')} ${_pEsc(plan.style)} — ${_pEsc(plan.muscle)}</div>
          <div class="sched-workout-meta">
            <span class="sched-tag">${_pEsc(plan.duration)} min</span>
            <span class="sched-tag">${_pEsc(plan.participants)} people</span>
            <span class="sched-tag">${_pEsc(plan.exerciseCount)} exercises</span>
            <span class="sched-tag sched-diff">${_pEsc(plan.difficulty)}</span>
          </div>
          ${plan.notes?`<div class="sched-notes">${_pEsc(plan.notes)}</div>`:''}
        </div>
        <div class="sched-card-actions">
          <button class="sched-load-btn" data-onclick="loadScheduledPlan(${_pArg(plan.id)},${_pArg(plan.profileId)})">▶ Load</button>
          <button class="sched-del-btn" data-onclick="deleteScheduledPlan(${_pArg(plan.id)},${_pArg(plan.profileId)})" aria-label="Delete this class plan">✕</button>
        </div>`;
      container.appendChild(card);
    });
  });
}

function filterSchedule(filter) {
  profileState.scheduleFilter = filter;
  renderSchedule();
}

function loadScheduledPlan(id, profileId) {
  const plans = getProfilePlans(profileId);
  const plan = plans.find(p => p.id === id);
  if (!plan || !plan.workout) { showToast('Plan not found', 'error'); return; }
  if (typeof resetTimerState === 'function') resetTimerState();
  state.workout = typeof cloneWorkout === 'function' ? cloneWorkout(plan.workout) : JSON.parse(JSON.stringify(plan.workout));
  state.muscle = plan.muscle || 'full';
  if (typeof renderMuscleFocus === 'function') renderMuscleFocus();
  renderPlanEditor();
  showScreen('plan-editor-screen');
  showToast('Loaded: ' + plan.displayDate + ' at ' + plan.displayTime);
}

// Deleting is instant (no "are you sure?" in front of a class), and an
// Undo bar keeps the plan for a few seconds in case it was the wrong one.
let _lastDeletedPlan = null;
const PLAN_UNDO_MS = 10000;

function deleteScheduledPlan(id, profileId) {
  const all = getProfilePlans(profileId);
  const idx = all.findIndex(p => p.id === id);
  if (idx < 0) { renderSchedule(); return; }
  const removed = all[idx];
  const plans = all.filter((p, i) => i !== idx);
  if (!saveProfilePlans(profileId, plans)) {
    showToast('Could not delete the plan on this device', 'error');
    return;
  }
  _lastDeletedPlan = { plan: removed, profileId, at: Date.now() };
  renderSchedule();
  showPlatformUndoBar('ih-undo-plan',
    'Deleted ' + (removed.displayDate ? removed.displayDate + ' ' : '') + (removed.displayTime || 'class plan') + '.',
    'undoDeleteScheduledPlan()', PLAN_UNDO_MS);
  // Auto-sync after delete
  if (typeof folderSync !== 'undefined' && folderSync.dirHandle) exportToFolder();
}

function undoDeleteScheduledPlan() {
  const d = _lastDeletedPlan;
  _lastDeletedPlan = null;
  closePlatformUndoBar('ih-undo-plan');
  if (!d) return;
  const plans = getProfilePlans(d.profileId);
  if (!plans.some(p => p.id === d.plan.id)) plans.push(d.plan);
  plans.sort((a,b) => new Date(a.classDateTime) - new Date(b.classDateTime));
  if (!saveProfilePlans(d.profileId, plans)) { showToast('Could not restore the plan', 'error'); return; }
  renderSchedule();
  showToast('Plan restored', 'success');
  if (typeof folderSync !== 'undefined' && folderSync.dirHandle) exportToFolder();
}

// A small bar with one Undo button. Text goes in as text, never markup.
function showPlatformUndoBar(id, text, action, ttlMs) {
  closePlatformUndoBar(id);
  const bar = document.createElement('div');
  bar.id = id;
  bar.className = 'ih-undo-bar';
  bar.setAttribute('role', 'status');
  const msg = document.createElement('span');
  msg.textContent = text;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ih-undo-btn';
  btn.textContent = 'Undo';
  btn.setAttribute('data-onclick', action);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ih-undo-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '\u2715';
  close.setAttribute('data-onclick', 'closePlatformUndoBar(' + JSON.stringify(id) + ')');
  bar.append(msg, btn, close);
  document.body.appendChild(bar);
  if (ttlMs) setTimeout(() => { if (bar.parentNode) bar.remove(); }, ttlMs);
  return bar;
}
function closePlatformUndoBar(id) {
  const b = document.getElementById(id);
  if (b) b.remove();
}



// ── EXPORT / IMPORT JSON ──────────────────────────────────────

function buildExportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    exportedBy: getActiveProfile().name,
    version: 'V10',
    profiles: {},
  };
  Object.keys(PROFILES).forEach(id => {
    data.profiles[id] = {
      profile: { ...PROFILES[id] },
      plans: getProfilePlans(id),
    };
  });
  return data;
}

function downloadJSONFile(data, fileName) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function notePlansBackup() {
  IHStore.set('hiit_last_plans_backup', new Date().toISOString());
  if (typeof updateFolderSyncUI === 'function') updateFolderSyncUI();
}

function exportPlansJSON() {
  const data = buildExportData();
  const dateStr = new Date().toISOString().split('T')[0];
  downloadJSONFile(data, 'inspire_habits_plans_' + dateStr + '.json');
  notePlansBackup();
  const totalPlans = Object.keys(PROFILES).reduce((sum, id) => sum + getProfilePlans(id).length, 0);
  showToast('📥 Exported ' + totalPlans + ' plans to JSON', 'success');
}

// "Last backup: 3 days ago" for the schedule screen.
function lastBackupText() {
  const stamps = [IHStore.get('hiit_last_plans_backup'), IHStore.get('hiit_last_backup')]
    .map(v => Date.parse(v || '')).filter(t => isFinite(t));
  if (!stamps.length) return 'Never backed up on this device — use Export JSON to keep a copy.';
  const t = Math.max(...stamps);
  const days = Math.floor((Date.now() - t) / 86400000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
  return 'Last backup: ' + when + ' (' + new Date(t).toLocaleDateString() + ')' +
    (days >= 14 ? ' — time for a fresh one.' : '');
}

function triggerImportJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        previewImport(data, file.name);
      } catch (err) {
        showToast('Invalid JSON file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function previewImport(data, fileName) {
  if (!data || typeof data !== 'object' || !data.profiles || typeof data.profiles !== 'object') {
    showToast('Invalid file format — no profiles found', 'error');
    return;
  }

  // Count plans per profile in the file
  const summary = [];
  let totalNew = 0;
  Object.entries(data.profiles).forEach(([id, profileData]) => {
    const prof = PROFILES[id];
    if (!prof || !profileData || !Array.isArray(profileData.plans)) return;
    const incoming = profileData.plans.filter(p => p && typeof p === 'object').length;
    const existing = getProfilePlans(id).length;
    summary.push({ id, prof, incoming, existing });
    totalNew += incoming;
  });

  if (totalNew === 0) {
    showToast('No plans found in this file', 'error');
    return;
  }

  // Show preview modal
  const modal = document.getElementById('import-preview-modal');
  if (!modal) return;

  document.getElementById('import-file-name').textContent = fileName;
  const exportedAt = data.exportedAt ? new Date(data.exportedAt) : null;
  document.getElementById('import-exported-at').textContent =
    exportedAt && isFinite(exportedAt) ? exportedAt.toLocaleString() : 'Unknown';

  const previewList = document.getElementById('import-preview-list');
  previewList.innerHTML = summary.map(s => `
    <div class="import-preview-row">
      <span class="import-preview-prof">${_pEsc(s.prof.icon)} ${_pEsc(s.prof.name)}</span>
      <span class="import-preview-count">${s.incoming} plan${s.incoming!==1?'s':''} in file</span>
      <span class="import-preview-existing">${s.existing} existing</span>
    </div>`).join('') +
    '<div class="import-preview-row import-preview-safety">Replace first saves a copy of your current plans, and can be undone.</div>';

  // Store data for confirm
  modal._importData = data;
  modal.style.display = 'flex';
}

function closeImportModal() {
  const modal = document.getElementById('import-preview-modal');
  if (modal) { modal.style.display = 'none'; modal._importData = null; }
}

const PLANS_BEFORE_REPLACE_KEY = 'hiit_plans_before_replace';

function confirmImport(mode) {
  // mode: 'merge' = add new, skip duplicates | 'replace' = overwrite all
  const modal = document.getElementById('import-preview-modal');
  if (!modal || !modal._importData) return;
  const data = modal._importData;
  let imported = 0, skipped = 0;

  if (mode === 'replace') {
    // Safety copy first: kept on the device for Undo, and downloaded so it
    // survives even if the browser's storage is wiped later.
    const before = buildExportData();
    before.note = 'Automatic copy made before Replace';
    const kept = IHStore.setJSON(PLANS_BEFORE_REPLACE_KEY, before);
    try {
      downloadJSONFile(before, 'inspire_habits_plans_before_replace_' +
        new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json');
    } catch (e) { /* the on-device copy is still there */ }
    if (!kept) {
      if (!confirm('This device could not keep an Undo copy (storage is full). ' +
                   'A copy was downloaded instead. Replace anyway?')) return;
    }
  }

  Object.entries(data.profiles).forEach(([id, profileData]) => {
    if (!PROFILES[id] || !profileData || !Array.isArray(profileData.plans)) return;
    const incomingPlans = profileData.plans.filter(p => p && typeof p === 'object');
    if (mode === 'replace') {
      saveProfilePlans(id, incomingPlans);
      imported += incomingPlans.length;
    } else {
      // Merge: add plans not already present (by id)
      const existing = getProfilePlans(id);
      const existingIds = new Set(existing.map(p => p.id));
      const toAdd = incomingPlans.filter(p => !existingIds.has(p.id));
      const merged = [...existing, ...toAdd].sort((a,b) => new Date(a.classDateTime) - new Date(b.classDateTime));
      saveProfilePlans(id, merged);
      imported += toAdd.length;
      skipped += incomingPlans.length - toAdd.length;
    }
  });

  closeImportModal();
  renderSchedule();
  const msg = mode === 'replace'
    ? '✅ Replaced all plans (' + imported + ' imported)'
    : '✅ Merged: ' + imported + ' added' + (skipped ? ', ' + skipped + ' duplicates skipped' : '');
  showToast(msg, 'success');
  if (mode === 'replace') {
    showPlatformUndoBar('ih-undo-import', 'Plans replaced. A copy of the old ones was downloaded.',
      'undoReplaceImport()', 30000);
  }
}

function undoReplaceImport() {
  closePlatformUndoBar('ih-undo-import');
  const before = IHStore.getJSON(PLANS_BEFORE_REPLACE_KEY, null);
  if (!before || !before.profiles) { showToast('Nothing to undo', 'error'); return; }
  Object.entries(before.profiles).forEach(([id, pd]) => {
    if (PROFILES[id] && pd && Array.isArray(pd.plans)) saveProfilePlans(id, pd.plans);
  });
  renderSchedule();
  showToast('Your previous plans are back', 'success');
  if (typeof folderSync !== 'undefined' && folderSync.dirHandle) exportToFolder();
}

// ── FOLDER SYNC (File System Access API — Chrome/Edge) ────────
const folderSync = {
  dirHandle: null,          // FileSystemDirectoryHandle
  supported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  lastExportName: null,
  lastCheckTime: IHStore.get('hiit_folder_last_check') || null,
};

// Restore folder handle across sessions using IndexedDB
const IDB_DB_NAME = 'hiit_folder_sync';
const IDB_STORE   = 'handles';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
async function saveFolderHandle(handle) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, 'syncFolder');
    await new Promise((res,rej) => { tx.oncomplete=res; tx.onerror=rej; });
  } catch(e) { console.warn('Could not persist folder handle:', e); }
}
async function loadFolderHandle() {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('syncFolder');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  } catch(e) { return null; }
}
async function clearFolderHandle() {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete('syncFolder');
  } catch(e) {}
}

// Pick a folder
async function pickSyncFolder() {
  if (!folderSync.supported) {
    showToast('Folder sync requires Chrome or Edge browser', 'error');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'hiit-sync' });
    folderSync.dirHandle = handle;
    await saveFolderHandle(handle);
    updateFolderSyncUI();
    showToast('📂 Sync folder set: ' + handle.name, 'success');
    // Auto-export immediately
    await exportToFolder();
  } catch(e) {
    if (e.name !== 'AbortError') showToast('Could not access folder: ' + e.message, 'error');
  }
}

async function verifyFolderPermission() {
  if (!folderSync.dirHandle) return false;
  try {
    const perm = await folderSync.dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    const req = await folderSync.dirHandle.requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  } catch(e) { return false; }
}

// Export JSON to the synced folder
async function exportToFolder() {
  if (!folderSync.dirHandle) {
    // Fallback to download
    exportPlansJSON();
    return;
  }
  const ok = await verifyFolderPermission();
  if (!ok) { showToast('Folder permission denied — using download instead', 'error'); exportPlansJSON(); return; }

  try {
    const data = buildExportData();
    const json = JSON.stringify(data, null, 2);
    const dateStr = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const fileName = 'inspire_habits_plans_' + dateStr + '.json';

    const fileHandle = await folderSync.dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();

    folderSync.lastExportName = fileName;
    const totalPlans = Object.keys(PROFILES).reduce((s,id)=>s+getProfilePlans(id).length,0);
    showToast('📂 Exported ' + totalPlans + ' plans → ' + folderSync.dirHandle.name + '/' + fileName, 'success');
    notePlansBackup();
  } catch(e) {
    showToast('Export to folder failed: ' + e.message, 'error');
    exportPlansJSON(); // fallback
  }
}

// Check folder for new JSON files
async function checkFolderForNewFiles() {
  if (!folderSync.dirHandle) {
    showToast('No sync folder set — click 📂 Set Folder first', 'error');
    return;
  }
  const ok = await verifyFolderPermission();
  if (!ok) { showToast('Folder permission denied', 'error'); return; }

  try {
    const jsonFiles = [];
    for await (const [name, handle] of folderSync.dirHandle.entries()) {
      if (handle.kind === 'file' && name.endsWith('.json') && name.includes('hiit')) {
        const file = await handle.getFile();
        jsonFiles.push({ name, handle, file, lastModified: file.lastModified });
      }
    }

    if (!jsonFiles.length) {
      showToast('No HIIT JSON files found in folder', 'error');
      return;
    }

    // Sort newest first
    jsonFiles.sort((a,b) => b.lastModified - a.lastModified);

    // Show file picker modal
    showFolderFilePicker(jsonFiles);
    folderSync.lastCheckTime = new Date().toISOString();
    IHStore.set('hiit_folder_last_check', folderSync.lastCheckTime);
    updateFolderSyncUI();
  } catch(e) {
    showToast('Could not read folder: ' + e.message, 'error');
  }
}

function showFolderFilePicker(files) {
  const modal = document.getElementById('folder-files-modal');
  if (!modal) return;

  const list = document.getElementById('folder-files-list');
  list.innerHTML = files.map((f, i) => {
    const date = new Date(f.lastModified);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    const isLatest = i === 0;
    return `
      <div class="folder-file-row ${isLatest?'folder-file-latest':''}">
        <div class="folder-file-info">
          <div class="folder-file-name">${_pEsc(f.name)}${isLatest?' <span class="folder-file-new-badge">Latest</span>':''}</div>
          <div class="folder-file-date">${_pEsc(dateStr)}</div>
        </div>
        <div class="folder-file-actions">
          <button class="sched-load-btn" data-onclick="importFromFolderFile(${_pArg(i)})">📥 Import</button>
        </div>
      </div>`;
  }).join('');

  // Store file refs
  modal._folderFiles = files;
  modal.style.display = 'flex';
}

async function importFromFolderFile(idx) {
  const modal = document.getElementById('folder-files-modal');
  if (!modal || !modal._folderFiles) return;
  const f = modal._folderFiles[idx];
  closeFolderFilesModal();

  try {
    const text = await f.file.text();
    const data = JSON.parse(text);
    previewImport(data, f.name);
  } catch(e) {
    showToast('Could not read file: ' + e.message, 'error');
  }
}

function closeFolderFilesModal() {
  const modal = document.getElementById('folder-files-modal');
  if (modal) { modal.style.display = 'none'; modal._folderFiles = null; }
}

async function clearSyncFolder() {
  folderSync.dirHandle = null;
  await clearFolderHandle();
  updateFolderSyncUI();
  showToast('Sync folder cleared');
}

function updateFolderSyncUI() {
  const statusEl = document.getElementById('folder-sync-status');
  const nameEl   = document.getElementById('folder-sync-name');
  const clearBtn = document.getElementById('folder-clear-btn');
  const checkBtn = document.getElementById('folder-check-btn');
  const exportFolderBtn = document.getElementById('folder-export-btn');

  if (!statusEl) return;

  if (folderSync.dirHandle) {
    statusEl.textContent = '● Folder linked';
    statusEl.className = 'folder-sync-status folder-sync-on';
    if (nameEl) nameEl.textContent = '📂 ' + folderSync.dirHandle.name;
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (checkBtn) checkBtn.style.display = 'inline-flex';
    if (exportFolderBtn) exportFolderBtn.style.display = 'inline-flex';
  } else {
    statusEl.textContent = '○ No folder linked';
    statusEl.className = 'folder-sync-status folder-sync-off';
    if (nameEl) nameEl.textContent = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (checkBtn) checkBtn.style.display = 'none';
    if (exportFolderBtn) exportFolderBtn.style.display = 'none';
  }

  if (folderSync.lastCheckTime) {
    const lastCheck = document.getElementById('folder-last-check');
    if (lastCheck) lastCheck.textContent = 'Last checked: ' + new Date(folderSync.lastCheckTime).toLocaleTimeString();
  }

  const backupEl = document.getElementById('plans-last-backup');
  if (backupEl) {
    const txt = lastBackupText();
    backupEl.textContent = txt;
    backupEl.classList.toggle('stale', /^Never|fresh one/.test(txt));
  }

  // Show/hide browser support warning
  const unsupported = document.getElementById('folder-unsupported-msg');
  if (unsupported) unsupported.style.display = folderSync.supported ? 'none' : 'block';
}

// Restore folder handle on load
async function initFolderSync() {
  if (!folderSync.supported) { updateFolderSyncUI(); return; }
  const handle = await loadFolderHandle();
  if (handle) {
    folderSync.dirHandle = handle;
    updateFolderSyncUI();
  } else {
    updateFolderSyncUI();
  }
}

// Stub functions to avoid errors from HTML references
function connectDrive() {}
function updateDriveUI() {}
function initGoogleDrive() {}
function openDriveSetupModal() {}
function closeDriveSetupModal() {}
function saveDriveClientId() {}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderProfileSwitcher();
  updateProfileBadge();
  initFolderSync();
});
// ── STUDIO VIEW ───────────────────────────────────────────────
function showStudioView() {
  renderStudioView();
  showScreen('studio-screen');
}

function renderStudioView() {
  renderStudioStats();
  renderStudioSchedule();
}

function renderStudioStats() {
  const container = document.getElementById('studio-stats');
  if (!container) return;
  container.innerHTML = '';

  Object.values(PROFILES).forEach(prof => {
    const plans = getProfilePlans(prof.id);
    const now = new Date();
    const taught = plans.filter(p => new Date(p.classDateTime) < now);
    const upcoming = plans.filter(p => new Date(p.classDateTime) >= now);

    // Most used style
    const styleCounts = {};
    plans.forEach(p => { styleCounts[p.style] = (styleCounts[p.style]||0)+1; });
    const topStyle = Object.entries(styleCounts).sort((a,b)=>b[1]-a[1])[0];

    // Most used muscle focus
    const muscleCounts = {};
    plans.forEach(p => { muscleCounts[p.muscle] = (muscleCounts[p.muscle]||0)+1; });
    const topMuscle = Object.entries(muscleCounts).sort((a,b)=>b[1]-a[1])[0];

    // Total participants taught
    const totalParticipants = taught.reduce((s,p)=>s+(Number(p.participants)||0),0);

    // Most recent class
    const lastClass = taught.sort((a,b)=>new Date(b.classDateTime)-new Date(a.classDateTime))[0];

    const card = document.createElement('div');
    card.className = 'studio-instructor-card studio-card-'+prof.color;
    card.innerHTML = `
      <div class="studio-card-header">
        <span class="studio-card-icon">${_pEsc(prof.icon)}</span>
        <div>
          <div class="studio-card-name">${_pEsc(prof.name)}</div>
          <div class="studio-card-role">Instructor</div>
        </div>
        <div class="studio-card-total">${plans.length}<span>plans</span></div>
      </div>
      <div class="studio-card-stats">
        <div class="studio-stat">
          <div class="studio-stat-val">${taught.length}</div>
          <div class="studio-stat-label">Classes Taught</div>
        </div>
        <div class="studio-stat">
          <div class="studio-stat-val">${upcoming.length}</div>
          <div class="studio-stat-label">Upcoming</div>
        </div>
        <div class="studio-stat">
          <div class="studio-stat-val">${totalParticipants}</div>
          <div class="studio-stat-label">Total Participants</div>
        </div>
      </div>
      <div class="studio-card-details">
        ${topStyle ? `<div class="studio-detail-row"><span class="studio-detail-label">Favourite Style</span><span class="studio-detail-val">${getStyleIcon(topStyle[0])} ${_pEsc(topStyle[0])} (${topStyle[1]}x)</span></div>` : ''}
        ${topMuscle ? `<div class="studio-detail-row"><span class="studio-detail-label">Top Focus</span><span class="studio-detail-val">💪 ${_pEsc(topMuscle[0])} (${topMuscle[1]}x)</span></div>` : ''}
        ${lastClass ? `<div class="studio-detail-row"><span class="studio-detail-label">Last Class</span><span class="studio-detail-val">${_pEsc(lastClass.displayDate)} at ${_pEsc(lastClass.displayTime)}</span></div>` : '<div class="studio-detail-row"><span class="studio-detail-label">Last Class</span><span class="studio-detail-val studio-no-data">No classes yet</span></div>'}
      </div>
    `;
    container.appendChild(card);
  });
}

function getStyleIcon(styleName) {
  const icons = {
    'Tabata':'🔥','AMRAP':'🔄','EMOM':'⏱️','Circuit':'⚡',
    'Ladder':'📈','Pyramid':'🔺','100 Reps':'💯','Superset':'💥','You-Go-I-Go':'🤝'
  };
  return icons[styleName] || '🏋️';
}

function renderStudioSchedule() {
  const container = document.getElementById('studio-schedule');
  if (!container) return;
  container.innerHTML = '';

  // Get all plans across all instructors
  const allPlans = getAllPlans();
  if (!allPlans.length) {
    container.innerHTML = '<div class="empty-state">No class plans saved yet across any instructor.</div>';
    return;
  }

  // Group by date
  const byDate = {};
  allPlans.forEach(plan => {
    const d = plan.displayDate || plan.classDateTime?.split('T')[0] || 'Unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(plan);
  });

  const now = new Date();

  Object.entries(byDate).forEach(([date, datePlans]) => {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'sched-date-header';
    const planDate = new Date(datePlans[0].classDateTime);
    const isPast = planDate < now;
    const isToday = planDate.toDateString() === now.toDateString();
    dateHeader.innerHTML = `<span class="sched-date-label ${isToday?'sched-today':isPast?'sched-past':''}">${isToday?'📅 TODAY — ':isPast?'✓ ':'📅 '}${_pEsc(date)}</span>`;
    container.appendChild(dateHeader);

    datePlans.forEach(plan => {
      const prof = PROFILES[plan.profileId] || {};
      const card = document.createElement('div');
      card.className = `sched-card sched-card-${prof.color||'slate'} ${isPast?'sched-card-past':''}`;
      card.innerHTML = `
        <div class="sched-card-time">
          <div class="sched-time">${_pEsc(plan.displayTime||'—')}</div>
          <div class="sched-instructor">
            <span class="sched-instructor-icon">${_pEsc(prof.icon||'👤')}</span>
            <span>${_pEsc(prof.name||plan.profileName)}</span>
          </div>
        </div>
        <div class="sched-card-info">
          <div class="sched-workout-title">${getStyleIcon(plan.style)||''} ${_pEsc(plan.style)} — ${_pEsc(plan.muscle)}</div>
          <div class="sched-workout-meta">
            <span class="sched-tag">${_pEsc(plan.duration)} min</span>
            <span class="sched-tag">${_pEsc(plan.participants)} people</span>
            <span class="sched-tag">${_pEsc(plan.exerciseCount)} exercises</span>
            <span class="sched-tag sched-diff">${_pEsc(plan.difficulty)}</span>
          </div>
          ${plan.notes?`<div class="sched-notes">${_pEsc(plan.notes)}</div>`:''}
        </div>`;
      container.appendChild(card);
    });
  });
}
