// ============================================================
//  HIIT CLASS GENERATOR V5 — editor.js
//  Exercise modal (add/edit), library screen, exercise DB
// ============================================================

// ── EXERCISE DATABASE ─────────────────────────────────────────

// ── EXERCISE MODAL ────────────────────────────────────────────
function openAddExerciseModal(presetCat) {
  state.modal.editTarget = null; state.modal.editIndex = null; state.modal.category = presetCat || null;
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
  state.modal.editTarget = null; state.modal.editIndex = null; state.modal.category = null;
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
  body.innerHTML = `<div class="modal-cat-badge cat-color-${meta.color}">${meta.icon} ${meta.label}</div>`;

  if (isWarmCool) {
    body.innerHTML += `
      <div class="form-group"><label class="form-label">Exercise Name *</label>
        <input type="text" id="ex-name" class="form-input" placeholder="${cat==='warmup'?'e.g. Hip Flexor Lunge Stretch':'e.g. Pigeon Pose'}" value="${existingEx?.name||''}"/></div>
      <div class="form-group"><label class="form-label">Duration (seconds) *</label>
        <div class="dur-chip-row">
          ${[20,30,40,60].map(v=>`<button class="dur-chip${existingEx?.duration===v?' active':''}" data-val="${v}" onclick="setDurChip(this)">${v}s</button>`).join('')}
        </div>
        <input type="number" id="ex-duration" class="form-input" min="10" max="120" value="${existingEx?.duration||30}" style="margin-top:8px"/></div>
      <div class="form-group"><label class="form-label">Coaching Note</label>
        <input type="text" id="ex-note" class="form-input" placeholder="e.g. Each side, hold static" value="${existingEx?.note||''}"/></div>`;
  } else {
    const focusMap = { core:[['core','Core'],['full','Full Body']], upper:[['upper','Upper'],['push','Push'],['pull','Pull'],['full','Full Body']], lower:[['lower','Lower'],['glutes','Glutes'],['full','Full Body']], glutes:[['glutes','Glutes'],['lower','Lower'],['full','Full Body']], full:[['full','Full Body'],['cardio','Cardio'],['upper','Upper'],['lower','Lower']], cardio:[['cardio','Cardio'],['full','Full Body']] };
    const focuses = focusMap[cat] || [['full','Full Body']];
    const focusOpts = focuses.map(([v,l])=>`<option value="${v}" ${existingEx?.focus?.[0]===v?'selected':''}>${l}</option>`).join('');
    const propOpts = Object.entries(PROP_LABELS).map(([v,l])=>`<option value="${v}" ${(existingEx?.prop||'bodyweight')===v?'selected':''}>${l}</option>`).join('');
    const diffChecks = ['b','i','a'].map(d=>`<label class="diff-check"><input type="checkbox" name="ex-diff" value="${d}" ${!existingEx||existingEx.difficulty.includes(d)?'checked':''}/> ${DIFF_LABEL[d]}</label>`).join('');
    const rr = existingEx?.repRange || {b:[8,10],i:[10,12],a:[12,15]};
    body.innerHTML += `
      <div class="form-group"><label class="form-label">Exercise Name *</label>
        <input type="text" id="ex-name" class="form-input" placeholder="e.g. Banded Hip Thrust" value="${existingEx?.name||''}"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Muscle Group *</label>
          <input type="text" id="ex-muscle" class="form-input" placeholder="e.g. Gluteus Maximus" value="${existingEx?.muscle||''}"/></div>
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
          <div class="rep-range-row"><input type="number" id="ex-rep-b-min" class="form-input small" value="${rr.b[0]}"/><span class="rep-dash">–</span><input type="number" id="ex-rep-b-max" class="form-input small" value="${rr.b[1]}"/></div></div>
        <div class="form-group"><label class="form-label">Reps — Intermediate</label>
          <div class="rep-range-row"><input type="number" id="ex-rep-i-min" class="form-input small" value="${rr.i[0]}"/><span class="rep-dash">–</span><input type="number" id="ex-rep-i-max" class="form-input small" value="${rr.i[1]}"/></div></div>
        <div class="form-group"><label class="form-label">Reps — Advanced</label>
          <div class="rep-range-row"><input type="number" id="ex-rep-a-min" class="form-input small" value="${rr.a[0]}"/><span class="rep-dash">–</span><input type="number" id="ex-rep-a-max" class="form-input small" value="${rr.a[1]}"/></div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Easier Modification</label>
          <input type="text" id="ex-easier" class="form-input" placeholder="e.g. Glute Bridge" value="${existingEx?.easier||''}"/></div>
        <div class="form-group"><label class="form-label">Harder Progression</label>
          <input type="text" id="ex-harder" class="form-input" placeholder="e.g. Single-Leg Hip Thrust" value="${existingEx?.harder||''}"/></div>
      </div>
      <div class="form-group"><label class="form-label">Coaching Notes (optional)</label>
        <input type="text" id="ex-notes" class="form-input" placeholder="e.g. Keep hips square, drive through heel" value="${existingEx?.notes||''}"/></div>`;
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

  if (isWarmCool) {
    const duration = parseInt(document.getElementById('ex-duration')?.value)||30;
    const note = document.getElementById('ex-note')?.value?.trim()||'';
    const entry = { name, duration, note, _custom:true };
    if (state.modal.editTarget==='plan-warmup') { state.workout.warmup[state.modal.editIndex]=entry; }
    else if (state.modal.editTarget==='plan-cooldown') { state.workout.cooldown[state.modal.editIndex]=entry; }
    else if (cat==='warmup') { state.customWarmup.push(entry); if(state.workout)state.workout.warmup.push(entry); }
    else { state.customCooldown.push(entry); if(state.workout)state.workout.cooldown.push(entry); }
  } else {
    const muscle = document.getElementById('ex-muscle')?.value?.trim()||'Custom';
    const focus = [document.getElementById('ex-focus')?.value||'full'];
    const prop = document.getElementById('ex-prop')?.value||'bodyweight';
    const timed = document.querySelector('input[name="ex-timed"]:checked')?.value==='true';
    const difficulty = [...document.querySelectorAll('input[name="ex-diff"]:checked')].map(i=>i.value);
    if (!difficulty.length) { showToast('Select at least one difficulty level','error'); return; }
    const repRange = {
      b:[parseInt(document.getElementById('ex-rep-b-min')?.value)||8, parseInt(document.getElementById('ex-rep-b-max')?.value)||10],
      i:[parseInt(document.getElementById('ex-rep-i-min')?.value)||10,parseInt(document.getElementById('ex-rep-i-max')?.value)||12],
      a:[parseInt(document.getElementById('ex-rep-a-min')?.value)||12,parseInt(document.getElementById('ex-rep-a-max')?.value)||15],
    };
    const easier = document.getElementById('ex-easier')?.value?.trim()||'Easier variation';
    const harder = document.getElementById('ex-harder')?.value?.trim()||'Harder progression';
    const notes  = document.getElementById('ex-notes')?.value?.trim()||'';
    const entry = { name, muscle, focus, prop, timed, difficulty, repRange, easier, harder, notes, _custom:true };

    if (state.modal.editTarget==='plan-main') {
      const idx=state.modal.editIndex;
      state.workout.exercises[idx]=buildPlanEntry(entry, state.workout.exercises[idx], idx);
    } else {
      if (!state.customExercises[cat]) state.customExercises[cat]=[];
      const ei=state.customExercises[cat].findIndex(e=>e.name===name);
      if(ei>=0)state.customExercises[cat][ei]=entry; else state.customExercises[cat].push(entry);
      if (state.workout) {
        const diff=state.workout.diff;
        if (entry.difficulty.includes(diff)) {
          state.workout.exercises.push(buildPlanEntry(entry, null, state.workout.exercises.length));
        } else {
          showToast(`"${name}" saved to your library, but it isn't marked ${DIFF_LABEL[diff]} so it wasn't added to this plan.`);
        }
      }
    }
  }
  saveToStorage();
  closeExerciseModal();
  if (state.workout) renderPlanEditor();
  showToast(`✅ "${name}" saved!`,'success');
}

// Turn a library entry into a plan exercise with the timing this class style
// expects. `prev` is the slot being replaced, so an edit keeps the instructor's
// custom timing instead of silently resetting it.
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
  const built = { ...entry, reps, unit, seconds,
    propLabel: buildPropLabel(entry),
    muscles: typeof resolveMuscles==='function' ? resolveMuscles(entry) : undefined };
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
    header.innerHTML=`<span>${meta.icon} ${meta.label}</span><span class="lib-count">${exercises.length}</span>`;
    container.appendChild(header);
    exercises.forEach(ex=>{
      const card=document.createElement('div');
      card.className='lib-card'+(ex._source==='custom'?' lib-card-custom':'');
      const isWC=cat==='warmup'||cat==='cooldown';
      const propLabel=ex.prop?(PROP_LABELS[ex.prop]||ex.prop):'';
      const propCss=ex.prop?(PROP_CSS[ex.prop]||'slate'):'slate';
      const safeName=ex.name.replace(/'/g,"\'");

      const actionBtns = ex._source==='custom'
        ? '<button class="lib-edit-btn" onclick="editLibraryExercise(\'' + cat + '\',\''+safeName+'\')">✏️ Edit</button>'
          + '<button class="lib-del-btn" onclick="deleteLibraryExercise(\'' + cat + '\',\''+safeName+'\')">🗑️ Delete</button>'
        : '<button class="lib-edit-btn lib-customize-btn" onclick="addBuiltInToCustom(\'' + cat + '\',\''+safeName+'\')">✏️ Customize</button>';

      card.innerHTML =
        '<div class="lib-card-body">'
        + '<div class="lib-card-top">'
        + '<div class="lib-ex-name">' + ex.name + (ex._source==='custom'?'<span class="custom-badge">⭐ Custom</span>':'') + '</div>'
        + '<div class="lib-ex-meta">'
        + (isWC
            ? '<span class="lib-tag">' + ex.duration + 's</span><span class="lib-tag-note">' + (ex.note||'') + '</span>'
            : (propLabel?'<span class="lib-tag prop-'+propCss+'">'+propLabel+'</span>':'')
              + '<span class="lib-tag-note">' + (ex.muscle||'') + '</span>'
              + (ex.timed?'<span class="timed-badge">⏱ Timed</span>':'')
              + (ex.difficulty?'<span class="lib-diff">'+ex.difficulty.map(d=>DIFF_LABEL[d][0]).join('/')+'</span>':'')
          )
        + '</div>'
        + (!isWC&&ex.easier
            ? '<div class="lib-mods"><span class="mod-badge easier">↓ '+ex.easier+'</span><span class="mod-badge harder">↑ '+ex.harder+'</span></div>'
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
  if (!confirm('Delete "' + name + '"?')) return;
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
