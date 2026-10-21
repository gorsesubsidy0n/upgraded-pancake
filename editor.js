// ============================================================
//  HIIT CLASS GENERATOR V5 — editor.js
//  Exercise modal (add/edit), library screen, exercise DB
// ============================================================

// ── EXERCISE DATABASE ─────────────────────────────────────────

// ── EXERCISE MODAL ────────────────────────────────────────────
function openAddExerciseModal(presetCat, fromPlan) {
  state.modal.editTarget = null; state.modal.editIndex = null; state.modal.category = presetCat || null;
  // Only an add started from the plan screen drops the move into the open
  // plan; adding from the library just files it in the library.
  state.modal.fromPlan = fromPlan === true;
  document.getElementById('modal-title-1').textContent = '➕ Add Exercise — Step 1 of 2';
  document.getElementById('modal-title-2').textContent = '➕ Add Exercise — Step 2 of 2';
  document.getElementById('save-ex-btn').textContent = 'Save Exercise';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('step1-next').disabled = true;
  if (presetCat) {
    state.modal.category = presetCat;
    const btn = document.querySelector(`.cat-btn[data-cat="${presetCat}"]`);
    if (btn) { btn.classList.add('active'); document.getElementById('step1-next').disabled = false; }
    goToExStep2();
  } else { showModalStep(1); }
  document.getElementById('exercise-modal').style.display = 'flex';
}
function openExerciseModal(cat, existingEx) {
  state.modal.category = cat;
  state.modal.fromPlan = false;
  document.getElementById('modal-title-1').textContent = '✏️ Edit Exercise — Step 1 of 2';
  document.getElementById('modal-title-2').textContent = '✏️ Edit Exercise — Step 2 of 2';
  document.getElementById('save-ex-btn').textContent = 'Save Changes';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.cat-btn[data-cat="${cat}"]`);
  if (btn) { btn.classList.add('active'); document.getElementById('step1-next').disabled = false; }
  goToExStep2(existingEx);
  document.getElementById('exercise-modal').style.display = 'flex';
}
function closeExerciseModal() {
  document.getElementById('exercise-modal').style.display = 'none';
  state.modal.editTarget = null; state.modal.editIndex = null; state.modal.category = null; state.modal.fromPlan = false;
}
function showModalStep(n) {
  document.getElementById('modal-step-1').style.display = n===1 ? 'flex' : 'none';
  document.getElementById('modal-step-2').style.display = n===2 ? 'flex' : 'none';
}
function selectExCategory(btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); state.modal.category = btn.dataset.cat;
  document.getElementById('step1-next').disabled = false;
}
function goToExStep1() { showModalStep(1); }
function goToExStep2(existingEx) {
  const cat = state.modal.category; if (!cat) return;
  showModalStep(2);
  const body = document.getElementById('modal-step2-body'); body.innerHTML = '';
  const meta = CAT_META[cat] || { label:cat, icon:'🏋️', color:'slate' };
  const isWarmCool = cat === 'warmup' || cat === 'cooldown';
  // Every value below may be a name the instructor typed or a restored
  // backup, so it is escaped before it goes into the form's HTML.
  const v = x => escapeHtml(x == null ? '' : x);
  body.innerHTML = `<div class="modal-cat-badge cat-color-${v(meta.color)}">${v(meta.icon)} ${v(meta.label)}</div>`;

  if (isWarmCool) {
    const dur = secOf(existingEx?.duration, 30);
    body.innerHTML += `
      <div class="form-group"><label class="form-label">Exercise Name *</label>
        <input type="text" id="ex-name" class="form-input" placeholder="${cat==='warmup'?'e.g. Hip Flexor Lunge Stretch':'e.g. Pigeon Pose'}" value="${v(existingEx?.name)}"/></div>
      <div class="form-group"><label class="form-label">Duration (seconds) *</label>
        <div class="dur-chip-row">
          ${[20,30,40,60].map(s=>`<button class="dur-chip${existingEx&&dur===s?' active':''}" data-val="${s}" data-onclick="setDurChip(this)">${s}s</button>`).join('')}
        </div>
        <input type="number" id="ex-duration" class="form-input" min="5" max="600" value="${v(dur)}" style="margin-top:8px"/></div>
      <div class="form-group"><label class="form-label">Coaching Note</label>
        <input type="text" id="ex-note" class="form-input" placeholder="e.g. Each side, hold static" value="${v(existingEx?.note)}"/></div>`;
  } else {
    const focusMap = { core:[['core','Core'],['full','Full Body']], upper:[['upper','Upper'],['push','Push'],['pull','Pull'],['full','Full Body']], lower:[['lower','Lower'],['glutes','Glutes'],['full','Full Body']], glutes:[['glutes','Glutes'],['lower','Lower'],['full','Full Body']], full:[['full','Full Body'],['cardio','Cardio'],['upper','Upper'],['lower','Lower']], cardio:[['cardio','Cardio'],['full','Full Body']] };
    const focuses = focusMap[cat] || [['full','Full Body']];
    const focusOpts = focuses.map(([fv,l])=>`<option value="${fv}" ${existingEx?.focus?.[0]===fv?'selected':''}>${l}</option>`).join('');
    const propOpts = Object.entries(PROP_LABELS).map(([pv,l])=>`<option value="${v(pv)}" ${(existingEx?.prop||'bodyweight')===pv?'selected':''}>${v(l)}</option>`).join('');
    const exDiff = Array.isArray(existingEx?.difficulty) ? existingEx.difficulty : ['b','i','a'];
    const diffChecks = ['b','i','a'].map(d=>`<label class="diff-check"><input type="checkbox" name="ex-diff" value="${d}" ${exDiff.includes(d)?'checked':''}/> ${DIFF_LABEL[d]}</label>`).join('');
    const rr0 = {b:[8,10],i:[10,12],a:[12,15]};
    const rr = {};
    ['b','i','a'].forEach(d => { const r = existingEx?.repRange?.[d]; rr[d] = Array.isArray(r) && r.length === 2 ? r : rr0[d]; });
    body.innerHTML += `
      <div class="form-group"><label class="form-label">Exercise Name *</label>
        <input type="text" id="ex-name" class="form-input" placeholder="e.g. Banded Hip Thrust" value="${v(existingEx?.name)}"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Muscle Group *</label>
          <input type="text" id="ex-muscle" class="form-input" placeholder="e.g. Gluteus Maximus" value="${v(existingEx?.muscle)}"/></div>
        <div class="form-group"><label class="form-label">Primary Focus</label>
          <select id="ex-focus" class="form-input">${focusOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Equipment / Prop</label>
          <select id="ex-prop" class="form-input">${propOpts}</select></div>
        <div class="form-group"><label class="form-label">Format</label>
          <div class="radio-row">
            <label class="radio-opt"><input type="radio" name="ex-timed" value="false" ${!existingEx?.timed?'checked':''}/> Reps</label>
            <label class="radio-opt"><input type="radio" name="ex-timed" value="true"  ${existingEx?.timed?'checked':''}/> Timed</label>
          </div></div>
      </div>
      <div class="form-group"><label class="form-label">Difficulty Levels</label>
        <div class="diff-check-row">${diffChecks}</div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Reps — Beginner</label>
          <div class="rep-range-row"><input type="number" id="ex-rep-b-min" class="form-input small" value="${v(rr.b[0])}"/><span class="rep-dash">–</span><input type="number" id="ex-rep-b-max" class="form-input small" value="${v(rr.b[1])}"/></div></div>
        <div class="form-group"><label class="form-label">Reps — Intermediate</label>
          <div class="rep-range-row"><input type="number" id="ex-rep-i-min" class="form-input small" value="${v(rr.i[0])}"/><span class="rep-dash">–</span><input type="number" id="ex-rep-i-max" class="form-input small" value="${v(rr.i[1])}"/></div></div>
        <div class="form-group"><label class="form-label">Reps — Advanced</label>
          <div class="rep-range-row"><input type="number" id="ex-rep-a-min" class="form-input small" value="${v(rr.a[0])}"/><span class="rep-dash">–</span><input type="number" id="ex-rep-a-max" class="form-input small" value="${v(rr.a[1])}"/></div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Easier Modification</label>
          <input type="text" id="ex-easier" class="form-input" placeholder="e.g. Glute Bridge" value="${v(existingEx?.easier)}"/></div>
        <div class="form-group"><label class="form-label">Harder Progression</label>
          <input type="text" id="ex-harder" class="form-input" placeholder="e.g. Single-Leg Hip Thrust" value="${v(existingEx?.harder)}"/></div>
      </div>
      <div class="form-group"><label class="form-label">Coaching Notes (optional) — shown on the timer</label>
        <input type="text" id="ex-notes" class="form-input" placeholder="e.g. Keep hips square, drive through heel" value="${v(existingEx?.notes||existingEx?.cue)}"/></div>`;
  }
}
function setDurChip(btn) {
  document.querySelectorAll('.dur-chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); document.getElementById('ex-duration').value = btn.dataset.val;
}
function saveExercise() {
  const cat = state.modal.category;
  const isWarmCool = cat==='warmup'||cat==='cooldown';
  const name = document.getElementById('ex-name')?.value?.trim();
  if (!name) { showToast('Please enter an exercise name','error'); return; }
  const target = state.modal.editTarget, editIndex = state.modal.editIndex;
  const fromPlan = state.modal.fromPlan === true && !!state.workout;
  const w = state.workout;
  // Library edits are keyed by the old name, so a rename replaces the entry
  // in place instead of leaving a duplicate behind.
  const upsert = (list, entry, oldName) => {
    const key = oldName != null ? oldName : entry.name;
    let i = list.findIndex(e => e && e.name === key);
    if (i < 0) i = list.findIndex(e => e && e.name === entry.name);
    if (i >= 0) list[i] = { ...list[i], ...entry }; else list.push(entry);
    for (let j = list.length - 1; j >= 0; j--) if (j !== i && i >= 0 && list[j] && list[j].name === entry.name) list.splice(j, 1);
  };
  let planTouched = false;

  if (isWarmCool) {
    const raw = parseInt(document.getElementById('ex-duration')?.value, 10);
    const duration = Math.min(600, Math.max(5, isFinite(raw) ? raw : 30));
    const note = document.getElementById('ex-note')?.value?.trim()||'';
    const entry = { name, duration, note, _custom:true };
    const list = cat==='warmup' ? (state.customWarmup = state.customWarmup || []) : (state.customCooldown = state.customCooldown || []);
    if (target==='plan-warmup' && w?.warmup?.[editIndex]) { w.warmup[editIndex] = { ...w.warmup[editIndex], ...entry }; planTouched = true; }
    else if (target==='plan-cooldown' && w?.cooldown?.[editIndex]) { w.cooldown[editIndex] = { ...w.cooldown[editIndex], ...entry }; planTouched = true; }
    else if (target==='lib-warmup' || target==='lib-cooldown') { upsert(list, entry, editIndex); }
    else {
      upsert(list, entry);
      if (fromPlan) { (cat==='warmup' ? (w.warmup = w.warmup || []) : (w.cooldown = w.cooldown || [])).push({ ...entry }); planTouched = true; }
    }
  } else {
    const muscle = document.getElementById('ex-muscle')?.value?.trim()||'Custom';
    const focus = [document.getElementById('ex-focus')?.value||'full'];
    const prop = document.getElementById('ex-prop')?.value||'bodyweight';
    const timed = document.querySelector('input[name="ex-timed"]:checked')?.value==='true';
    const difficulty = [...document.querySelectorAll('input[name="ex-diff"]:checked')].map(i=>i.value);
    if (!difficulty.length) { showToast('Select at least one difficulty level','error'); return; }
    const num = (id, fb) => { const n = parseInt(document.getElementById(id)?.value, 10); return isFinite(n) && n > 0 ? Math.min(n, 500) : fb; };
    const pair = (lo, hi) => lo <= hi ? [lo, hi] : [hi, lo];
    const repRange = {
      b:pair(num('ex-rep-b-min',8),  num('ex-rep-b-max',10)),
      i:pair(num('ex-rep-i-min',10), num('ex-rep-i-max',12)),
      a:pair(num('ex-rep-a-min',12), num('ex-rep-a-max',15)),
    };
    const easier = document.getElementById('ex-easier')?.value?.trim()||'Easier variation';
    const harder = document.getElementById('ex-harder')?.value?.trim()||'Harder progression';
    const notes  = document.getElementById('ex-notes')?.value?.trim()||'';
    const entry = { name, muscle, focus, prop, timed, difficulty, repRange, easier, harder, notes, _custom:true };

    if (target==='plan-main' && w?.exercises?.[editIndex]) {
      w.exercises[editIndex]=buildPlanEntry(entry, w.exercises[editIndex], editIndex);
      planTouched = true;
    } else {
      if (!state.customExercises[cat]) state.customExercises[cat]=[];
      upsert(state.customExercises[cat], entry, target==='lib-main' ? editIndex : null);
      if (fromPlan) {
        const diff=w.diff;
        if (entry.difficulty.includes(diff)) {
          w.exercises.push(buildPlanEntry(entry, null, w.exercises.length));
          planTouched = true;
          if (w.style==='ygig' && w.exercises.length % 2) showToast('Tip: ygig works in pairs — add a partner move for "'+name+'".');
        } else {
          showToast(`"${name}" saved to your library, but it isn't marked ${DIFF_LABEL[diff]} so it wasn't added to this plan.`);
        }
      }
    }
  }
  if (planTouched) {
    w._edited = true;
    if (typeof renumberHundred === 'function') renumberHundred(w);
  }
  saveToStorage();
  closeExerciseModal();
  if (state.workout && planTouched) renderPlanEditor();
  if (target && String(target).startsWith('lib-') || (!planTouched && document.getElementById('library-screen')?.classList?.contains('active'))) {
    if (typeof renderLibrary === 'function') renderLibrary(state.libraryFilter);
  }
  showToast(`✅ "${name}" saved!`,'success');
}

// Turn a library entry into a plan exercise with the timing this class style
// expects. `prev` is the slot being replaced, so an edit keeps the instructor's
// custom timing and any extra fields (tier overrides, impact, cues) instead of
// silently dropping them.
function buildPlanEntry(entry, prev, idx) {
  const w = state.workout, diff = w.diff;
  const range = entry.repRange?.[diff] || [10,15];
  let reps, unit, seconds;
  switch (w.style) {
    case 'tabata':  reps='20s';    unit='work'; seconds=20; break;
    case 'circuit': reps='45s';    unit='work'; seconds=45; break;
    case 'ladder':  reps=rungRepsLabel('ladder', w);  unit='reps'; seconds=30; break;
    case 'pyramid': reps=rungRepsLabel('pyramid', w); unit='reps'; seconds=30; break;
    case 'hundred': reps=(((idx||0)+1)*10)+''; unit='reps'; seconds=Math.max(30,((idx||0)+1)*8); break;
    case 'ygig':    reps=randInt(range[0],range[1]); unit='reps'; seconds=w.ygigWorkSec||45; break;
    case 'custom':  reps=null; unit=null; seconds=null; break;
    default:        reps=randInt(range[0],range[1]); unit='reps'; seconds=40;
  }
  // Keep the slot's existing timing when the move is just being edited.
  if (prev && w.style !== 'custom' && w.style !== 'hundred' && prev.reps != null) {
    reps = prev.reps; unit = prev.unit; seconds = prev.seconds;
  }
  const built = { ...(prev || {}), ...entry, reps, unit, seconds,
    propLabel: buildPropLabel(entry),
    muscles: typeof resolveMuscles==='function' ? resolveMuscles(entry) : undefined };
  // The coaching notes field is what the timer shows as the cue.
  if (entry.notes) built.cue = entry.notes;
  if (w.style === 'custom') {
    if (prev) { built.cMode=prev.cMode; built.cWork=prev.cWork; built.cRest=prev.cRest; built.cReps=prev.cReps; }
    initCustomEx(built, customCfg(w), diff);
  }
  return built;
}

// ── EXERCISE LIBRARY ──────────────────────────────────────────
function openExerciseLibrary() { renderLibrary(state.libraryFilter); showScreen('library-screen'); }
function filterLibrary(btn) {
  document.querySelectorAll('.lib-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); state.libraryFilter=btn.dataset.filter; renderLibrary(state.libraryFilter);
}
function renderLibrary(filter) {
  const container=document.getElementById('library-list'); container.innerHTML='';
  const groups={};
  function addToGroup(cat,ex){ if(!groups[cat])groups[cat]=[]; groups[cat].push(ex); }

  if (filter==='all'||filter==='warmup') {
    WARMUP_POOL.forEach(ex=>addToGroup('warmup',{...ex,_source:'built-in'}));
    (state.customWarmup||[]).forEach(ex=>addToGroup('warmup',{...ex,_source:'custom'}));
  }
  if (filter==='all'||filter==='cooldown') {
    COOLDOWN_POOL.forEach(ex=>addToGroup('cooldown',{...ex,_source:'built-in'}));
    (state.customCooldown||[]).forEach(ex=>addToGroup('cooldown',{...ex,_source:'custom'}));
  }
  if (filter!=='warmup'&&filter!=='cooldown'&&filter!=='custom') {
    Object.entries(DB).forEach(([prop,exercises])=>{
      exercises.forEach(ex=>{
        const cat=exCat(ex);
        if(filter==='all'||filter===cat) addToGroup(cat,{...ex,prop,_source:'built-in'});
      });
    });
  }
  Object.entries(state.customExercises||{}).forEach(([cat,exercises])=>{
    (exercises||[]).forEach(ex=>{
      if(filter==='all'||filter===cat||filter==='custom') addToGroup(cat,{...ex,_source:'custom'});
    });
  });

  const catOrder=['warmup','core','upper','lower','glutes','full','cardio','cooldown'];
  const orderedGroups=catOrder.filter(c=>groups[c]).map(c=>[c,groups[c]]);
  Object.entries(groups).forEach(([c,exs])=>{ if(!catOrder.includes(c)) orderedGroups.push([c,exs]); });

  if (!orderedGroups.length) { container.innerHTML='<div class="empty-state">No exercises found.</div>'; return; }

  orderedGroups.forEach(([cat,exercises])=>{
    const meta=CAT_META[cat]||{label:cat,icon:'🏋️',color:'slate'};
    const header=document.createElement('div'); header.className='lib-group-header';
    header.innerHTML=`<span>${escapeHtml(meta.icon)} ${escapeHtml(meta.label)}</span><span class="lib-count">${exercises.length}</span>`;
    container.appendChild(header);
    exercises.forEach(ex=>{
      const card=document.createElement('div');
      card.className='lib-card'+(ex._source==='custom'?' lib-card-custom':'');
      const isWC=cat==='warmup'||cat==='cooldown';
      const propLabel=ex.prop?(PROP_LABELS[ex.prop]||ex.prop):'';
      const propCss=ex.prop?(PROP_CSS[ex.prop]||'slate'):'slate';
      const e=x=>escapeHtml(x==null?'':String(x));
      // Arguments go through JSON so names with quotes or brackets survive.
      const args=e(JSON.stringify(cat))+','+e(JSON.stringify(String(ex.name||'')));

      const actionBtns = ex._source==='custom'
        ? '<button class="lib-edit-btn" data-onclick="editLibraryExercise(' + args + ')">✏️ Edit</button>'
          + '<button class="lib-del-btn" data-onclick="deleteLibraryExercise(' + args + ')">🗑️ Delete</button>'
        : '<button class="lib-edit-btn lib-customize-btn" data-onclick="addBuiltInToCustom(' + args + ')">✏️ Customize</button>';

      card.innerHTML =
        '<div class="lib-card-body">'
        + '<div class="lib-card-top">'
        + '<div class="lib-ex-name">' + e(ex.name) + (ex._source==='custom'?'<span class="custom-badge">⭐ Custom</span>':'') + '</div>'
        + '<div class="lib-ex-meta">'
        + (isWC
            ? '<span class="lib-tag">' + e(secOf(ex.duration,30)) + 's</span><span class="lib-tag-note">' + e(ex.note) + '</span>'
            : (propLabel?'<span class="lib-tag prop-'+e(propCss)+'">'+e(propLabel)+'</span>':'')
              + '<span class="lib-tag-note">' + e(ex.muscle) + '</span>'
              + (ex.timed?'<span class="timed-badge">⏱ Timed</span>':'')
              + (Array.isArray(ex.difficulty)?'<span class="lib-diff">'+ex.difficulty.map(d=>e((DIFF_LABEL[d]||String(d))[0])).join('/')+'</span>':'')
          )
        + '</div>'
        + (!isWC&&ex.easier
            ? '<div class="lib-mods"><span class="mod-badge easier">↓ '+e(ex.easier)+'</span><span class="mod-badge harder">↑ '+e(ex.harder)+'</span></div>'
            : '')
        + '</div>'
        + '<div class="lib-card-actions-row">' + actionBtns + '</div>'
        + '</div>';
      container.appendChild(card);
    });
  });
}
// ── ADD BUILT-IN EXERCISE TO CUSTOM (opens edit modal pre-filled) ────────────
function addBuiltInToCustom(cat, name) {
  // Find the exercise in DB
  let foundEx = null;
  const isWC = cat === 'warmup' || cat === 'cooldown';
  if (isWC) {
    const pool = cat === 'warmup' ? WARMUP_POOL : COOLDOWN_POOL;
    foundEx = pool.find(e => e.name === name);
  } else {
    Object.values(DB).forEach(propArr => {
      const match = propArr.find(e => e.name === name);
      if (match && !foundEx) foundEx = match;
    });
  }
  if (!foundEx) { showToast('Exercise not found', 'error'); return; }
  state.modal.editTarget = null;
  state.modal.editIndex = null;
  state.modal.category = cat;
  openExerciseModal(cat, {...foundEx, _custom: false});
}

// ── LIBRARY EDIT / DELETE ─────────────────────────────────────
function editLibraryExercise(cat, name) {
  const isWC = cat === 'warmup' || cat === 'cooldown';
  let ex;
  if (isWC) {
    const pool = cat === 'warmup' ? state.customWarmup : state.customCooldown;
    ex = pool.find(e => e.name === name);
    state.modal.editTarget = cat === 'warmup' ? 'lib-warmup' : 'lib-cooldown';
  } else {
    ex = (state.customExercises[cat] || []).find(e => e.name === name);
    state.modal.editTarget = 'lib-main';
  }
  if (!ex) { showToast('Exercise not found', 'error'); return; }
  state.modal.editIndex = name;
  state.modal.category = cat;
  openExerciseModal(cat, ex);
}

function deleteLibraryExercise(cat, name) {
  if (!askConfirm('Delete "' + name + '" from your library? Classes that already use it keep their copy.')) return;
  const isWC = cat === 'warmup' || cat === 'cooldown';
  if (isWC) {
    if (cat === 'warmup') state.customWarmup = state.customWarmup.filter(e => e.name !== name);
    else state.customCooldown = state.customCooldown.filter(e => e.name !== name);
  } else {
    if (state.customExercises[cat]) {
      state.customExercises[cat] = state.customExercises[cat].filter(e => e.name !== name);
    }
  }
  saveToStorage();
  renderLibrary(state.libraryFilter);
  showToast('"' + name + '" deleted');
}
