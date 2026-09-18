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
// Load saved icons from localStorage
function loadProfileIcons() {
  return JSON.parse(localStorage.getItem('hiit_profile_icons') || '{}');
}
function saveProfileIcon(id, icon) {
  const icons = loadProfileIcons();
  icons[id] = icon;
  localStorage.setItem('hiit_profile_icons', JSON.stringify(icons));
}

const _savedIcons = loadProfileIcons();
const PROFILES = {
  kat:     { id:'kat',     name:'Kat',     icon: _savedIcons.kat     || '🌸', color:'pink'   },
  carson:  { id:'carson',  name:'Carson',  icon: _savedIcons.carson  || '⚡', color:'yellow' },
  melissa: { id:'melissa', name:'Melissa', icon: _savedIcons.melissa || '🔥', color:'orange' },
};

// ── PROFILE STATE ─────────────────────────────────────────────
const profileState = {
  activeProfile: localStorage.getItem('hiit_active_profile') || 'kat',
  // Per-profile data stored as: hiit_profile_{id}_plans
  scheduleFilter: 'all', // 'all' | profile id
};

// ── HELPERS ───────────────────────────────────────────────────
function getProfilePlans(profileId) {
  return JSON.parse(localStorage.getItem('hiit_profile_'+profileId+'_plans') || '[]');
}
function saveProfilePlans(profileId, plans) {
  localStorage.setItem('hiit_profile_'+profileId+'_plans', JSON.stringify(plans));
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
        onclick="switchProfile('${p.id}')">
        <span class="profile-icon">${p.icon}</span>
        <span class="profile-name">${p.name}</span>
      </button>
      <button class="profile-emoji-pick-btn" onclick="openEmojiPicker('${p.id}',this)" title="Change emoji">✏️</button>
    </div>`).join('');
}

// ── EMOJI PICKER ──────────────────────────────────────────────
let _emojiPickerTarget = null;

function openEmojiPicker(profileId, triggerBtn) {
  // Close any existing picker
  closeEmojiPicker();

  _emojiPickerTarget = profileId;
  const picker = document.createElement('div');
  picker.id = 'emoji-picker-popup';
  picker.className = 'emoji-picker-popup';
  picker.innerHTML =
    '<div class="emoji-picker-title">Choose emoji for ' + PROFILES[profileId].name + '</div>' +
    '<div class="emoji-picker-grid">' +
    EMOJI_OPTIONS.map(e =>
      `<button class="emoji-opt ${PROFILES[profileId].icon===e?'active':''}"
        onclick="selectProfileEmoji('${profileId}','${e}')">${e}</button>`
    ).join('') +
    '</div>' +
    '<button class="emoji-picker-close" onclick="closeEmojiPicker()">✕ Close</button>';

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
  profileState.activeProfile = id;
  localStorage.setItem('hiit_active_profile', id);
  renderProfileSwitcher();
  updateProfileBadge();
  showToast('Switched to ' + PROFILES[id].name + ' ' + PROFILES[id].icon);
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
    muscle: MUSCLE_FOCUS[state.muscle]?.label || state.muscle,
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
  showScreen('schedule-screen');
}

function renderSchedule() {
  const filterBtns = document.getElementById('schedule-filter-btns');
  if (filterBtns) {
    filterBtns.innerHTML =
      `<button class="sched-filter-btn ${profileState.scheduleFilter==='all'?'active':''}" onclick="filterSchedule('all')">All Instructors</button>` +
      Object.values(PROFILES).map(p =>
        `<button class="sched-filter-btn sched-filter-${p.color} ${profileState.scheduleFilter===p.id?'active':''}" onclick="filterSchedule('${p.id}')">${p.icon} ${p.name}</button>`
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
      <span class="sched-date-label ${isToday?'sched-today':isPast?'sched-past':''}">${isToday?'📅 TODAY — ':isPast?'✓ ':'📅 '}${date}</span>`;
    container.appendChild(dateHeader);

    datePlans.forEach(plan => {
      const prof = PROFILES[plan.profileId] || {};
      const card = document.createElement('div');
      card.className = `sched-card sched-card-${prof.color||'slate'} ${isPast?'sched-card-past':''}`;
      card.innerHTML = `
        <div class="sched-card-time">
          <div class="sched-time">${plan.displayTime || '—'}</div>
          <div class="sched-instructor">
            <span class="sched-instructor-icon">${prof.icon||'👤'}</span>
            <span>${prof.name||plan.profileName}</span>
          </div>
        </div>
        <div class="sched-card-info">
          <div class="sched-workout-title">${plan.styleIcon||''} ${plan.style} — ${plan.muscle}</div>
          <div class="sched-workout-meta">
            <span class="sched-tag">${plan.duration} min</span>
            <span class="sched-tag">${plan.participants} people</span>
            <span class="sched-tag">${plan.exerciseCount} exercises</span>
            <span class="sched-tag sched-diff">${plan.difficulty}</span>
          </div>
          ${plan.notes?`<div class="sched-notes">${plan.notes}</div>`:''}
        </div>
        <div class="sched-card-actions">
          <button class="sched-load-btn" onclick="loadScheduledPlan(${plan.id},'${plan.profileId}')">▶ Load</button>
          <button class="sched-del-btn" onclick="deleteScheduledPlan(${plan.id},'${plan.profileId}')">✕</button>
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
  state.workout = plan.workout;
  state.muscle = plan.muscle || 'full';
  renderPlanEditor();
  showScreen('plan-editor-screen');
  showToast('Loaded: ' + plan.displayDate + ' at ' + plan.displayTime);
}

function deleteScheduledPlan(id, profileId) {
  if (!confirm('Delete this class plan?')) return;
  const plans = getProfilePlans(profileId).filter(p => p.id !== id);
  saveProfilePlans(profileId, plans);
  renderSchedule();
  showToast('Plan deleted');
  // Auto-sync after delete
  if (typeof folderSync !== 'undefined' && folderSync.dirHandle) exportToFolder();
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

function exportPlansJSON() {
  const data = buildExportData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = 'inspire_habits_plans_' + dateStr + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const totalPlans = Object.keys(PROFILES).reduce((sum, id) => sum + getProfilePlans(id).length, 0);
  showToast('📥 Exported ' + totalPlans + ' plans to JSON', 'success');
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
  if (!data.profiles) {
    showToast('Invalid file format — no profiles found', 'error');
    return;
  }

  // Count plans per profile in the file
  const summary = [];
  let totalNew = 0;
  Object.entries(data.profiles).forEach(([id, profileData]) => {
    const prof = PROFILES[id];
    if (!prof || !profileData.plans) return;
    const incoming = profileData.plans.length;
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
  document.getElementById('import-exported-at').textContent =
    data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'Unknown';

  const previewList = document.getElementById('import-preview-list');
  previewList.innerHTML = summary.map(s => `
    <div class="import-preview-row">
      <span class="import-preview-prof">${s.prof.icon} ${s.prof.name}</span>
      <span class="import-preview-count">${s.incoming} plan${s.incoming!==1?'s':''} in file</span>
      <span class="import-preview-existing">${s.existing} existing</span>
    </div>`).join('');

  // Store data for confirm
  modal._importData = data;
  modal.style.display = 'flex';
}

function closeImportModal() {
  const modal = document.getElementById('import-preview-modal');
  if (modal) { modal.style.display = 'none'; modal._importData = null; }
}

function confirmImport(mode) {
  // mode: 'merge' = add new, skip duplicates | 'replace' = overwrite all
  const modal = document.getElementById('import-preview-modal');
  if (!modal || !modal._importData) return;
  const data = modal._importData;
  let imported = 0, skipped = 0;

  Object.entries(data.profiles).forEach(([id, profileData]) => {
    if (!PROFILES[id] || !profileData.plans) return;
    if (mode === 'replace') {
      saveProfilePlans(id, profileData.plans);
      imported += profileData.plans.length;
    } else {
      // Merge: add plans not already present (by id)
      const existing = getProfilePlans(id);
      const existingIds = new Set(existing.map(p => p.id));
      const toAdd = profileData.plans.filter(p => !existingIds.has(p.id));
      const merged = [...existing, ...toAdd].sort((a,b) => new Date(a.classDateTime) - new Date(b.classDateTime));
      saveProfilePlans(id, merged);
      imported += toAdd.length;
      skipped += profileData.plans.length - toAdd.length;
    }
  });

  closeImportModal();
  renderSchedule();
  const msg = mode === 'replace'
    ? '✅ Replaced all plans (' + imported + ' imported)'
    : '✅ Merged: ' + imported + ' added' + (skipped ? ', ' + skipped + ' duplicates skipped' : '');
  showToast(msg, 'success');
}

// ── FOLDER SYNC (File System Access API — Chrome/Edge) ────────
const folderSync = {
  dirHandle: null,          // FileSystemDirectoryHandle
  supported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  lastExportName: null,
  lastCheckTime: localStorage.getItem('hiit_folder_last_check') || null,
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
    updateFolderSyncUI();
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
    localStorage.setItem('hiit_folder_last_check', folderSync.lastCheckTime);
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
          <div class="folder-file-name">${f.name}${isLatest?' <span class="folder-file-new-badge">Latest</span>':''}</div>
          <div class="folder-file-date">${dateStr}</div>
        </div>
        <div class="folder-file-actions">
          <button class="sched-load-btn" onclick="importFromFolderFile(${i})">📥 Import</button>
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
    const totalParticipants = taught.reduce((s,p)=>s+(p.participants||0),0);

    // Most recent class
    const lastClass = taught.sort((a,b)=>new Date(b.classDateTime)-new Date(a.classDateTime))[0];

    const card = document.createElement('div');
    card.className = 'studio-instructor-card studio-card-'+prof.color;
    card.innerHTML = `
      <div class="studio-card-header">
        <span class="studio-card-icon">${prof.icon}</span>
        <div>
          <div class="studio-card-name">${prof.name}</div>
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
        ${topStyle ? `<div class="studio-detail-row"><span class="studio-detail-label">Favourite Style</span><span class="studio-detail-val">${getStyleIcon(topStyle[0])} ${topStyle[0]} (${topStyle[1]}x)</span></div>` : ''}
        ${topMuscle ? `<div class="studio-detail-row"><span class="studio-detail-label">Top Focus</span><span class="studio-detail-val">💪 ${topMuscle[0]} (${topMuscle[1]}x)</span></div>` : ''}
        ${lastClass ? `<div class="studio-detail-row"><span class="studio-detail-label">Last Class</span><span class="studio-detail-val">${lastClass.displayDate} at ${lastClass.displayTime}</span></div>` : '<div class="studio-detail-row"><span class="studio-detail-label">Last Class</span><span class="studio-detail-val studio-no-data">No classes yet</span></div>'}
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
    dateHeader.innerHTML = `<span class="sched-date-label ${isToday?'sched-today':isPast?'sched-past':''}">${isToday?'📅 TODAY — ':isPast?'✓ ':'📅 '}${date}</span>`;
    container.appendChild(dateHeader);

    datePlans.forEach(plan => {
      const prof = PROFILES[plan.profileId] || {};
      const card = document.createElement('div');
      card.className = `sched-card sched-card-${prof.color||'slate'} ${isPast?'sched-card-past':''}`;
      card.innerHTML = `
        <div class="sched-card-time">
          <div class="sched-time">${plan.displayTime||'—'}</div>
          <div class="sched-instructor">
            <span class="sched-instructor-icon">${prof.icon||'👤'}</span>
            <span>${prof.name||plan.profileName}</span>
          </div>
        </div>
        <div class="sched-card-info">
          <div class="sched-workout-title">${getStyleIcon(plan.style)||''} ${plan.style} — ${plan.muscle}</div>
          <div class="sched-workout-meta">
            <span class="sched-tag">${plan.duration} min</span>
            <span class="sched-tag">${plan.participants} people</span>
            <span class="sched-tag">${plan.exerciseCount} exercises</span>
            <span class="sched-tag sched-diff">${plan.difficulty}</span>
          </div>
          ${plan.notes?`<div class="sched-notes">${plan.notes}</div>`:''}
        </div>`;
      container.appendChild(card);
    });
  });
}
