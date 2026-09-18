// ============================================================
//  INSPIRE HABITS — app.js
// ============================================================
const CIRCUMFERENCE = 2 * Math.PI * 90;

const state = {
  participants: 8, style: null, muscle: 'full', duration: 45,
  difficulty: 'intermediate',
  props: ['dumbbells','bench','bodyweight'],
  includeWarmup: true, includeCooldown: true, warmupDuration: 7, ygigWorkSec: 45,
  workout: null,
  timer: { interval:null, seconds:0, current:0, isRunning:false, sequence:[], totalSteps:0 },
  savedWorkouts:   JSON.parse(localStorage.getItem('hiit_saved')           || '[]'),
  workoutHistory:  JSON.parse(localStorage.getItem('hiit_history')         || '[]'),
  customExercises: JSON.parse(localStorage.getItem('hiit_custom_v2')       || '{}'),
  customWarmup:    JSON.parse(localStorage.getItem('hiit_custom_warmup')   || '[]'),
  customCooldown:  JSON.parse(localStorage.getItem('hiit_custom_cooldown') || '[]'),
  inventory: {},
  modal: { category:null, editTarget:null, editIndex:null },
  libraryFilter: 'all', viewMode: 'instructor',
};

// Styles that can be randomly selected (excludes 'random' itself)
const STYLE_KEYS = ['tabata','amrap','emom','circuit','ladder','pyramid','hundred','superset','ygig'];

const STYLES = {
  tabata:   { name:'Tabata',   icon:'🔥', desc:'20s max effort / 10s rest x 8 rounds per exercise.' },
  amrap:    { name:'AMRAP',    icon:'🔄', desc:'As Many Rounds As Possible within the time cap.' },
  emom:     { name:'EMOM',     icon:'⏱️', desc:'Every Minute On the Minute — 2-3 exercises per minute, 40s work / 20s rest. Core burner added if needed.' },
  circuit:  { name:'Circuit',  icon:'⚡', desc:'45s work / 15s transition x 3 full rounds.' },
  ladder:   { name:'Ladder',   icon:'📈', desc:'Rep ladder: 5→10→15→20. Builds muscular endurance.' },
  pyramid:  { name:'Pyramid',  icon:'🔺', desc:'Rep pyramid: 5→10→15→20→15→10→5. Climbs up then back down.' },
  hundred:  { name:'100 Reps', icon:'💯', desc:'Rep ladder across 10 exercises: 10, 20, 30 … up to 100 reps. 550 reps in total.' },
  superset: { name:'Superset',  icon:'💥', desc:'Paired exercises back-to-back with minimal rest.' },
  ygig:     { name:'You-Go-I-Go', icon:'🤝', desc:'Partners alternate: one does reps (harder) while the other holds an active rest. Switch when reps are done.' },
  custom:   { name:'Custom',   icon:'🛠️', desc:'You build it. Set your own rounds, work/rest, reps and props per exercise.' },
};

// ─── CUSTOM STYLE ─────────────────────────────────────────────
// Custom classes are instructor-authored: the generator only seeds a starting
// plan, then every timing value is editable. Per-exercise settings live on the
// exercise as cMode/cWork/cRest/cReps; class-wide settings live on w.custom.
const CUSTOM_DEFAULTS = { rounds:3, roundRest:60, work:40, rest:20, mode:'time' };

function customCfg(w) {
  w = w || state.workout;
  if (!w) return { ...CUSTOM_DEFAULTS };
  w.custom = Object.assign({}, CUSTOM_DEFAULTS, w.custom || {});
  return w.custom;
}
const clampNum = (v, lo, hi, fb) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? fb : Math.min(hi, Math.max(lo, n));
};

// reps/unit/seconds are what every other screen reads, so keep them derived
// from the custom fields rather than letting the two drift apart.
function syncCustomEx(ex) {
  ex.cMode = ex.cMode === 'reps' ? 'reps' : 'time';
  ex.cWork = clampNum(ex.cWork, 5, 600, 40);
  ex.cRest = clampNum(ex.cRest, 0, 300, 20);
  if (ex.cMode === 'reps') {
    ex.cReps = clampNum(ex.cReps, 1, 200, 10);
    ex.reps = String(ex.cReps); ex.unit = 'reps';
  } else {
    ex.reps = ex.cWork + 's'; ex.unit = 'work';
  }
  ex.seconds = ex.cWork;
  return ex;
}

function initCustomEx(ex, cfg, diff) {
  cfg = cfg || customCfg();
  if (ex.cMode == null) ex.cMode = ex.timed ? 'time' : cfg.mode;
  if (ex.cWork == null) ex.cWork = cfg.work;
  if (ex.cRest == null) ex.cRest = cfg.rest;
  if (ex.cReps == null) {
    const r = ex.repRange?.[diff || (state.workout && state.workout.diff) || 'i'] || [10, 15];
    ex.cReps = Math.round((r[0] + r[1]) / 2);
  }
  return syncCustomEx(ex);
}

// Single source of truth for the custom main block: the timer and the time
// estimate both read it, so the clock can never disagree with the plan.
function buildCustomMainSeq(w) {
  const cfg = customCfg(w), out = [];
  const rounds = Math.max(1, clampNum(cfg.rounds, 1, 20, 3));
  for (let r = 0; r < rounds; r++) {
    if (rounds > 1) out.push({ phase:'get-ready', label:'ROUND '+(r+1)+' OF '+rounds, name:'Round Starting', prop:'', duration:5 });
    (w.exercises || []).forEach((ex, ei) => {
      const isReps = ex.cMode === 'reps';
      out.push({ phase:'work', label: isReps ? ex.cReps+' REPS' : 'WORK',
        name:ex.name, prop:ex.propLabel, duration: clampNum(ex.cWork, 5, 600, cfg.work),
        round:r+1, totalRounds:rounds, _exIdx:ei });
      const rest = clampNum(ex.cRest, 0, 300, cfg.rest);
      if (rest > 0) out.push({ phase:'rest', label:'REST', name:'', prop:'', duration:rest });
    });
    const rr = clampNum(cfg.roundRest, 0, 600, 60);
    if (r < rounds - 1 && rr > 0) out.push({ phase:'rest', label:'ROUND REST', name:'', prop:'', duration:rr });
  }
  return out;
}
function customMainSeconds(w) {
  return buildCustomMainSeq(w || state.workout).reduce((s, x) => s + x.duration, 0);
}

// ─── CORE BURNER ──────────────────────────────────────────────
// A short, time-based core finisher that can be bolted onto any class. It is
// always run on the clock (never for reps) so a mixed-ability group finishes
// together, and it only ever uses movements whose *prime mover* is core.
const CORE_BURNER_DEFAULTS = { work:30, rest:15, rounds:1, count:4 };
const CORE_PATTERN_LABEL = { brace:'Anti-extension', rotate:'Rotation', flex:'Flexion', extend:'Extension' };

// "Core" here means the abdominal wall doing the work. Hip flexors and
// erectors sit in the core *region*, but a Good Morning is a hinge and a High
// Knee is a running drill — neither belongs in a core finisher.
const CORE_PRIME_IDS = ['core','obliques'];
const isCorePrime = id => CORE_PRIME_IDS.includes(id);
const isCoreRegion = id => (typeof MUSCLE_GROUPS!=='undefined') && MUSCLE_GROUPS[id] && MUSCLE_GROUPS[id].region==='core';
function coreSignature(ex){
  const s = ex.muscles && ex.muscles.primary ? ex.muscles : resolveMuscles(ex);
  return s.primary.filter(isCorePrime);
}
// A finisher move must be trunk work and nothing else. A Squat Thrust lists
// core as a prime mover, but it also drives the quads — that is conditioning,
// not a core burner, so every prime mover has to sit in the core region.
function isCoreBurnerMove(ex){
  const s = ex.muscles && ex.muscles.primary ? ex.muscles : resolveMuscles(ex);
  if (!s.primary.length) return false;
  return s.primary.some(isCorePrime) && s.primary.every(isCoreRegion);
}
// Classify by how the trunk is loaded, so a burner mixes planks, twists and
// leg raises instead of four variations of one. Rotation and extension are
// judged on prime movers only — a plank that lists obliques as an assister is
// still anti-extension work.
function corePattern(ex){
  const s = ex.muscles && ex.muscles.primary ? ex.muscles : resolveMuscles(ex);
  if (s.primary.includes('obliques')) return 'rotate';
  if (s.primary.includes('lowerback')) return 'extend';
  if ([...s.primary, ...s.secondary].includes('hipflexors')) return 'flex';
  return 'brace';
}
// Direct core work means the abs are a prime mover — a plank counts, a
// thruster that merely braces does not.
function hasDirectCore(ex){ return coreSignature(ex).length > 0; }

function coreBurnerCandidates(){
  const w = state.workout;
  const diff = (w && w.diff) || (state.difficulty||'i')[0];
  const inPlan = new Set([
    ...((w && w.exercises) || []).map(e=>e.name),
    ...((w && w.coreBurner && w.coreBurner.exercises) || []).map(e=>e.name),
  ]);
  const out=[], seen=new Set();
  (state.props||[]).forEach(prop=>{
    const pool=[...(DB[prop]||[])];
    Object.values(state.customExercises||{}).flat().forEach(e=>{
      if((e.prop||'bodyweight')===prop) pool.push(e);
    });
    pool.forEach(e=>{
      if(seen.has(e.name)||inPlan.has(e.name))return;
      if(!e.difficulty||!e.difficulty.includes(diff))return;
      if(e.avoidForTime)return;                              // the burner is on a clock
      if(e.partner && state.participants<4)return;
      if(!propUsable(prop))return;
      const core=coreSignature({...e,prop});
      if(!core.length)return;
      if(!isCoreBurnerMove({...e,prop}))return;
      seen.add(e.name);
      out.push({...e,prop,_cbPattern:corePattern({...e,prop})});
    });
  });
  return out;
}

// A good finisher trains different core patterns rather than four planks.
function pickCoreBurnerExercises(count, cfg){
  const cands=shuffle(coreBurnerCandidates());
  const picked=[];
  Object.keys(CORE_PATTERN_LABEL).forEach(p=>{
    if(picked.length>=count)return;
    const hit=cands.find(c=>c._cbPattern===p && !picked.includes(c));
    if(hit) picked.push(hit);
  });
  cands.forEach(c=>{ if(picked.length<count && !picked.includes(c)) picked.push(c); });
  return picked.slice(0,count).map(ex=>toBurnerExercise(ex,cfg));
}
function toBurnerExercise(ex,cfg){
  cfg=cfg||CORE_BURNER_DEFAULTS;
  return {...ex, propLabel:buildPropLabel(ex), muscles:resolveMuscles(ex),
          reps:cfg.work+'s', unit:'work', seconds:cfg.work};
}

function coreBurnerSeconds(w){
  w=w||state.workout;
  const cb=w&&w.coreBurner;
  if(!cb||!cb.exercises.length)return 0;
  const rounds=Math.max(1,cb.rounds||1);
  return 5 + rounds*((rounds>1?4:0) + cb.exercises.length*(cb.work+cb.rest));
}
function classSeconds(w){
  w=w||state.workout;
  if(!w)return 0;
  let t=0;
  (w.warmup||[]).forEach(ex=>{ t+=(ex.duration||30)+5; });
  if((w.warmup||[]).length) t+=3;
  t+=5;
  t += w.style==='custom' ? customMainSeconds(w) : mainBlockSeconds(w);
  t += coreBurnerSeconds(w);
  (w.cooldown||[]).forEach(ex=>{ t+=(ex.duration||30)+5; });
  if((w.cooldown||[]).length) t+=5;
  return t;
}
// Non-custom styles have fixed shapes, so the planned main block is whatever
// the timer will actually produce for them.
function mainBlockSeconds(w){
  const prev=state.workout;
  try{
    state.workout=w;
    const cb=w.coreBurner; w.coreBurner=null;      // measured separately
    const seq=buildTimerSequence();
    w.coreBurner=cb;
    const start=seq.findIndex(s=>s.label==='MAIN WORKOUT');
    const endLbl=seq.findIndex(s=>s.label==='COOL-DOWN');
    const end=endLbl===-1?seq.length:endLbl;
    return seq.slice(start+1,end).reduce((s,x)=>s+x.duration,0);
  }catch(e){ return (w.mainDur||20)*60; }
  finally{ state.workout=prev; }
}

function addCoreBurner(opts){
  opts=opts||{};
  const w=state.workout; if(!w)return;
  const cfg=Object.assign({},CORE_BURNER_DEFAULTS,{work:opts.work,rest:opts.rest,rounds:opts.rounds,count:opts.count});
  Object.keys(cfg).forEach(k=>{ if(cfg[k]==null) cfg[k]=CORE_BURNER_DEFAULTS[k]; });
  const exercises=pickCoreBurnerExercises(cfg.count,cfg);
  if(!exercises.length){
    showToast('No core exercises available for these props and difficulty.','error');
    return;
  }
  w.coreBurner={work:cfg.work,rest:cfg.rest,rounds:cfg.rounds,exercises,auto:!!opts.auto,reason:opts.reason||''};
  if(!opts.silent){
    renderPlanEditor();
    showToast('🎯 Core Burner added — '+exercises.length+' moves, '+cfg.work+'s on / '+cfg.rest+'s off');
  }
}
function removeCoreBurner(){
  if(!state.workout)return;
  state.workout.coreBurner=null;
  state.workout._cbDeclined=true;              // don't re-suggest after an opt-out
  renderPlanEditor();
  showToast('Core Burner removed');
}
function setCoreBurnerCfg(field,val){
  const cb=state.workout&&state.workout.coreBurner; if(!cb)return;
  const lim={work:[5,180,30],rest:[0,120,15],rounds:[1,6,1]}[field];
  if(!lim)return;
  cb[field]=clampNum(val,lim[0],lim[1],lim[2]);
  if(field==='work') cb.exercises.forEach(ex=>{ex.reps=cb.work+'s';ex.unit='work';ex.seconds=cb.work;});
  const el=document.getElementById('cb-total');
  if(el) el.textContent=fmtMinSec(coreBurnerSeconds());
  if(field==='work') renderPlanEditor();
}
function removeCoreBurnerExercise(i,opts){
  opts=opts||{};
  const cb=state.workout&&state.workout.coreBurner; if(!cb)return;
  cb.exercises.splice(i,1);
  if(!cb.exercises.length){ state.workout.coreBurner=null; state.workout._cbDeclined=true; }
  if(opts.silent)return;
  renderPlanEditor(); showToast('Removed from Core Burner');
}
function swapCoreBurnerExercise(i,opts){
  opts=opts||{};
  const cb=state.workout&&state.workout.coreBurner; if(!cb)return;
  const current=cb.exercises[i];
  const pool=coreBurnerCandidates().filter(c=>c._cbPattern===current._cbPattern);
  const use=(pool.length?pool:coreBurnerCandidates());
  if(!use.length){ if(!opts.silent) showToast('No other core exercises available.'); return; }
  cb.exercises[i]=toBurnerExercise(rand(use),cb);
  if(opts.silent)return;
  renderPlanEditor(); showToast('Swapped → '+cb.exercises[i].name);
}
function addCoreBurnerExercise(){
  const cb=state.workout&&state.workout.coreBurner; if(!cb)return;
  const pool=coreBurnerCandidates();
  if(!pool.length){ showToast('No more core exercises available.'); return; }
  const used=new Set(cb.exercises.map(e=>e._cbPattern));
  const fresh=pool.find(c=>!used.has(c._cbPattern))||rand(pool);
  cb.exercises.push(toBurnerExercise(fresh,cb));
  renderPlanEditor(); showToast('Added → '+cb.exercises[cb.exercises.length-1].name);
}

// Should this class have a finisher? Either it trains no core directly, or it
// is running short of the duration the instructor asked for.
function coreBurnerAdvice(w){
  w=w||state.workout;
  if(!w||w.coreBurner||w._cbDeclined)return null;
  if((w.muscle||state.muscle)==='core')return null;     // the class is already core
  if(!(w.exercises||[]).length)return null;
  if(!w.exercises.some(hasDirectCore))
    return {reason:'this plan has no direct core work'};
  const target=w.duration||state.duration||45;
  const shortBy=target-Math.round(classSeconds(w)/60);
  if(shortBy>=4) return {reason:'the plan is running about '+shortBy+' min short of '+target+' min'};
  return null;
}
function maybeAutoAddCoreBurner(opts){
  const advice=coreBurnerAdvice();
  if(!advice)return false;
  addCoreBurner({auto:true,reason:advice.reason,silent:true});
  if(state.workout.coreBurner && !(opts&&opts.silent))
    showToast('🎯 Core Burner added automatically — '+advice.reason+'.');
  return !!(state.workout&&state.workout.coreBurner);
}

const MUSCLE_FOCUS = {
  full:   { label:'Full Body',  keys:['full','upper','lower','core','glutes','cardio'] },
  upper:  { label:'Upper Body', keys:['upper','push','pull'] },
  lower:  { label:'Lower Body', keys:['lower','glutes'] },
  core:   { label:'Core',       keys:['core'] },
  cardio: { label:'Cardio',     keys:['cardio','full'] },
  push:   { label:'Push',       keys:['push','upper'] },
  pull:   { label:'Pull',       keys:['pull','upper'] },
  glutes: { label:'Glutes',     keys:['glutes','lower'] },
};

const DIFF_LABEL = { b:'Beginner', i:'Intermediate', a:'Advanced' };

// Stackable cable band set attachments:
// Typical set: 5 stackable bands (10/15/20/25/30 lbs), 2 D-handle grips,
//              2 ankle straps, 1 door anchor
const RB_ATTACHMENTS = {
  handle: { label:'D-Handle Grip',  icon:'🤜', note:'2 included' },
  ankle:  { label:'Ankle Strap',    icon:'🦶', note:'2 included' },
  anchor: { label:'Door Anchor',    icon:'🚪', note:'1 included' },
};

/* ── EQUIPMENT INVENTORY ──────────────────────────────────────────────
   What the studio actually owns. Quantities drive exercise selection, so
   the plan can never put 12 people on 2 sliders.

   share:
     'each'      one per person — the move is dropped when there are not
                 enough to go round (sliders, ankle weights).
     'station'   people rotate through it, so a shortage caps how many
                 slots in the plan may use it (stability ball, bench).
     'unlimited' no equipment to run out of (bodyweight).
   ──────────────────────────────────────────────────────────────────── */
const PROP_DEFAULTS = {
  dumbbells:       { label:'Dumbbells',           icon:'🏋️', css:'yellow', qty:30, share:'each'      },
  resistanceBands: { label:'Cable Bands',         icon:'🔴',  css:'red',    qty:4,  share:'station'   },
  bands:           { label:'Mini Bands',          icon:'🔗',  css:'blue',   qty:16, share:'each'      },
  bench:           { label:'Bench',               icon:'🪑',  css:'purple', qty:4,  share:'station'   },
  yogaBall:        { label:'Stability Ball',      icon:'🔵',  css:'green',  qty:1,  share:'station'   },
  elevationBlocks: { label:'Elevation Blocks',    icon:'📦',  css:'orange', qty:8,  share:'station'   },
  balls:           { label:'Med Ball',            icon:'⚽',  css:'pink',   qty:0,  share:'station'   },
  slamBalls:       { label:'Slam Ball',           icon:'💣',  css:'red2',   qty:2,  share:'station'   },
  ankleWeights:    { label:'Ankle Weights',       icon:'🦶',  css:'teal',   qty:8,  share:'each'      },
  sliders:         { label:'Sliders',             icon:'🛷',  css:'slate',  qty:8,  share:'each'      },
  woodBox:         { label:'Wood Box',            icon:'📦',  css:'orange', qty:2,  share:'station'   },
  bodyweight:      { label:'Bodyweight',          icon:'🤸',  css:'slate',  qty:0,  share:'unlimited' },
};
const PROP_ORDER = Object.keys(PROP_DEFAULTS);
const SHARE_MODES = {
  each:      { label:'One per person', hint:'Dropped when there are not enough for everyone.' },
  station:   { label:'Shared station', hint:'People rotate through it. A shortage limits how many slots use it.' },
  unlimited: { label:'Unlimited',      hint:'Nothing to run out of.' },
};
const INVENTORY_KEY = 'hiit_inventory_v1';
const PROP_CSS_CHOICES = ['yellow','red','red2','blue','green','orange','pink','teal','purple','slate'];

function normalizeProp(id, raw, fallback) {
  const base = fallback || PROP_DEFAULTS[id] || {};
  const p = raw || {};
  const qty = parseInt(p.qty, 10);
  return {
    label: String(p.label != null ? p.label : (base.label || id)).slice(0, 40).trim() || id,
    icon:  String(p.icon  != null ? p.icon  : (base.icon  || '🏋️')).slice(0, 4) || '🏋️',
    css:   PROP_CSS_CHOICES.includes(p.css) ? p.css : (base.css || 'slate'),
    share: SHARE_MODES[p.share] ? p.share : (base.share || 'station'),
    qty:   isNaN(qty) ? (base.qty == null ? 1 : base.qty) : Math.min(999, Math.max(0, qty)),
    builtin: !!PROP_DEFAULTS[id],
  };
}

function loadInventory() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const out = {};
  // Built-ins first so the familiar order survives, then anything the
  // instructor added themselves.
  PROP_ORDER.forEach(id => {
    if (saved[id] && saved[id]._removed) return;      // built-in the studio does not own
    out[id] = normalizeProp(id, saved[id], PROP_DEFAULTS[id]);
  });
  Object.keys(saved).forEach(id => {
    if (out[id] || PROP_DEFAULTS[id] || saved[id]._removed) return;
    out[id] = normalizeProp(id, saved[id], null);
  });
  return out;
}

function saveInventory() {
  const out = {};
  Object.entries(state.inventory).forEach(([id, p]) => {
    out[id] = { label:p.label, icon:p.icon, css:p.css, share:p.share, qty:p.qty };
  });
  // Remember which built-ins were deleted, or they would come straight back.
  PROP_ORDER.forEach(id => { if (!state.inventory[id]) out[id] = { _removed:true }; });
  try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(out)); return true; }
  catch (e) { return false; }
}

const propMeta  = id => (state.inventory && state.inventory[id]) || PROP_DEFAULTS[id] ||
                        { label:id, icon:'🏋️', css:'slate', qty:1, share:'station', builtin:false };
const propQty   = id => propMeta(id).qty;
const propShare = id => propMeta(id).share;
const propIsUnlimited = id => propShare(id) === 'unlimited';
const propExists = id => !!(state.inventory && state.inventory[id]);

// How many people can use this prop at the same time.
function propCapacity(id, people) {
  if (propIsUnlimited(id)) return Infinity;
  const n = people == null ? state.participants : people;
  const qty = propQty(id);
  if (qty <= 0) return 0;
  return qty >= n ? Infinity : qty;
}

// 'ok' — everyone can use it · 'limited' — rotate through it ·
// 'short' — not enough to go round, so the move is dropped · 'none' — not owned.
function propStatus(id, people) {
  const n = people == null ? state.participants : people;
  if (propIsUnlimited(id)) return 'ok';
  const qty = propQty(id);
  if (qty <= 0) return 'none';
  if (qty >= n) return 'ok';
  return propShare(id) === 'each' ? 'short' : 'limited';
}

// The one place that decides whether a prop may be used at all right now.
function propUsable(id, people) {
  const s = propStatus(id, people);
  return s === 'ok' || s === 'limited';
}

// PROP_LABELS / PROP_CSS are read all over the app and by editor.js, so they
// are rebuilt in place rather than replaced — every existing reader keeps
// working and simply sees the current inventory.
const PROP_LABELS = {};
const PROP_CSS = {};
function rebuildPropMaps() {
  Object.keys(PROP_LABELS).forEach(k => delete PROP_LABELS[k]);
  Object.keys(PROP_CSS).forEach(k => delete PROP_CSS[k]);
  Object.entries(state.inventory).forEach(([id, p]) => {
    PROP_LABELS[id] = p.icon + ' ' + p.label;
    PROP_CSS[id] = p.css;
  });
}

const CAT_META = {
  warmup:   { label:'Warm-Up',   icon:'🔥', color:'orange' },
  core:     { label:'Core',      icon:'🎯', color:'blue'   },
  upper:    { label:'Upper Body',icon:'💪', color:'purple' },
  lower:    { label:'Lower Body',icon:'🦵', color:'yellow' },
  glutes:   { label:'Glutes',    icon:'🍑', color:'pink'   },
  full:     { label:'Full Body', icon:'🏋️', color:'red'    },
  cardio:   { label:'Cardio',    icon:'❤️', color:'red'    },
  cooldown: { label:'Cool-Down', icon:'❄️', color:'teal'   },
};


// ─── HELPERS ──────────────────────────────────────────────────
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}
function saveToStorage() {
  localStorage.setItem('hiit_saved',           JSON.stringify(state.savedWorkouts));
  localStorage.setItem('hiit_history',         JSON.stringify(state.workoutHistory));
  localStorage.setItem('hiit_custom_v2',       JSON.stringify(state.customExercises));
  localStorage.setItem('hiit_custom_warmup',   JSON.stringify(state.customWarmup));
  localStorage.setItem('hiit_custom_cooldown', JSON.stringify(state.customCooldown));
}
function showToast(msg, type='') {
  let t = document.getElementById('toast');
  if (!t) { t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast show${type?' toast-'+type:''}`;
  setTimeout(() => t.classList.remove('show'), 2800);
}
// Custom exercise names are user input and land in innerHTML — always escape.
function escapeHtml(str) {
  return String(str==null?'':str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function exCat(ex) {
  if (!ex.focus) return 'full';
  if (ex.focus.includes('core'))   return 'core';
  if (ex.focus.includes('glutes')) return 'glutes';
  if (ex.focus.some(f=>['upper','push','pull'].includes(f))) return 'upper';
  if (ex.focus.includes('lower'))  return 'lower';
  if (ex.focus.includes('cardio')) return 'cardio';
  return 'full';
}
function buildPropLabel(ex) {
  let label = PROP_LABELS[ex.prop] || ex.prop;
  if (ex.prop === 'resistanceBands' && ex.rbAttachment) {
    const att = RB_ATTACHMENTS[ex.rbAttachment];
    if (att) label = '🔴 Cable Band + ' + att.label;
  }
  return label;
}

// ─── UI CONTROLS ──────────────────────────────────────────────
function changeParticipants(delta) {
  state.participants = Math.min(16, Math.max(1, state.participants+delta));
  document.getElementById('participant-count').textContent = state.participants;
  document.getElementById('participant-slider').value = state.participants;
  renderPropsGrid();
}
function syncParticipants(val) {
  const n = parseInt(val, 10);
  // Clearing the box must not leave the whole app comparing against NaN.
  state.participants = isNaN(n) ? 1 : Math.min(16, Math.max(1, n));
  document.getElementById('participant-count').textContent = state.participants;
  renderPropsGrid();
}
function updateStationNote() {
  const note = document.getElementById('station-note');
  if (!note) return;
  const n = state.participants;
  const short = [], limited = [];
  (state.props||[]).forEach(id => {
    const s = propStatus(id);
    if (s === 'short' || s === 'none') short.push(id);
    else if (s === 'limited') limited.push(id);
  });

  const parts = [];
  if (n >= 8) parts.push('⚠️ ' + n + ' people — props will be shared between stations');
  limited.forEach(id => parts.push(propMeta(id).label + ' ×' + propQty(id) + ' (rotate as station)'));
  short.forEach(id => parts.push(propMeta(id).label + ' ×' + propQty(id) +
    ' (not enough for ' + n + ' — will be skipped)'));

  if (!parts.length) { note.style.display = 'none'; return; }
  if (n < 8) parts.unshift('ℹ️ Equipment limits for ' + n + ' people');
  note.textContent = parts.join(' · ');
  note.style.display = 'block';
}
function selectMuscle(btn) { document.querySelectorAll('.muscle-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.muscle=btn.dataset.muscle; }
function selectDifficulty(btn) { document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.difficulty=btn.dataset.diff; }
function selectDuration(btn) { document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.duration=parseInt(btn.dataset.dur); document.getElementById('custom-duration-val').value=state.duration; }
function setCustomDuration(val) { state.duration=Math.min(120,Math.max(5,parseInt(val)||30)); document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active')); }
function selectWarmupDur(btn) { document.querySelectorAll('.wdur-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.warmupDuration=parseInt(btn.dataset.wdur); }
function updateProps() {
  state.props=[...document.querySelectorAll('.props-grid input:checked')].map(i=>i.value);
  const boxRow=document.getElementById('box-info-row');
  if(boxRow) boxRow.style.display = state.props.includes('woodBox')?'block':'none';
  updateStationNote();
}

/* ── Props grid, rendered from the inventory ─────────────────────── */
let _propsGridPainted = false;
function renderPropsGrid() {
  const grid = document.querySelector('.props-grid');
  if (!grid) return;
  // Anything the studio owns none of is left out entirely — it stays in the
  // Equipment list (and keeps its exercises) but does not clutter class setup.
  const ids = Object.keys(state.inventory).filter(id => propStatus(id) !== 'none');
  // Keep any selection the instructor already made; on first paint everything
  // the studio owns is selected, which is how the app has always started.
  const prev = _propsGridPainted ? new Set(state.props || []) : null;

  grid.innerHTML = ids.map(id => {
    const p = state.inventory[id];
    const status = propStatus(id);
    const on = prev ? prev.has(id) : true;
    const note = propIsUnlimited(id) ? ''
      : status === 'short' ? '<span class="prop-count-note short">×' + p.qty + ' · too few</span>'
      : status === 'limited' ? '<span class="prop-count-note">×' + p.qty + ' · shared</span>'
      : '<span class="prop-count-note ok">×' + p.qty + '</span>';
    return '<label class="prop-toggle">' +
      '<input type="checkbox" value="' + escapeHtml(id) + '"' + (on ? ' checked' : '') +
        ' onchange="updateProps()">' +
      '<span class="prop-label"><span class="prop-icon">' + escapeHtml(p.icon) + '</span>' +
        escapeHtml(p.label) + ' ' + note + '</span>' +
    '</label>';
  }).join('');
  _propsGridPainted = true;

  state.props = [...grid.querySelectorAll('input:checked')].map(i => i.value);
  const boxRow = document.getElementById('box-info-row');
  if (boxRow) boxRow.style.display = state.props.includes('woodBox') ? 'block' : 'none';
  updateStationNote();
}

/* ── Equipment editor ────────────────────────────────────────────── */
let _invDraft = null;

function openInventory() {
  _invDraft = JSON.parse(JSON.stringify(state.inventory));
  renderInventory();
  const m = document.getElementById('inventory-modal');
  if (m) m.style.display = 'flex';
}
function closeInventory() {
  const m = document.getElementById('inventory-modal');
  if (m) m.style.display = 'none';
  _invDraft = null;
}

function renderInventory() {
  const body = document.getElementById('inventory-body');
  if (!body || !_invDraft) return;
  const n = state.participants;

  const rows = Object.entries(_invDraft).map(([id, p]) => {
    const unlimited = p.share === 'unlimited';
    const enough = unlimited || p.qty >= n;
    const statusTxt = unlimited ? 'Unlimited'
      : p.qty <= 0 ? 'Not owned'
      : enough ? 'Enough for ' + n
      : p.share === 'each' ? 'Too few for ' + n + ' — will be skipped'
      : 'Shared station · ' + p.qty + ' at a time';
    const statusCls = unlimited || enough ? 'ok' : (p.share === 'each' ? 'short' : 'limited');

    return '<div class="inv-row" data-id="' + escapeHtml(id) + '">' +
      '<input class="inv-icon" value="' + escapeHtml(p.icon) + '" maxlength="4" ' +
        'onchange="setInvField(\'' + escapeHtml(id) + '\',\'icon\',this.value)" aria-label="Icon">' +
      '<div class="inv-main">' +
        '<input class="inv-name" value="' + escapeHtml(p.label) + '" maxlength="40" ' +
          'onchange="setInvField(\'' + escapeHtml(id) + '\',\'label\',this.value)" aria-label="Name">' +
        '<div class="inv-status ' + statusCls + '">' + statusTxt +
          (p.builtin ? '' : ' · custom') + '</div>' +
      '</div>' +
      '<div class="inv-qty">' +
        (unlimited
          ? '<span class="inv-qty-na">—</span>'
          : '<button class="inv-step" onclick="stepInv(\'' + escapeHtml(id) + '\',-1)">−</button>' +
            '<input class="inv-num" type="number" min="0" max="999" value="' + p.qty + '" ' +
              'onchange="setInvField(\'' + escapeHtml(id) + '\',\'qty\',this.value)" aria-label="How many">' +
            '<button class="inv-step" onclick="stepInv(\'' + escapeHtml(id) + '\',1)">+</button>') +
      '</div>' +
      '<select class="inv-share" onchange="setInvField(\'' + escapeHtml(id) + '\',\'share\',this.value)" aria-label="Sharing">' +
        Object.entries(SHARE_MODES).map(([k, m]) =>
          '<option value="' + k + '"' + (p.share === k ? ' selected' : '') + '>' + m.label + '</option>').join('') +
      '</select>' +
      '<button class="inv-del" onclick="removeInvProp(\'' + escapeHtml(id) + '\')" title="Remove">✕</button>' +
    '</div>';
  }).join('');

  body.innerHTML =
    '<div class="inv-intro">Set what your studio owns. Quantities decide which exercises can be ' +
      'programmed for a class of <b>' + n + '</b>. Set a quantity to <b>0</b> to hide equipment ' +
      'from class setup without losing its exercises — put a number back to bring it in again.</div>' +
    '<div class="inv-head"><span>Equipment</span><span>How many</span><span>Sharing</span><span></span></div>' +
    rows +
    '<div class="inv-add">' +
      '<input id="inv-new-icon" class="inv-icon" value="🏋️" maxlength="4" aria-label="New icon">' +
      '<input id="inv-new-name" class="inv-name" placeholder="Add equipment…" maxlength="40" ' +
        'onkeydown="if(event.key===\'Enter\')addInvProp()">' +
      '<input id="inv-new-qty" class="inv-num" type="number" min="0" max="999" value="4" aria-label="How many">' +
      '<button class="inv-add-btn" onclick="addInvProp()">+ Add</button>' +
    '</div>' +
    '<div class="inv-note">Custom equipment has no exercises of its own yet — add your own moves ' +
      'to it from the exercise library.</div>';
}

function setInvField(id, field, val) {
  if (!_invDraft || !_invDraft[id]) return;
  const before = _invDraft[id];
  _invDraft[id] = normalizeProp(id, Object.assign({}, before, { [field]: val }), before);
  _invDraft[id].builtin = before.builtin;
  renderInventory();
}
function stepInv(id, delta) {
  if (!_invDraft || !_invDraft[id]) return;
  setInvField(id, 'qty', Math.max(0, (_invDraft[id].qty || 0) + delta));
}
function removeInvProp(id) {
  if (!_invDraft || !_invDraft[id]) return;
  if (Object.keys(_invDraft).length <= 1) { showToast('Keep at least one piece of equipment.','error'); return; }
  delete _invDraft[id];
  renderInventory();
}
function addInvProp() {
  if (!_invDraft) return;
  const name = (document.getElementById('inv-new-name').value || '').trim();
  if (!name) { showToast('Give the equipment a name.','error'); return; }
  const icon = (document.getElementById('inv-new-icon').value || '🏋️').trim();
  const qty  = document.getElementById('inv-new-qty').value;

  // Ids are derived from the name so custom exercises can point at them.
  let id = name.replace(/[^a-zA-Z0-9]+/g,' ').trim()
    .split(' ').map((w,i)=> i ? w[0].toUpperCase()+w.slice(1).toLowerCase() : w.toLowerCase()).join('');
  if (!id) id = 'prop';
  if (_invDraft[id]) { showToast('"' + name + '" is already on the list.','error'); return; }

  _invDraft[id] = normalizeProp(id, {
    label:name, icon, qty, share:'station',
    css: PROP_CSS_CHOICES[Object.keys(_invDraft).length % PROP_CSS_CHOICES.length],
  }, null);
  _invDraft[id].builtin = false;
  renderInventory();
  const el = document.getElementById('inv-new-name');
  if (el) el.value = '';
}

function resetInventory() {
  if (!confirm('Reset all equipment back to the built-in defaults?')) return;
  _invDraft = {};
  PROP_ORDER.forEach(id => { _invDraft[id] = normalizeProp(id, null, PROP_DEFAULTS[id]); });
  renderInventory();
  showToast('Reset to defaults — save to keep it.');
}

// Save as the studio default, then bring the current plan back in line with it.
function saveInventoryDefaults() {
  if (!_invDraft) return;
  state.inventory = JSON.parse(JSON.stringify(_invDraft));
  rebuildPropMaps();
  const saved = saveInventory();
  renderPropsGrid();
  closeInventory();

  const changed = applyInventoryToWorkout();
  if (!saved) showToast('Saved for this session, but the browser blocked storage.','error');
  else if (changed) showToast('🏋️ Equipment saved · ' + changed);
  else showToast('🏋️ Equipment saved as your studio default');
}

/* Bring the open plan back in line with the inventory: drop moves whose
   equipment the studio no longer has enough of, and refill the gaps. */
function applyInventoryToWorkout() {
  const w = state.workout;
  if (!w || !w.exercises) return '';
  const people = w.participants || state.participants;

  const bad = w.exercises.filter(ex => !propExists(ex.prop) || !propUsable(ex.prop, people));
  const burnerBad = (w.coreBurner && w.coreBurner.exercises || [])
    .filter(ex => !propExists(ex.prop) || !propUsable(ex.prop, people));
  if (!bad.length && !burnerBad.length) { renderPlanEditor(); return ''; }

  // Swap from the back so the earlier indices stay valid.
  const idxs = bad.map(ex => w.exercises.indexOf(ex)).sort((a,b)=>b-a);
  let swapped = 0, dropped = 0;
  idxs.forEach(i => {
    const before = w.exercises[i];
    swapExercise(i, { silent:true });
    if (w.exercises[i] && w.exercises[i].name !== before.name) swapped++;
    else { w.exercises.splice(i,1); dropped++; }
  });

  (w.coreBurner && w.coreBurner.exercises || []).slice().reverse().forEach(ex => {
    if (!w.coreBurner) return;
    if (propExists(ex.prop) && propUsable(ex.prop, people)) return;
    const i = w.coreBurner.exercises.indexOf(ex);
    if (i < 0) return;
    const before = ex.name;
    swapCoreBurnerExercise(i, { silent:true });
    if (w.coreBurner && w.coreBurner.exercises[i] && w.coreBurner.exercises[i].name !== before) swapped++;
    else { removeCoreBurnerExercise(i, { silent:true }); dropped++; }
  });

  w.muscleLoad = muscleLoadForExercises(w.exercises);
  renderPlanEditor();

  const bits = [];
  if (swapped) bits.push(swapped + ' move' + (swapped>1?'s':'') + ' swapped');
  if (dropped) bits.push(dropped + ' removed');
  return bits.join(' · ') + ' to match your equipment';
}

// ─── STYLE PICKER ─────────────────────────────────────────────
function openStylePicker() {
  if (!state.props||state.props.length===0) { showToast('Please select at least one prop!','error'); return; }
  showScreen('style-picker-screen');
}
function pickStyle(styleKey) {
  state.style = styleKey;
  document.querySelectorAll('.style-pick-btn').forEach(b=>b.classList.remove('active'));
  const btn = document.querySelector('.style-pick-btn[data-style="'+styleKey+'"]');
  if (btn) btn.classList.add('active');
  const names={
    random:'🎲 Random (surprise me!)',
    tabata:'🔥 Tabata',circuit:'⚡ Circuit',amrap:'🔄 AMRAP',
    emom:'⏱️ EMOM',ladder:'📈 Ladder',pyramid:'🔺 Pyramid',
    hundred:'💯 100 Reps',superset:'💥 Superset',ygig:'🤝 You-Go-I-Go',
    custom:'🛠️ Custom'
  };
  document.getElementById('style-selected-text').textContent='Selected: '+(names[styleKey]||styleKey);
  document.getElementById('style-selected-preview').style.display='flex';
}
function confirmStyleAndGenerate() {
  if (!state.style) { showToast('Please choose a class style first!'); return; }
  generateWorkout();
}

// ─── WORKOUT GENERATION ───────────────────────────────────────
function generateWorkout(opts) {
  // Guard against being called straight from an onclick (event arg).
  opts = (opts && typeof opts === 'object' && !opts.target) ? opts : {};
  if (!state.style) { showToast('Please choose a class style first!'); return; }
  // Resolve random style
  let resolvedStyle = opts.forceStyle || state.style;
  if (resolvedStyle === 'random') {
    resolvedStyle = STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)];
    // Show which style was picked
    const styleNames = {tabata:'🔥 Tabata',circuit:'⚡ Circuit',amrap:'🔄 AMRAP',emom:'⏱️ EMOM',ladder:'📈 Ladder',pyramid:'🔺 Pyramid',hundred:'💯 100 Reps',superset:'💥 Superset',ygig:'🤝 You-Go-I-Go'};
    if (!opts.silent) showToast('🎲 Randomly picked: '+styleNames[resolvedStyle]);
  }
  const styleCfg = STYLES[resolvedStyle];
  if (!styleCfg) { showToast('Unknown style: '+resolvedStyle); return; }
  const diff = (state.difficulty||'i')[0];
  const focusKeys = (MUSCLE_FOCUS[state.muscle]||MUSCLE_FOCUS.full).keys;
  const focusContract = getFocusContract(state.muscle);
  const preferTimed = state.participants >= 8;
  const allowPartner = state.participants >= 4;
  // Clock-driven formats reward speed. A handful of moves (heavy skill lifts,
  // max-effort plyos, slow eccentrics) get dangerous when rushed, so they are
  // held out of those formats rather than removed from the library.
  const CLOCK_STYLES = ['tabata','amrap','emom','circuit','hundred'];
  const underClock = CLOCK_STYLES.includes(resolvedStyle);

  // An exercise belongs in this class if its legacy focus tag matches OR its
  // resolved muscle signature hits a group the focus contract cares about.
  // Muscles are the source of truth; the coarse tags are just a hint.
  const contractGroups = new Set([...focusContract.requiredMajors, ...focusContract.minorPool]);
  const matchesFocus = ex => {
    if (ex.focus && ex.focus.some(f=>focusKeys.includes(f))) return true;
    const sig = resolveMuscles(ex);
    return [...sig.primary, ...sig.secondary].some(id => contractGroups.has(id));
  };

  // Build a flat, de-duplicated candidate list. No weight-by-duplication:
  // priority is decided by the coverage engine, not by pool stuffing.
  const candidates=[], seen=new Set();
  (state.props||[]).forEach(prop => {
    const propDB = [...(DB[prop]||[])];
    Object.values(state.customExercises||{}).flat().forEach(ex => {
      if ((ex.prop||'bodyweight')===prop && !seen.has(ex.name)) propDB.push(ex);
    });
    propDB.forEach(ex => {
      if (seen.has(ex.name)) return;
      if (!ex.difficulty||!ex.difficulty.includes(diff)) return;
      if (!matchesFocus(ex)) return;
      if (ex.partner&&!allowPartner) return;
      if (ex.avoidForTime && underClock) return;
      // Not enough of this prop to go round, so the move is dropped.
      if (!propUsable(prop)) return;
      seen.add(ex.name);
      candidates.push({...ex,prop});
    });
  });

  if (candidates.length===0) {
    showToast('No exercises match those props + focus. Try adding props or a different focus.','error');
    return;
  }

  const warmupDur = state.includeWarmup?(state.warmupDuration||7):0;
  const cooldownDur = state.includeCooldown?5:0;
  const mainDur = Math.max(5,(state.duration||45)-warmupDur-cooldownDur);

  let exCount;
  if (resolvedStyle==='emom') {
    // EMOM: 5-9 exercises, grouped 2-3 per minute
    exCount = Math.min(9, Math.max(5, Math.round(mainDur * 0.6)));
  }
  else if (resolvedStyle==='tabata')   exCount=Math.max(4,Math.floor(mainDur/4));
  else if (resolvedStyle==='circuit')  exCount=Math.min(12,Math.max(5,Math.floor(mainDur/5)));
  else if (resolvedStyle==='hundred')  exCount=10;
  else if (resolvedStyle==='ygig')     exCount=Math.min(8,Math.max(4,Math.floor(mainDur/6)))*2; // pairs
  else if (resolvedStyle==='pyramid')  exCount=Math.min(10,Math.max(4,Math.floor(mainDur/5)));
  else exCount=Math.min(12,Math.max(5,Math.floor(mainDur/4)));

  // A full-body class needs at least one slot per required major group,
  // plus headroom so accessory rotation isn't squeezed out.
  const contract = focusContract;
  exCount = Math.min(14, Math.max(exCount, contract.requiredMajors.length + 1));

  const stationCount = state.participants>=8?Math.ceil(exCount/2):exCount;
  // How many plan slots each prop can support at once, straight from the
  // studio inventory — a prop nobody has to queue for is left uncapped.
  const PROP_LIMITS_MAX = {};
  (state.props||[]).forEach(prop => {
    const cap = propCapacity(prop);
    if (cap !== Infinity && cap > 0) PROP_LIMITS_MAX[prop] = cap;
  });

  // Equipment limits exist so stations don't collide — but they must never
  // starve the class. If a limited prop is the only thing supplying candidates,
  // drop its limit: the group is rotating through that station regardless.
  const relax = (limits) => {
    const out = {};
    Object.entries(limits).forEach(([prop, max]) => {
      const others = candidates.filter(c => c.prop !== prop).length;
      if (others >= exCount) out[prop] = max;   // other props can fill the gap
    });
    return out;
  };
  const PROP_LIMITS = relax(PROP_LIMITS_MAX);

  const picked = selectExercisesWithCoverage(candidates, {
    count: exCount,
    focusKey: state.muscle,
    preferTimed,
    propLimits: PROP_LIMITS,
    propCaps: {},
  });
  let selected = picked.selected;

  if (resolvedStyle==='superset') selected=selected.slice(0,Math.floor(selected.length/2)*2);
  if (resolvedStyle==='hundred')  selected=selected.slice(0,10);
  if (resolvedStyle==='ygig') {
    // In YGIG a pair works the same move at the same time, so there has to be
    // enough of the prop for everybody at once — a rotating station will not do.
    const ygigFiltered = selected.filter(ex => propCapacity(ex.prop) === Infinity);
    // Use filtered list if it has enough, otherwise fall back to original
    const ygigPool = ygigFiltered.length >= 4 ? ygigFiltered : selected;
    // Ensure even count for pairing
    const ygigEven = ygigPool.slice(0, Math.floor(ygigPool.length/2)*2);
    // Sort pairs: within each pair, put harder exercise first (by repRange max desc)
    const paired=[];
    for(let i=0;i<ygigEven.length;i+=2){
      const a=ygigEven[i], b=ygigEven[i+1]||ygigEven[i];
      const aMax=a.repRange?.[diff]?.[1]||10, bMax=b.repRange?.[diff]?.[1]||10;
      // Primary (harder = higher reps or more complex) goes first
      if(bMax>aMax) paired.push(b,a); else paired.push(a,b);
    }
    selected=paired;
  }

  const exercises = selected.map((ex,exMapIdx) => {
    const range = ex.repRange?.[diff]||[10,15];
    let reps,unit,seconds;
    const hundredIdx = resolvedStyle==='hundred' ? exMapIdx : 0;
    switch(resolvedStyle){
      case 'tabata':   reps='20s';    unit='work'; seconds=20; break;
      case 'circuit':  reps='45s';    unit='work'; seconds=45; break;
      case 'ladder':   reps='5→20';   unit='reps'; seconds=30; break;
      case 'pyramid':  reps='5→20→5'; unit='reps'; seconds=30; break;
      case 'hundred':  reps=((hundredIdx||0)+1)*10+''; unit='reps'; seconds=Math.max(30,((hundredIdx||0)+1)*8); break;
      case 'ygig':     reps=randInt(range[0],range[1]); unit='reps'; seconds=state.ygigWorkSec||45; break;
      case 'custom':   reps=null; unit=null; seconds=null; break;
      default:         reps=randInt(range[0],range[1]); unit='reps'; seconds=40;
    }
    const propLabel = buildPropLabel({...ex,prop:ex.prop});
    // Freeze the resolved muscle signature onto the plan so saved/exported
    // workouts stay analysable even if the taxonomy later changes.
    const built = {...ex,reps,unit,seconds,propLabel,isPartner:ex.partner&&allowPartner,muscles:resolveMuscles(ex)};
    if (resolvedStyle==='custom') initCustomEx(built, CUSTOM_DEFAULTS, diff);
    return built;
  });

  const allWarmup=[...WARMUP_POOL,...(state.customWarmup||[])];
  const allCooldown=[...COOLDOWN_POOL,...(state.customCooldown||[])];
  const warmupCount = state.includeWarmup?Math.round((state.warmupDuration||7)*1.2):0;
  const warmupExs = shuffle(allWarmup).slice(0,Math.min(warmupCount,allWarmup.length));
  const cooldownExs = state.includeCooldown?shuffle(allCooldown).slice(0,7):[];

  state.workout = {
    style:resolvedStyle, styleCfg, exercises,
    warmup:warmupExs, cooldown:cooldownExs,
    diff, mainDur, stationCount,
    warmupDuration:warmupDur,
    participants:state.participants,
    ygigWorkSec:state.ygigWorkSec,
    muscle:state.muscle,
    duration:state.duration||45,
    // Coverage metadata produced by programming.js
    accessoryFocus: picked.accessoryFocus,
    recentClasses:  picked.recentClasses,
    muscleLoad:     muscleLoadForExercises(exercises),
  };
  if (resolvedStyle==='custom') customCfg(state.workout);
  maybeAutoAddCoreBurner({silent:opts.silent});

  if (picked.gaps.length && !opts.silent) {
    showToast('⚠️ No exercise available for: '+picked.gaps.map(id=>muscleLabel(id)).join(', '),'error');
  } else if (picked.weakGaps.length && !opts.silent) {
    showToast('ℹ️ Assist-only this class: '+picked.weakGaps.map(id=>muscleLabel(id)).join(', ')+'. Add props for direct work.');
  }

  renderPlanEditor();
  showScreen('plan-editor-screen');
}

// ─── PLAN EDITOR ─────────────────────────────────────────────
function renderPlanEditor() {
  if (!state.workout) return;
  renderCoveragePanel();
  if (typeof syncClassQRButton==='function') syncClassQRButton();
  if (typeof MA!=='undefined'&&MA.enabled) { renderTieredPlanEditor(); return; }
  const {style,styleCfg,exercises,warmup,cooldown,diff,stationCount}=state.workout;
  document.getElementById('plan-style-badge').textContent  = styleCfg.icon+' '+styleCfg.name;
  document.getElementById('plan-muscle-badge').textContent = '💪 '+(MUSCLE_FOCUS[state.muscle]?.label||state.muscle);
  document.getElementById('plan-people-badge').textContent = '👥 '+state.workout.participants;
  document.getElementById('plan-diff-badge').textContent   = '⭐ '+(DIFF_LABEL[diff]||diff);
  document.getElementById('plan-style-desc').textContent   = styleCfg.desc;
  const stNote=document.getElementById('plan-station-note');
  if (state.workout.participants>=8){stNote.textContent='📍 Suggested stations: '+stationCount+' (pairs share props)';stNote.style.display='block';}
  else stNote.style.display='none';

  const container=document.getElementById('plan-exercises'); container.innerHTML='';

  if (warmup.length>0) {
    container.appendChild(makeSectionHeader('🔥 Warm-Up','~'+state.workout.warmupDuration+' min','warmup-section'));
    warmup.forEach((ex,i)=>container.appendChild(makePlanWarmCoolCard(ex,i,'warmup')));
  }

  if (style==='emom') {
    const exPerMin = exercises.length <= 6 ? 2 : 3;
    const workPerEx = Math.floor(40 / exPerMin);
    const banner=document.createElement('div'); banner.className='style-info-banner';
    // Call out anything the class has to queue for.
    const limitedInPlan = exercises.filter(ex => propCapacity(ex.prop) !== Infinity);
    const limitedNote = limitedInPlan.length>0 && state.participants>1
      ? ' <b>Note:</b> '+limitedInPlan.map(e=>e.propLabel).join(', ')+' — shared prop, use as a station.'
      : '';
    banner.innerHTML='<span class="sib-icon">⏱️</span><span><b>EMOM:</b> '+exercises.length+' exercises grouped '+exPerMin+' per minute. Each exercise gets ~'+workPerEx+'s of work, then 20s rest. '+Math.ceil(exercises.length/exPerMin)+' total minutes.'+limitedNote+'</span>';
    container.appendChild(banner);
  }
  if (style==='ygig') {
    const banner=document.createElement('div'); banner.className='style-info-banner ygig-banner';
    const ygigSec = state.workout.ygigWorkSec || state.ygigWorkSec || 45;
    banner.innerHTML='<span class="sib-icon">🤝</span><div class="ygig-banner-content"><div><b>You-Go-I-Go:</b> Person A does reps while Person B holds active rest. Switch when done.</div><div class="ygig-time-control"><span class="ygig-time-label">⏱ Time per person:</span><div class="ygig-time-btns"><button class="ygig-time-btn '+(ygigSec===20?'active':'')+'" data-sec="20" onclick="selectYgigTime(this)">20s</button><button class="ygig-time-btn '+(ygigSec===30?'active':'')+'" data-sec="30" onclick="selectYgigTime(this)">30s</button><button class="ygig-time-btn '+(ygigSec===45?'active':'')+'" data-sec="45" onclick="selectYgigTime(this)">45s</button><button class="ygig-time-btn '+(ygigSec===60?'active':'')+'" data-sec="60" onclick="selectYgigTime(this)">60s</button><button class="ygig-time-btn '+(ygigSec===90?'active':'')+'" data-sec="90" onclick="selectYgigTime(this)">90s</button></div><input type="number" class="ygig-time-custom" min="15" max="120" value="'+ygigSec+'" onchange="setCustomYgigTime(this.value)" placeholder="sec"/></div></div>';
    container.appendChild(banner);
  }
  if (style==='pyramid'||style==='hundred') {
    const banner=document.createElement('div'); banner.className='style-info-banner';
    if (style==='pyramid') banner.innerHTML='<span class="sib-icon">🔺</span><span>Pyramid: 5 → 10 → 15 → 20 → 15 → 10 → 5 reps. Rest 15s between sets.</span>';
    else banner.innerHTML='<span class="sib-icon">💯</span><span><b>100 Reps Challenge:</b> Each exercise gets progressively more reps — 10, 20, 30, 40, 50, 60, 70, 80, 90, 100. Total = 550 reps. Rest scales with rep count.</span>';
    container.appendChild(banner);
  }

  if (style==='custom') container.appendChild(makeCustomPanel());

  container.appendChild(makeSectionHeader('⚡ Main Workout',
    style==='custom' ? '<span id="custom-main-est">'+fmtMinSec(customMainSeconds())+'</span>'
                     : '~'+state.workout.mainDur+' min','main-section'));
  if (style==='ygig') {
    for (let i=0;i<exercises.length;i+=2) {
      const primary=exercises[i];
      const activeRest=exercises[i+1];
      if(!primary)continue;
      const pairDiv=document.createElement('div'); pairDiv.className='ygig-pair';
      pairDiv.innerHTML='<div class="ygig-pair-label">🤝 Pair '+(Math.floor(i/2)+1)+'</div>';
      // Primary card
      const pCard=makePlanExCard(primary,i);
      pCard.classList.add('ygig-primary-card');
      const badge=document.createElement('div'); badge.className='ygig-role-badge ygig-primary-badge';
      badge.textContent='💪 Primary (reps)';
      pCard.querySelector('.exercise-info').prepend(badge);
      pairDiv.appendChild(pCard);
      // Active rest card
      if(activeRest){
        const rCard=makePlanExCard(activeRest,i+1);
        rCard.classList.add('ygig-rest-card');
        const rBadge=document.createElement('div'); rBadge.className='ygig-role-badge ygig-rest-badge';
        rBadge.textContent='🧘 Active Rest (hold while partner works)';
        rCard.querySelector('.exercise-info').prepend(rBadge);
        pairDiv.appendChild(rCard);
      }
      container.appendChild(pairDiv);
    }
  } else if (style==='superset') {
    for (let i=0;i<exercises.length;i+=2) {
      const pair=exercises.slice(i,i+2);
      const pairDiv=document.createElement('div'); pairDiv.className='superset-pair';
      pairDiv.innerHTML='<div class="superset-label">Superset '+Math.floor(i/2+1)+'</div>';
      pair.forEach((ex,j)=>pairDiv.appendChild(makePlanExCard(ex,i+j)));
      container.appendChild(pairDiv);
    }
  } else { exercises.forEach((ex,i)=>container.appendChild(makePlanExCard(ex,i))); }

  renderCoreBurnerSection(container);

  if (cooldown.length>0) {
    container.appendChild(makeSectionHeader('❄️ Cool-Down','~5 min','cooldown-section'));
    cooldown.forEach((ex,i)=>container.appendChild(makePlanWarmCoolCard(ex,i,'cooldown')));
  }
}

function renderCoreBurnerSection(container){
  const w=state.workout, cb=w.coreBurner;
  const head=document.createElement('div'); head.className='section-header cb-header';
  head.innerHTML='<span class="section-title">🎯 Core Burner</span>'+
    '<span class="section-sub">'+(cb?'<span id="cb-total">'+fmtMinSec(coreBurnerSeconds(w))+'</span> · time-based finisher':'optional time-based finisher')+'</span>';
  const btn=document.createElement('button');
  btn.className='add-ex-inline-btn'+(cb?' cb-remove':'');
  btn.textContent=cb?'✕ Remove':'+ Add Core Burner';
  btn.onclick=()=>cb?removeCoreBurner():addCoreBurner({});
  head.appendChild(btn);
  container.appendChild(head);

  if(!cb){
    const advice=coreBurnerAdvice(w);
    const hint=document.createElement('div'); hint.className='cb-hint';
    hint.innerHTML=advice
      ? '💡 Suggested: '+escapeHtml(advice.reason)+'. A core finisher would round this class out.'
      : 'Add a short core finisher — 3–5 core moves on the clock, no rep counting.';
    container.appendChild(hint);
    return;
  }

  const bar=document.createElement('div'); bar.className='cb-controls';
  bar.innerHTML=
    (cb.auto&&cb.reason?'<div class="cb-why">Added automatically because '+escapeHtml(cb.reason)+'.</div>':'')+
    '<div class="cb-fields">'+
      '<label class="cp-field"><span>Work</span><input type="number" min="5" max="180" step="5" value="'+cb.work+'" onchange="setCoreBurnerCfg(\'work\',this.value)"></label>'+
      '<label class="cp-field"><span>Rest</span><input type="number" min="0" max="120" step="5" value="'+cb.rest+'" onchange="setCoreBurnerCfg(\'rest\',this.value)"></label>'+
      '<label class="cp-field"><span>Rounds</span><input type="number" min="1" max="6" value="'+cb.rounds+'" onchange="setCoreBurnerCfg(\'rounds\',this.value)"></label>'+
      '<button class="cb-add-ex" onclick="addCoreBurnerExercise()">+ Add core move</button>'+
    '</div>';
  container.appendChild(bar);

  cb.exercises.forEach((ex,i)=>{
    const card=document.createElement('div');
    card.className='exercise-card plan-card cb-card';
    const pat=CORE_PATTERN_LABEL[ex._cbPattern]||'Core';
    const sig=ex.muscles&&ex.muscles.primary?ex.muscles:resolveMuscles(ex);
    card.innerHTML=
      '<div class="exercise-num cb-num">🎯</div>'+
      '<div class="exercise-info">'+
        '<div class="exercise-name">'+escapeHtml(ex.name)+'<span class="cb-pat-badge">'+escapeHtml(pat)+'</span></div>'+
        '<div class="exercise-details">'+
          '<span class="exercise-prop prop-'+(PROP_CSS[ex.prop]||'slate')+'">'+escapeHtml(ex.propLabel||'')+'</span>'+
          '<span class="exercise-muscle-tag">'+escapeHtml(ex.muscle||'')+'</span>'+
        '</div>'+
        '<div class="mg-chip-row">'+
          sig.primary.map(id=>'<span class="mg-chip mg-primary">'+muscleIcon(id)+' '+escapeHtml(muscleLabel(id,true))+'</span>').join('')+
          sig.secondary.map(id=>'<span class="mg-chip mg-secondary">'+muscleIcon(id)+' '+escapeHtml(muscleLabel(id,true))+'</span>').join('')+
        '</div>'+
        (ex.cue?'<div class="ex-cue">💡 '+escapeHtml(ex.cue)+'</div>':'')+
      '</div>'+
      '<div class="exercise-right">'+
        '<div class="exercise-reps">'+cb.work+'s</div>'+
        '<div class="exercise-reps-label">work</div>'+
        '<div class="plan-card-actions">'+
          '<button class="swap-btn" onclick="swapCoreBurnerExercise('+i+')" title="Swap">⇄</button>'+
          '<button class="del-btn" onclick="removeCoreBurnerExercise('+i+')" title="Remove">✕</button>'+
        '</div>'+
      '</div>';
    container.appendChild(card);
  });
}

function makeSectionHeader(title,sub,section) {
  const div=document.createElement('div'); div.className='section-header';
  div.innerHTML='<span class="section-title">'+title+'</span><span class="section-sub">'+sub+'</span>';
  const btn=document.createElement('button'); btn.className='add-ex-inline-btn'; btn.textContent='+ Add';
  btn.onclick=()=>openAddExerciseModal(section==='warmup-section'?'warmup':section==='cooldown-section'?'cooldown':null);
  div.appendChild(btn); return div;
}

// ─── CUSTOM CLASS BUILDER ─────────────────────────────────────
function fmtMinSec(sec){
  sec=Math.max(0,Math.round(sec));
  const m=Math.floor(sec/60), s=sec%60;
  return s ? m+' min '+s+'s' : m+' min';
}
function makeCustomPanel(){
  const cfg=customCfg(), w=state.workout;
  const div=document.createElement('div'); div.className='custom-panel';
  const modeBtn=(v,l)=>'<button class="cp-mode-btn'+(cfg.mode===v?' active':'')+'" onclick="setCustomCfg(\'mode\',\''+v+'\')">'+l+'</button>';
  div.innerHTML=
    '<div class="cp-head"><span class="sib-icon">🛠️</span><div>'+
      '<b>Custom class</b> — this plan is yours to shape. Reorder, swap or remove anything, '+
      'use <b>+ Add</b> for your own movements, and set the timing per exercise below.'+
    '</div></div>'+
    '<div class="cp-grid">'+
      '<label class="cp-field"><span>Rounds</span>'+
        '<input type="number" min="1" max="20" value="'+cfg.rounds+'" onchange="setCustomCfg(\'rounds\',this.value)"></label>'+
      '<label class="cp-field"><span>Rest between rounds</span>'+
        '<input type="number" min="0" max="600" step="5" value="'+cfg.roundRest+'" onchange="setCustomCfg(\'roundRest\',this.value)"></label>'+
      '<label class="cp-field"><span>Default work</span>'+
        '<input type="number" min="5" max="600" step="5" value="'+cfg.work+'" onchange="setCustomCfg(\'work\',this.value)"></label>'+
      '<label class="cp-field"><span>Default rest</span>'+
        '<input type="number" min="0" max="300" step="5" value="'+cfg.rest+'" onchange="setCustomCfg(\'rest\',this.value)"></label>'+
      '<div class="cp-field"><span>New exercises use</span>'+
        '<div class="cp-mode-row">'+modeBtn('time','⏱ Time')+modeBtn('reps','🔢 Reps')+'</div></div>'+
    '</div>'+
    '<div class="cp-foot">'+
      '<button class="cp-apply" onclick="applyCustomDefaultsToAll()">↧ Apply defaults to every exercise</button>'+
      '<span class="cp-total">Main block: <b id="custom-main-total">'+fmtMinSec(customMainSeconds(w))+'</b></span>'+
    '</div>';
  return div;
}
// Timing edits must not re-render the list — that would blur the input the
// instructor is still typing in. Only the two time readouts refresh.
function refreshCustomTotals(){
  const t=fmtMinSec(customMainSeconds());
  ['custom-main-total','custom-main-est'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.textContent=t;
  });
}
function setCustomCfg(field,val){
  const cfg=customCfg();
  if(field==='mode') { cfg.mode = val==='reps'?'reps':'time'; renderPlanEditor(); return; }
  const lim={rounds:[1,20,3],roundRest:[0,600,60],work:[5,600,40],rest:[0,300,20]}[field];
  if(!lim) return;
  cfg[field]=clampNum(val,lim[0],lim[1],lim[2]);
  refreshCustomTotals();
}
function setCustomExField(idx,field,val){
  const ex=state.workout.exercises[idx]; if(!ex) return;
  ex[field]=val;
  syncCustomEx(ex);
  const card=document.querySelector('.plan-card[data-index="'+idx+'"]');
  if(card){
    const r=card.querySelector('.exercise-reps'), u=card.querySelector('.exercise-reps-label');
    if(r) r.textContent=ex.reps;
    if(u) u.textContent=ex.unit;
  }
  refreshCustomTotals();
}
function setCustomExMode(idx,mode){
  const ex=state.workout.exercises[idx]; if(!ex) return;
  ex.cMode=mode; syncCustomEx(ex); renderPlanEditor();
}
function applyCustomDefaultsToAll(){
  const cfg=customCfg();
  state.workout.exercises.forEach(ex=>{
    ex.cWork=cfg.work; ex.cRest=cfg.rest; ex.cMode=cfg.mode; syncCustomEx(ex);
  });
  renderPlanEditor();
  showToast('Defaults applied to all '+state.workout.exercises.length+' exercises');
}
function makeCustomExRow(ex,i){
  const isReps=ex.cMode==='reps';
  return '<div class="cx-row" onclick="event.stopPropagation()">'+
    '<div class="cx-toggle">'+
      '<button class="cx-mode'+(!isReps?' active':'')+'" onclick="setCustomExMode('+i+',\'time\')">⏱ Time</button>'+
      '<button class="cx-mode'+(isReps?' active':'')+'" onclick="setCustomExMode('+i+',\'reps\')">🔢 Reps</button>'+
    '</div>'+
    (isReps
      ? '<label class="cx-field"><span>Reps</span><input type="number" min="1" max="200" value="'+ex.cReps+'" onchange="setCustomExField('+i+',\'cReps\',this.value)"></label>'+
        '<label class="cx-field"><span>Time cap</span><input type="number" min="5" max="600" step="5" value="'+ex.cWork+'" onchange="setCustomExField('+i+',\'cWork\',this.value)"></label>'
      : '<label class="cx-field"><span>Work</span><input type="number" min="5" max="600" step="5" value="'+ex.cWork+'" onchange="setCustomExField('+i+',\'cWork\',this.value)"></label>')+
    '<label class="cx-field"><span>Rest</span><input type="number" min="0" max="300" step="5" value="'+ex.cRest+'" onchange="setCustomExField('+i+',\'cRest\',this.value)"></label>'+
    '<label class="cx-field cx-prop"><span>Prop</span><select onchange="setCustomExProp('+i+',this.value)">'+
      Object.entries(PROP_LABELS).map(([v,l])=>'<option value="'+v+'"'+((ex.prop||'bodyweight')===v?' selected':'')+'>'+escapeHtml(l)+'</option>').join('')+
    '</select></label>'+
  '</div>';
}
function setCustomExProp(idx,prop){
  const ex=state.workout.exercises[idx]; if(!ex) return;
  ex.prop=prop; ex.propLabel=buildPropLabel(ex);
  renderPlanEditor();
}
function makePlanExCard(ex,i) {
  const card=document.createElement('div');
  card.className='exercise-card plan-card'; card.dataset.index=i; card.style.animationDelay=(i*0.04)+'s';
  const propCss=PROP_CSS[ex.prop]||'slate';
  const sig = ex.muscles && ex.muscles.primary ? ex.muscles : resolveMuscles(ex);
  const muscleChips =
    sig.primary.map(id=>'<span class="mg-chip mg-primary" title="Prime mover">'+muscleIcon(id)+' '+escapeHtml(muscleLabel(id,true))+'</span>').join('')+
    sig.secondary.map(id=>'<span class="mg-chip mg-secondary" title="Assisting">'+muscleIcon(id)+' '+escapeHtml(muscleLabel(id,true))+'</span>').join('')+
    (function(){
      const mv=resolveMovement(ex);
      return '<span class="pat-chip'+(mv.unilateral?' pat-chip-uni':'')+'" title="Movement pattern'+(mv.unilateral?' — single-side work':'')+'">'+
             patternIcon(mv.pattern)+' '+escapeHtml(patternLabel(mv.pattern,true))+(mv.unilateral?' ·1-side':'')+'</span>';
    })();
  card.innerHTML=
    '<div class="plan-drag-handle">⠿</div>'+
    '<div class="exercise-num">'+(i+1)+'</div>'+
    '<div class="exercise-info">'+
      '<div class="exercise-name">'+escapeHtml(ex.name)+(ex.isPartner?'<span class="partner-badge">👥 Partner</span>':'')+(ex._custom?'<span class="custom-badge">⭐</span>':'')+'</div>'+
      '<div class="exercise-details">'+
        '<span class="exercise-prop prop-'+propCss+'">'+ex.propLabel+'</span>'+
        '<span class="exercise-muscle-tag">'+escapeHtml(ex.muscle)+'</span>'+
        (ex.timed?'<span class="timed-badge">⏱ Timed</span>':'')+
      '</div>'+
      '<div class="mg-chip-row">'+muscleChips+'</div>'+
      (ex.cue?'<div class="ex-cue">💡 '+escapeHtml(ex.cue)+'</div>':'')+
      (state.workout.style==='custom'?makeCustomExRow(ex,i):'')+
      '<div class="mod-row">'+
        '<span class="mod-badge easier" title="'+escapeHtml(ex.easier)+'">↓ '+escapeHtml(ex.easier)+'</span>'+
        '<span class="mod-badge harder" title="'+escapeHtml(ex.harder)+'">↑ '+escapeHtml(ex.harder)+'</span>'+
      '</div>'+
    '</div>'+
    '<div class="exercise-right">'+
      '<div class="exercise-reps">'+escapeHtml(ex.reps)+'</div>'+
      '<div class="exercise-reps-label">'+escapeHtml(ex.unit)+'</div>'+
      '<div class="plan-card-actions">'+
        '<button class="edit-btn" onclick="editPlanExercise('+i+')" title="Edit">✏️</button>'+
        '<button class="swap-btn" onclick="swapExercise('+i+')" title="Swap (keeps muscle coverage)">⇄</button>'+
        '<button class="del-btn"  onclick="removeExercise('+i+')" title="Remove">✕</button>'+
      '</div>'+
    '</div>';
  return card;
}
function makePlanWarmCoolCard(ex,i,type) {
  const card=document.createElement('div');
  card.className='exercise-card '+type+'-card'; card.style.animationDelay=(i*0.04)+'s';
  card.innerHTML=
    '<div class="exercise-num wc-num">'+(i+1)+'</div>'+
    '<div class="exercise-info">'+
      '<div class="exercise-name">'+escapeHtml(ex.name)+(ex._custom?'<span class="custom-badge">⭐</span>':'')+'</div>'+
      '<div class="exercise-details"><span class="exercise-muscle-tag">'+escapeHtml(ex.note||'')+'</span></div>'+
    '</div>'+
    '<div class="exercise-right">'+
      '<div class="exercise-reps">'+ex.duration+'s</div>'+
      '<div class="exercise-reps-label">hold/work</div>'+
      '<div class="plan-card-actions">'+
        '<button class="edit-btn" onclick="editWarmCoolExercise(\''+type+'\','+i+')" title="Edit">✏️</button>'+
        '<button class="del-btn"  onclick="removeWarmCoolExercise(\''+type+'\','+i+')" title="Remove">✕</button>'+
      '</div>'+
    '</div>';
  return card;
}

function removeExercise(idx){
  state.workout.exercises.splice(idx,1);
  state.workout.muscleLoad=muscleLoadForExercises(state.workout.exercises);
  renderPlanEditor();
  // Dropping an exercise can leave the class without core work, or short on
  // time — surface the finisher rather than silently changing their plan.
  const advice=coreBurnerAdvice();
  if(advice) showToast('Exercise removed · 🎯 Core Burner suggested — '+advice.reason+'.');
  else showToast('Exercise removed');
}
function removeWarmCoolExercise(type,idx){if(type==='warmup')state.workout.warmup.splice(idx,1);else state.workout.cooldown.splice(idx,1);renderPlanEditor();showToast('Exercise removed');}
function swapExercise(idx,opts){
  opts=opts||{};
  const ex=state.workout.exercises[idx],diff=state.workout.diff;
  const wStyle=state.workout.style; // use resolved style from workout
  const focusKey=state.workout.muscle||state.muscle;
  const focusKeys=(MUSCLE_FOCUS[focusKey]||MUSCLE_FOCUS.full).keys;
  const contract=getFocusContract(focusKey);
  const inPlan=new Set(state.workout.exercises.map(e=>e.name));
  const sig=ex.muscles&&ex.muscles.primary?ex.muscles:resolveMuscles(ex);

  // Which majors would go uncovered if this exercise simply vanished?
  const others=state.workout.exercises.filter((_,i)=>i!==idx);
  const covered=new Set();
  others.forEach(o=>{const s=resolveMuscles(o);[...s.primary,...s.secondary].forEach(id=>covered.add(id));});
  const mustKeep=contract.requiredMajors.filter(id=>!covered.has(id)&&[...sig.primary,...sig.secondary].includes(id));

  // Candidates: every selected prop, same difficulty + focus, not already in the plan.
  // Focus matching mirrors generateWorkout: legacy tag OR resolved muscle signature.
  const contractGroups=new Set([...contract.requiredMajors,...contract.minorPool]);
  const pool=[];
  (state.props||[]).forEach(prop=>{
    (DB[prop]||[]).forEach(e=>{
      if(inPlan.has(e.name))return;
      if(!e.difficulty||!e.difficulty.includes(diff))return;
      const tagged=e.focus&&e.focus.some(f=>focusKeys.includes(f));
      if(!tagged){
        const es=resolveMuscles(e);
        if(![...es.primary,...es.secondary].some(id=>contractGroups.has(id)))return;
      }
      if(!propUsable(prop,state.workout.participants))return;
      if(e.avoidForTime&&['tabata','amrap','emom','circuit','hundred'].includes(wStyle))return;
      pool.push({...e,prop});
    });
  });
  if(!pool.length){ if(!opts.silent) showToast('No alternatives found!'); return; }

  // Prefer a replacement that preserves the coverage this slot provides.
  const scored=pool.map(c=>{
    const cs=resolveMuscles(c);
    const hits=[...cs.primary,...cs.secondary];
    let s=Math.random()*10;
    mustKeep.forEach(id=>{ if(cs.primary.includes(id)) s+=100; else if(hits.includes(id)) s+=55; });
    sig.primary.forEach(id=>{ if(cs.primary.includes(id)) s+=18; });
    if(c.prop===ex.prop) s+=6;      // same station = easiest to sub in live
    if(!!c.timed===!!ex.timed) s+=4;
    return {c,s};
  }).sort((a,b)=>b.s-a.s);

  const newEx=scored[0].c,range=newEx.repRange?.[diff]||[10,15];
  let reps,unit,seconds;
  switch(wStyle){
    case 'tabata':  reps='20s';    unit='work'; seconds=20; break;
    case 'circuit': reps='45s';    unit='work'; seconds=45; break;
    case 'ladder':  reps='5→20';   unit='reps'; seconds=30; break;
    case 'pyramid': reps='5→20→5'; unit='reps'; seconds=30; break;
    case 'hundred': reps=((idx+1)*10)+''; unit='reps'; seconds=Math.max(30,(idx+1)*8); break;
    case 'ygig':    reps=randInt(range[0],range[1]); unit='reps'; seconds=state.workout.ygigWorkSec||45; break;
    case 'custom':  reps=null; unit=null; seconds=null; break;
    default:        reps=randInt(range[0],range[1]); unit='reps'; seconds=40;
  }
  const propLabel=buildPropLabel(newEx);
  state.workout.exercises[idx]={...newEx,reps,unit,seconds,propLabel,
    isPartner:newEx.partner&&state.workout.participants>=4,muscles:resolveMuscles(newEx)};
  // A swap changes the movement, not the instructor's timing for that slot.
  if(wStyle==='custom'){
    const slot=state.workout.exercises[idx];
    slot.cMode=ex.cMode; slot.cWork=ex.cWork; slot.cRest=ex.cRest; slot.cReps=ex.cReps;
    initCustomEx(slot,customCfg(),diff);
  }
  state.workout.muscleLoad=muscleLoadForExercises(state.workout.exercises);
  if(opts.silent)return;
  renderPlanEditor();
  showToast('Swapped → '+newEx.name+(mustKeep.length?' (coverage kept)':''));
}
function editPlanExercise(idx){const ex=state.workout.exercises[idx];state.modal.editTarget='plan-main';state.modal.editIndex=idx;state.modal.category=exCat(ex);openExerciseModal(state.modal.category,ex);}
function editWarmCoolExercise(type,idx){const ex=type==='warmup'?state.workout.warmup[idx]:state.workout.cooldown[idx];state.modal.editTarget=type==='warmup'?'plan-warmup':'plan-cooldown';state.modal.editIndex=idx;state.modal.category=type;openExerciseModal(type,ex);}

// ─── SAVE / EXPORT ────────────────────────────────────────────
function saveWorkout(){
  if(!state.workout)return;
  const saved={id:Date.now(),name:state.workout.styleCfg.name+' — '+(MUSCLE_FOCUS[state.muscle]?.label||state.muscle),date:new Date().toLocaleDateString(),workout:state.workout,participants:state.workout.participants,duration:state.workout.duration,muscle:state.muscle,style:state.workout.style};
  state.savedWorkouts.unshift(saved);if(state.savedWorkouts.length>20)state.savedWorkouts.pop();
  saveToStorage();showToast('✅ Workout saved!','success');
}
function exportPDF(){
  if(!state.workout)return;
  if(typeof MA!=='undefined'&&MA.enabled){exportTieredPDF();return;}
  const {styleCfg,exercises,warmup,cooldown,diff}=state.workout;
  let html='<html><head><style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{color:#ff4d00}table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#f0f0f0;text-align:left;padding:7px;font-size:12px}td{padding:7px;border-bottom:1px solid #eee;font-size:12px}.section{margin:18px 0 6px;font-size:15px;font-weight:bold;border-bottom:2px solid #ff4d00;padding-bottom:3px}.footer{margin-top:28px;font-size:10px;color:#999;text-align:center}</style></head><body><h1>Inspire Habits Class</h1><p style="color:#666;font-size:13px">Style: <b>'+styleCfg.name+'</b> | Focus: <b>'+(MUSCLE_FOCUS[state.muscle]?.label||state.muscle)+'</b> | Difficulty: <b>'+(DIFF_LABEL[diff]||diff)+'</b> | Duration: <b>'+state.workout.duration+' min</b> | Participants: <b>'+state.workout.participants+'</b> | Date: <b>'+new Date().toLocaleDateString()+'</b></p>';
  if(warmup.length>0){html+='<div class="section">🔥 Warm-Up</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>';warmup.forEach((ex,i)=>{html+='<tr><td>'+(i+1)+'</td><td>'+ex.name+'</td><td>'+ex.duration+'s</td><td>'+(ex.note||'')+'</td></tr>';});html+='</table>';}
  html+=buildCoveragePDFSection(exercises, state.workout.muscle||state.muscle);
  html+='<div class="section">⚡ Main Workout</div><table><tr><th>#</th><th>Exercise</th><th>Prop</th><th>Muscle</th><th>Targets</th><th>Reps/Time</th><th>Easier</th><th>Harder</th></tr>';
  exercises.forEach((ex,i)=>{const sig=ex.muscles&&ex.muscles.primary?ex.muscles:resolveMuscles(ex);html+='<tr><td>'+(i+1)+'</td><td>'+ex.name+(ex.isPartner?' 👥':'')+'</td><td>'+ex.propLabel+'</td><td>'+ex.muscle+'</td><td style="font-size:10px">'+sig.primary.map(id=>muscleLabel(id,true)).join(', ')+(sig.secondary.length?' <span style="color:#999">(+'+sig.secondary.map(id=>muscleLabel(id,true)).join(', ')+')</span>':'')+'</td><td>'+ex.reps+' '+ex.unit+'</td><td style="color:#888;font-size:11px">'+(ex.easier||'')+'</td><td style="color:#888;font-size:11px">'+(ex.harder||'')+'</td></tr>';});
  html+='</table>';
  const cbPdf=state.workout.coreBurner;
  if(cbPdf&&cbPdf.exercises.length){
    html+='<div class="section">🎯 Core Burner — '+cbPdf.work+'s on / '+cbPdf.rest+'s off'+(cbPdf.rounds>1?' &times; '+cbPdf.rounds+' rounds':'')+'</div><table><tr><th>#</th><th>Exercise</th><th>Prop</th><th>Pattern</th><th>Work</th></tr>';
    cbPdf.exercises.forEach((ex,i)=>{html+='<tr><td>'+(i+1)+'</td><td>'+ex.name+'</td><td>'+ex.propLabel+'</td><td>'+(CORE_PATTERN_LABEL[ex._cbPattern]||'Core')+'</td><td>'+cbPdf.work+'s</td></tr>';});
    html+='</table>';
  }
  if(cooldown.length>0){html+='<div class="section">❄️ Cool-Down</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>';cooldown.forEach((ex,i)=>{html+='<tr><td>'+(i+1)+'</td><td>'+ex.name+'</td><td>'+ex.duration+'s</td><td>'+(ex.note||'')+'</td></tr>';});html+='</table>';}
  html+='<div class="footer">Generated by Inspire Habits · '+new Date().toLocaleString()+'</div></body></html>';
  const win=window.open('','_blank');win.document.write(html);win.document.close();win.print();
}
function buildCoveragePDFSection(exercises, focusKey){
  const r=analyzeCoverage(exercises,focusKey);
  let h='<div class="section">🧬 Muscle Coverage</div><table><tr><th>Major group</th><th>Direct</th><th>Assist</th><th>Exercises</th></tr>';
  r.majors.forEach(m=>{
    h+='<tr><td><b>'+m.label+'</b></td><td>'+m.direct+'</td><td>'+m.assist+'</td><td style="font-size:10px;color:'+(m.covered?'#555':'#c00')+'">'+(m.exercises.join(', ')||'⚠️ NOT COVERED')+'</td></tr>';
  });
  h+='</table>';
  const hit=r.minors.filter(m=>m.covered);
  if(hit.length) h+='<p style="font-size:11px;color:#666">Accessory groups trained: <b>'+hit.map(m=>m.label).join(', ')+'</b></p>';
  if(r.balance){
    h+='<p style="font-size:11px;color:#666">Movement balance: '+
       r.balance.pairs.map(p=>p.label+' <b>'+p.countA+'/'+p.countB+'</b>'+(p.ok?'':' ⚠️')).join(' &nbsp;·&nbsp; ')+
       (r.balance.pairs.length?' &nbsp;·&nbsp; ':'')+
       'Single-side work <b>'+r.balance.unilateral+'</b>'+(r.balance.unilateralOk?'':' ⚠️')+'</p>';
  }
  return h;
}
function logWorkoutComplete(){
  if(!state.workout)return;
  const exs=state.workout.exercises||[];
  // Roll today's check-ins into each participant's attendance record.
  if(typeof Roster!=='undefined'&&typeof MA!=='undefined'&&MA.enabled)Roster.commitAttendance();
  // Rich entry: the coverage engine reads muscleLoad + exerciseNames to
  // rotate accessory work away from what was just taught.
  state.workoutHistory.unshift({
    id:Date.now(), ts:Date.now(),
    date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
    style:state.workout.styleCfg.name,
    muscle:MUSCLE_FOCUS[state.workout.muscle||state.muscle]?.label||state.muscle,
    muscleKey:state.workout.muscle||state.muscle,
    duration:state.workout.duration, participants:state.workout.participants,
    exercises:exs.length,
    exerciseNames:exs.map(e=>e.name),
    muscleLoad:muscleLoadForExercises(exs),
    accessoryFocus:state.workout.accessoryFocus||[],
    profileId:(typeof profileState!=='undefined')?profileState.activeProfile:null,
  });
  if(state.workoutHistory.length>50)state.workoutHistory.pop();
  saveToStorage();
}
function showHistory(){
  const hc=document.getElementById('history-list');hc.innerHTML='';
  if(!state.workoutHistory.length)hc.innerHTML='<div class="empty-state">No workout history yet.</div>';
  else state.workoutHistory.forEach(e=>{
    const d=document.createElement('div');d.className='history-card';
    const top=Object.entries(e.muscleLoad||{}).sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([id])=>'<span class="hist-mg">'+muscleIcon(id)+' '+escapeHtml(muscleLabel(id,true))+'</span>').join('');
    d.innerHTML='<div class="history-date">'+escapeHtml(e.date)+' '+escapeHtml(e.time)+'</div>'+
      '<div class="history-info"><span class="history-style">'+escapeHtml(e.style)+'</span><span class="history-muscle">'+escapeHtml(e.muscle)+'</span></div>'+
      '<div class="history-meta">'+e.duration+' min · '+e.participants+' people · '+e.exercises+' exercises</div>'+
      (top?'<div class="hist-mg-row">'+top+'</div>':'');
    hc.appendChild(d);
  });
  const sc=document.getElementById('saved-list');sc.innerHTML='';
  if(!state.savedWorkouts.length)sc.innerHTML='<div class="empty-state">No saved workouts yet.</div>';
  else state.savedWorkouts.forEach(sw=>{const d=document.createElement('div');d.className='history-card saved-card';d.innerHTML='<div class="history-date">'+sw.date+'</div><div class="history-info"><span class="history-style">'+sw.name+'</span></div><div class="history-meta">'+sw.duration+' min · '+sw.participants+' people</div><div class="saved-actions"><button class="small-btn" onclick="loadSavedWorkout('+sw.id+')">▶ Load</button><button class="small-btn danger" onclick="deleteSavedWorkout('+sw.id+')">✕</button></div>';sc.appendChild(d);});
  showScreen('history-screen');
}
function loadSavedWorkout(id){const sw=state.savedWorkouts.find(s=>s.id===id);if(!sw)return;state.workout=sw.workout;state.muscle=sw.muscle;renderPlanEditor();showScreen('plan-editor-screen');}
function deleteSavedWorkout(id){state.savedWorkouts=state.savedWorkouts.filter(s=>s.id!==id);saveToStorage();showHistory();}

// ─── TIMER SEQUENCE ───────────────────────────────────────────
function buildTimerSequence(){
  const {style,exercises,warmup,cooldown}=state.workout,seq=[];
  warmup.forEach((ex,i)=>{
    if(i===0)seq.push({phase:'get-ready',label:'GET READY',name:'Warm-Up Starting',prop:'',duration:3});
    seq.push({phase:'warmup',label:'WARM-UP',name:ex.name,prop:ex.note||'',duration:ex.duration,round:i+1,totalRounds:warmup.length,_exIdx:i});
    seq.push({phase:'rest',label:'NEXT',name:'',prop:'',duration:5});
  });
  seq.push({phase:'get-ready',label:'MAIN WORKOUT',name:'Get Ready!',prop:'',duration:5});
  if(style==='tabata'){exercises.forEach((ex,ei)=>{for(let r=0;r<8;r++){seq.push({phase:'work',label:'WORK',name:ex.name,prop:ex.propLabel,duration:20,round:r+1,totalRounds:8,_exIdx:ei});seq.push({phase:'rest',label:'REST',name:ex.name,prop:'',duration:10,round:r+1,totalRounds:8,_exIdx:ei});}seq.push({phase:'rest',label:'NEXT EXERCISE',name:'',prop:'',duration:10});});}
  else if(style==='circuit'){for(let r=0;r<3;r++){seq.push({phase:'get-ready',label:'ROUND '+(r+1)+' OF 3',name:'Round Starting',prop:'',duration:5});exercises.forEach((ex,ei)=>{seq.push({phase:'work',label:'WORK',name:ex.name,prop:ex.propLabel,duration:45,round:r+1,totalRounds:3,_exIdx:ei});seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:15});});if(r<2)seq.push({phase:'rest',label:'ROUND REST',name:'',prop:'',duration:30});}}
  else if(style==='emom'){
    const exPerMin=exercises.length<=6?2:3;
    const workPerEx=Math.floor(40/exPerMin);
    let minuteNum=0;
    for(let i=0;i<exercises.length;i+=exPerMin){
      minuteNum++;
      const group=exercises.slice(i,i+exPerMin);
      const totalMins=Math.ceil(exercises.length/exPerMin);
      seq.push({phase:'get-ready',label:'MINUTE '+minuteNum+' OF '+totalMins,name:group.map(e=>e.name).join(' + '),prop:'',duration:4});
      group.forEach((ex,gi)=>{
        seq.push({phase:'work',label:'WORK ('+(gi+1)+'/'+group.length+')',name:ex.name,prop:ex.propLabel,
          duration:workPerEx,round:minuteNum,totalRounds:totalMins,_exIdx:i+gi});
      });
      seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:20});
    }
  }
  else if(style==='amrap'){const perEx=Math.max(30,Math.floor(state.workout.mainDur*60/exercises.length));exercises.forEach((ex,i)=>{seq.push({phase:'work',label:'AMRAP',name:ex.name,prop:ex.propLabel,duration:perEx,round:1,totalRounds:1,_exIdx:i});seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:10});});}
  else if(style==='ladder'){[5,10,15,20].forEach((reps,ri)=>{exercises.forEach((ex,ei)=>{seq.push({phase:'work',label:reps+' REPS',name:ex.name,prop:ex.propLabel,duration:30,round:ri+1,totalRounds:4,_exIdx:ei});seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:15});});});}
  else if(style==='pyramid'){[5,10,15,20,15,10,5].forEach((reps,ri)=>{seq.push({phase:'get-ready',label:reps+' REPS',name:'Round '+(ri+1)+' of 7',prop:'',duration:4});exercises.forEach((ex,ei)=>{seq.push({phase:'work',label:reps+' REPS',name:ex.name,prop:ex.propLabel,duration:30,round:ri+1,totalRounds:7,_exIdx:ei});seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:15});});});}
  else if(style==='hundred'){
    seq.push({phase:'get-ready',label:'100 REPS CHALLENGE',name:'10 + 20 + 30 ... + 100 reps',prop:'',duration:5});
    exercises.forEach((ex,i)=>{
      const reps=(i+1)*10;
      const restSec=Math.max(15,reps*1.5|0); // more rest for higher reps
      seq.push({phase:'work',label:'EX '+(i+1)+'/10 — '+reps+' REPS',name:ex.name,prop:ex.propLabel,
        duration:Math.max(30,reps*3),round:i+1,totalRounds:10,_exIdx:i,_hundredReps:reps});
      seq.push({phase:'rest',label:'REST ('+(i<9?'next: '+((i+2)*10)+' reps':'last set!')+')',name:'',prop:'',duration:restSec});
    });
    seq.push({phase:'get-ready',label:'💯 100 REPS DONE!',name:'Amazing work! Total: 550 reps',prop:'',duration:5});
  }
  else if(style==='ygig'){
    seq.push({phase:'get-ready',label:'YOU-GO-I-GO',name:'Partners ready!',prop:'',duration:5});
    const totalPairs=Math.floor(exercises.length/2);
    for(let i=0;i<exercises.length;i+=2){
      const primary=exercises[i];
      const activeRest=exercises[i+1]||exercises[i];
      const pairNum=Math.floor(i/2)+1;
      seq.push({phase:'get-ready',label:'PAIR '+pairNum+' OF '+totalPairs,name:primary.name+' + '+activeRest.name,prop:'',duration:5});
      // Round 1: Person A does primary reps, Person B holds active rest
      seq.push({phase:'work',label:'PERSON A — REPS',name:primary.name,prop:primary.propLabel,
        duration:state.workout.ygigWorkSec||primary.seconds||45,round:1,totalRounds:2,_exIdx:i,
        _ygig:{role:'primary',partner:activeRest.name,partnerProp:activeRest.propLabel,reps:primary.reps}});
      seq.push({phase:'rest',label:'SWITCH!',name:'Partners switch positions',prop:'',duration:8});
      // Round 2: Person B does primary reps, Person A holds active rest
      seq.push({phase:'work',label:'PERSON B — REPS',name:primary.name,prop:primary.propLabel,
        duration:state.workout.ygigWorkSec||primary.seconds||45,round:2,totalRounds:2,_exIdx:i,
        _ygig:{role:'primary',partner:activeRest.name,partnerProp:activeRest.propLabel,reps:primary.reps}});
      seq.push({phase:'rest',label:'NEXT PAIR',name:'',prop:'',duration:10});
    }
  }
  else if(style==='superset'){for(let i=0;i<exercises.length;i+=2){const pair=exercises.slice(i,i+2);for(let r=0;r<4;r++){pair.forEach((ex,pi)=>{seq.push({phase:'work',label:'WORK',name:ex.name,prop:ex.propLabel,duration:40,round:r+1,totalRounds:4,_exIdx:i+pi});seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:20});});}seq.push({phase:'rest',label:'SUPERSET REST',name:'',prop:'',duration:30});}}
  else if(style==='custom'){buildCustomMainSeq(state.workout).forEach(s=>seq.push(s));}
  const cb=state.workout.coreBurner;
  if(cb&&cb.exercises.length){
    const rounds=Math.max(1,cb.rounds||1);
    seq.push({phase:'get-ready',label:'🎯 CORE BURNER',
      name:cb.exercises.length+' core moves · '+cb.work+'s on / '+cb.rest+'s off',prop:'',duration:5});
    for(let r=0;r<rounds;r++){
      if(rounds>1) seq.push({phase:'get-ready',label:'CORE ROUND '+(r+1)+' OF '+rounds,name:'',prop:'',duration:4});
      cb.exercises.forEach((ex,i)=>{
        seq.push({phase:'work',label:'CORE BURNER',name:ex.name,prop:ex.propLabel,
          duration:cb.work,round:r+1,totalRounds:rounds,_cbIdx:i});
        if(cb.rest>0) seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:cb.rest});
      });
    }
  }
  if(cooldown.length>0){seq.push({phase:'get-ready',label:'COOL-DOWN',name:'Great Work!',prop:'',duration:5});cooldown.forEach((ex,i)=>{seq.push({phase:'cooldown',label:'STRETCH',name:ex.name,prop:ex.note||'',duration:ex.duration,round:i+1,totalRounds:cooldown.length,_exIdx:i});seq.push({phase:'rest',label:'NEXT',name:'',prop:'',duration:5});});}
  // Attach coaching cues once, centrally — every style builder benefits without
  // each one having to remember to pass the field through.
  const cueByName = {};
  exercises.forEach(ex => { if (ex.cue) cueByName[ex.name] = ex.cue; });
  if (state.workout.coreBurner) state.workout.coreBurner.exercises.forEach(ex => { if (ex.cue) cueByName[ex.name] = ex.cue; });
  seq.forEach(s => { if (s.phase === 'work' && cueByName[s.name]) s.cue = cueByName[s.name]; });
  return seq;
}

// ─── TIMER ENGINE ─────────────────────────────────────────────
function startTimerEngine(viewMode){
  const seq=buildTimerSequence();
  state.timer.sequence=seq;state.timer.current=0;state.timer.totalSteps=seq.length;state.timer.isRunning=false;
  state.viewMode=viewMode;
  buildSidebar();
  if(typeof syncClassQRButton==='function')syncClassQRButton();
  if(viewMode==='participant'){showScreen('participant-screen');loadTimerStep(0);if(typeof MA!=='undefined'&&MA.enabled){injectMALiveUI();renderMAGroupBanner();}}
  else{document.getElementById('timer-style-name').textContent=state.workout.styleCfg.icon+' '+state.workout.styleCfg.name;showScreen('timer-screen');loadTimerStep(0);if(typeof MA!=='undefined'&&MA.enabled)injectMAInstructorUI();}
  toggleTimer();
}
function goLive(){startTimerEngine('participant');}
function openInstructorView(){startTimerEngine('instructor');}
function buildSidebar(){const list=document.getElementById('sidebar-exercise-list');if(!list)return;list.innerHTML='';state.workout.exercises.forEach((ex,i)=>{const d=document.createElement('div');d.className='sidebar-ex';d.id='sidebar-ex-'+i;d.innerHTML='<span class="sidebar-num">'+(i+1)+'</span><span class="sidebar-name">'+ex.name+'</span><span class="sidebar-reps">'+ex.reps+'</span>';list.appendChild(d);});
  const cb=state.workout.coreBurner;
  if(cb&&cb.exercises.length){
    const hd=document.createElement('div');hd.className='sidebar-cb-head';hd.textContent='🎯 Core Burner';list.appendChild(hd);
    cb.exercises.forEach((ex,i)=>{const d=document.createElement('div');d.className='sidebar-ex sidebar-cb';d.id='sidebar-cb-'+i;d.innerHTML='<span class="sidebar-num">•</span><span class="sidebar-name">'+escapeHtml(ex.name)+'</span><span class="sidebar-reps">'+cb.work+'s</span>';list.appendChild(d);});
  }
}
function loadTimerStep(idx){
  const seq=state.timer.sequence;if(idx>=seq.length){finishWorkout();return;}
  const step=seq[idx];state.timer.seconds=step.duration;
  if(step.phase==='work')audioCue.startWork();else if(step.phase==='rest')audioCue.startRest();
  const phaseEl=document.getElementById('timer-phase');phaseEl.textContent=step.label;phaseEl.className='phase-label';
  if(step.phase==='work')phaseEl.classList.add('work');else if(step.phase==='rest')phaseEl.classList.add('rest');else if(step.phase==='warmup'||step.phase==='cooldown')phaseEl.classList.add('warmcool');else phaseEl.classList.add('get-ready');
  // 100-rep: show progressive rep count prominently
  if(step._hundredReps && step.phase==='work'){
    document.getElementById('timer-exercise').textContent=step.name+' — '+step._hundredReps+' REPS';
  }
  // YGIG: show both partner exercises
  if(step._ygig && step.phase==='work'){
    const ygigInfo=document.getElementById('ygig-partner-info');
    if(ygigInfo){
      ygigInfo.style.display='block';
      ygigInfo.innerHTML='<div class="ygig-timer-primary"><span class="ygig-timer-label">'+step.label+'</span><span class="ygig-timer-ex">'+step.name+'</span><span class="ygig-timer-reps">'+step._ygig.reps+' reps</span></div><div class="ygig-timer-rest"><span class="ygig-timer-label-rest">PARTNER — ACTIVE REST</span><span class="ygig-timer-ex-rest">'+step._ygig.partner+'</span><span class="ygig-timer-reps-rest">Hold until done</span></div>';
    }
    document.getElementById('timer-exercise').textContent=step.name||'';
  } else {
    const ygigInfo=document.getElementById('ygig-partner-info');
    if(ygigInfo) ygigInfo.style.display='none';
    document.getElementById('timer-exercise').textContent=step.name||'';
  }
  const propEl=document.getElementById('timer-prop');propEl.textContent=step.prop||'';propEl.style.display=step.prop?'inline-block':'none';
  const cueEl=document.getElementById('timer-cue');
  if(cueEl){cueEl.textContent=step.cue?'💡 '+step.cue:'';cueEl.style.display=step.cue?'block':'none';}
  const arc=document.getElementById('timer-arc');arc.className='timer-progress';
  if(step.phase==='rest')arc.classList.add('rest-mode');else if(step.phase==='warmup'||step.phase==='cooldown')arc.classList.add('warmcool-mode');
  document.getElementById('current-round').textContent=step.round?'Round '+step.round:'';
  document.getElementById('total-rounds').textContent=step.totalRounds?'/ '+step.totalRounds:'';
  const next=seq[idx+1],nextBox=document.getElementById('next-up-box');
  if(next){document.getElementById('next-exercise').textContent=next.name?(next.phase==='rest'?'😮‍💨 Rest':next.name):next.label;nextBox.style.display='flex';}else nextBox.style.display='none';
  updateTimerDisplay();updateOverallProgress(idx);loadParticipantStep(idx);
}
function loadParticipantStep(idx){
  const seq=state.timer.sequence;if(idx>=seq.length)return;const step=seq[idx];
  if(typeof MA!=='undefined'&&MA.enabled){renderLiveClassView(idx);return;}
  const pPhase=document.getElementById('p-phase');if(!pPhase)return;
  pPhase.textContent=step.label;pPhase.className='p-phase-label';
  if(step.phase==='work')pPhase.classList.add('work');else if(step.phase==='rest')pPhase.classList.add('rest');else pPhase.classList.add('neutral');

  // Build the headline + sub-line first, then write once. (Previously the
  // 100-rep / YGIG text was overwritten by the generic assignment below.)
  let headline=step.name||'';
  const next=seq[idx+1];
  let subline=next?.name?'Next: '+next.name:(next?.label?'Next: '+next.label:'');
  if(step.phase==='work'&&step._hundredReps){ subline=step._hundredReps+' reps this set'; }
  if(step.phase==='work'&&step._ygig){
    headline=step.name+' — '+step._ygig.reps+' reps';
    subline='Partner: '+step._ygig.partner+' (active rest)';
  }
  document.getElementById('p-exercise').textContent=headline;
  document.getElementById('p-next').textContent=subline;

  const pProp=document.getElementById('p-prop');pProp.textContent=step.prop||'';pProp.style.display=step.prop?'block':'none';
  const pDisp=document.getElementById('p-timer');if(pDisp)pDisp.textContent=String(step.duration).padStart(2,'0');
  const pProg=document.getElementById('p-overall-progress');if(pProg)pProg.style.width=(idx/state.timer.totalSteps*100)+'%';
}
// ─── AUDIO CUES ───────────────────────────────────────────────
// Synthesised with WebAudio — no asset files, works offline.
const audioCue = {
  enabled: localStorage.getItem('hiit_sound') !== 'off',
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  beep(freq = 880, ms = 130, gain = 0.18) {
    if (!this.enabled) return;
    const ctx = this.ensure(); if (!ctx) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + ms / 1000);
  },
  countdown() { this.beep(660, 110, 0.14); },
  startWork()  { this.beep(990, 220, 0.22); },
  startRest()  { this.beep(440, 220, 0.18); },
  finish()     { [523,659,784].forEach((f,i)=>setTimeout(()=>this.beep(f,260,0.22), i*180)); },
};
function toggleSound(){
  audioCue.enabled = !audioCue.enabled;
  localStorage.setItem('hiit_sound', audioCue.enabled ? 'on' : 'off');
  document.querySelectorAll('.sound-toggle-btn').forEach(b => b.textContent = audioCue.enabled ? '🔊' : '🔇');
  if (audioCue.enabled) audioCue.beep(880, 120);
  showToast(audioCue.enabled ? '🔊 Audio cues on' : '🔇 Audio cues off');
}

function updateTimerDisplay(){
  const s=state.timer.seconds;
  document.getElementById('timer-display').textContent=String(s).padStart(2,'0');
  const step=state.timer.sequence[state.timer.current],total=step?step.duration:1;
  document.getElementById('timer-arc').style.strokeDashoffset=CIRCUMFERENCE*(1-s/total);
  const pDisp=document.getElementById('p-timer');if(pDisp)pDisp.textContent=String(s).padStart(2,'0');
  const pCircle=document.getElementById('p-timer-circle');
  if(pCircle&&step){pCircle.className='p-timer-circle';if(step.phase==='rest')pCircle.classList.add('rest');else if(step.phase==='warmup'||step.phase==='cooldown')pCircle.classList.add('warmcool');}
}
function updateOverallProgress(idx){const pct=idx/state.timer.totalSteps*100;document.getElementById('overall-progress').style.width=pct+'%';document.getElementById('progress-label').textContent=idx+' / '+state.timer.totalSteps+' intervals';}
function toggleTimer(){
  if(state.timer.isRunning){
    clearInterval(state.timer.interval);state.timer.isRunning=false;
    persistLiveSession();releaseWakeLock();
    document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='▶';});
  } else {
    state.timer.isRunning=true;
    audioCue.ensure(); // unlock WebAudio inside the user gesture
    requestWakeLock(); // must also be inside the gesture to be granted
    document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='⏸';});
    // Deadline-based so the clock can't drift on a long class or a
    // backgrounded tab the way a naive 1000ms decrement does.
    // Recover the duration from the current step if a caller painted the
    // screen without loading it, otherwise the first tick sees 0 remaining
    // and the clock never starts.
    if(!state.timer.seconds){const st=state.timer.sequence[state.timer.current];if(st)state.timer.seconds=st.duration;}
    state.timer.deadline = Date.now() + state.timer.seconds*1000;
    state.timer.lastWhole = state.timer.seconds;
    state.timer.interval=setInterval(()=>{
      const remaining=Math.max(0,Math.ceil((state.timer.deadline-Date.now())/1000));
      if(remaining===state.timer.lastWhole)return;
      state.timer.lastWhole=remaining;
      state.timer.seconds=remaining;
      if(remaining>0&&remaining<=3)audioCue.countdown();
      if(remaining<=0){
        state.timer.current++;
        loadTimerStep(state.timer.current);
        persistLiveSession(); // checkpoint on every interval boundary
        if(state.timer.isRunning){
          state.timer.deadline=Date.now()+state.timer.seconds*1000;
          state.timer.lastWhole=state.timer.seconds;
        }
      } else updateTimerDisplay();
    },200);
  }
}
function stopTimer(){clearInterval(state.timer.interval);state.timer.isRunning=false;persistLiveSession();releaseWakeLock();}
function nextExercise(){stopTimer();state.timer.current=Math.min(state.timer.current+1,state.timer.sequence.length-1);loadTimerStep(state.timer.current);if(!state.timer.isRunning)toggleTimer();}
function prevExercise(){stopTimer();state.timer.current=Math.max(0,state.timer.current-1);loadTimerStep(state.timer.current);if(!state.timer.isRunning)toggleTimer();}

// ─── LIVE SESSION PERSISTENCE ─────────────────────────────────
// A dropped phone or an accidental refresh mid-class used to lose
// everything. The running class is now checkpointed to localStorage
// so it can be resumed exactly where it left off.
const LIVE_KEY='hiit_live_session';
function persistLiveSession(){
  try{
    if(!state.workout||!state.timer.sequence.length)return;
    localStorage.setItem(LIVE_KEY,JSON.stringify({
      savedAt:Date.now(),
      workout:state.workout,
      muscle:state.muscle,
      viewMode:state.viewMode,
      current:state.timer.current,
      seconds:state.timer.seconds,
      totalSteps:state.timer.totalSteps,
      ma:(typeof MA!=='undefined'&&MA.enabled)?{enabled:true,groups:MA.groups,assignments:MA.assignments||null}:null,
    }));
  }catch(e){/* storage full or blocked — never break the class over it */}
}
function clearLiveSession(){try{localStorage.removeItem(LIVE_KEY);}catch(e){}}
function readLiveSession(){
  try{
    const raw=localStorage.getItem(LIVE_KEY);if(!raw)return null;
    const s=JSON.parse(raw);
    // Anything older than 4 hours is a stale class, not a refresh.
    if(!s||!s.workout||Date.now()-s.savedAt>4*60*60*1000){clearLiveSession();return null;}
    return s;
  }catch(e){return null;}
}
/** Called on load — offers to resume an interrupted class. */
function offerSessionResume(){
  const s=readLiveSession();
  if(!s)return false;
  const mins=Math.round((Date.now()-s.savedAt)/60000);
  const when=mins<1?'less than a minute ago':(mins===1?'1 minute ago':mins+' minutes ago');
  const bar=document.createElement('div');
  bar.className='resume-bar';
  bar.innerHTML='<span class="resume-icon">⏱️</span>'+
    '<span class="resume-text">Class in progress — interrupted '+when+
    ' at interval <b>'+(s.current+1)+' of '+s.totalSteps+'</b>.</span>'+
    '<button class="resume-btn" id="resume-yes">▶ Resume class</button>'+
    '<button class="resume-btn ghost" id="resume-no">Discard</button>';
  document.body.appendChild(bar);
  document.getElementById('resume-yes').onclick=()=>{bar.remove();resumeLiveSession(s);};
  document.getElementById('resume-no').onclick=()=>{bar.remove();clearLiveSession();};
  return true;
}
function resumeLiveSession(s){
  state.workout=s.workout;
  state.muscle=s.muscle||state.muscle;
  if(s.ma&&typeof MA!=='undefined'){MA.enabled=true;MA.groups=s.ma.groups||MA.groups;if(s.ma.assignments)MA.assignments=s.ma.assignments;}
  const seq=buildTimerSequence();
  state.timer.sequence=seq;
  state.timer.totalSteps=seq.length;
  state.timer.current=Math.min(s.current||0,seq.length-1);
  state.viewMode=s.viewMode||'instructor';
  buildSidebar();
  if(state.viewMode==='participant'){
    showScreen('participant-screen');loadParticipantStep(state.timer.current);
    if(typeof MA!=='undefined'&&MA.enabled){injectMALiveUI();renderMAGroupBanner();}
  } else {
    document.getElementById('timer-style-name').textContent=state.workout.styleCfg.icon+' '+state.workout.styleCfg.name;
    showScreen('timer-screen');loadTimerStep(state.timer.current);
    if(typeof MA!=='undefined'&&MA.enabled)injectMAInstructorUI();
  }
  // Restore the exact second they were on, then wait for the instructor to hit play.
  if(s.seconds>0)state.timer.seconds=s.seconds;
  updateTimerDisplay();
  showToast('▶ Resumed at interval '+(state.timer.current+1)+' — press play when ready');
}

// ─── SCREEN WAKE LOCK ─────────────────────────────────────────
// Stops the phone/tablet sleeping mid-class.
let _wakeLock=null;
async function requestWakeLock(){
  try{
    if(!('wakeLock' in navigator))return;
    if(_wakeLock)return;
    _wakeLock=await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release',()=>{_wakeLock=null;});
  }catch(e){/* denied or unsupported — silent, it's a nicety not a requirement */}
}
function releaseWakeLock(){
  try{ if(_wakeLock){_wakeLock.release();_wakeLock=null;} }catch(e){}
}
if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&state.timer.isRunning)requestWakeLock();
  });
  window.addEventListener('beforeunload',()=>{ if(state.timer.sequence&&state.timer.sequence.length)persistLiveSession(); });
}

function finishWorkout(){
  stopTimer();logWorkoutComplete();audioCue.finish();clearLiveSession();
  document.getElementById('timer-exercise').textContent='🎉 Workout Complete!';
  document.getElementById('timer-phase').textContent='DONE';document.getElementById('timer-phase').className='phase-label get-ready';
  document.getElementById('timer-display').textContent='✓';
  document.getElementById('overall-progress').style.width='100%';
  document.getElementById('progress-label').textContent='Workout complete! Great job! 🔥';
  document.getElementById('next-up-box').style.display='none';
  document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='▶';});
  const pPhase=document.getElementById('p-phase');if(pPhase){pPhase.textContent='DONE! 🎉';pPhase.className='p-phase-label neutral';}
  const pEx=document.getElementById('p-exercise');if(pEx)pEx.textContent='Amazing Work!';
}

// MA banner helper
function renderMAGroupBanner() {
  const banner=document.getElementById('ma-group-banner'); if(!banner)return;
  if(typeof MA==='undefined'){banner.style.display='none';return;}
  const activeGroups=MA.groups.filter(g=>g.count>0);
  if(!activeGroups.length){banner.style.display='none';return;}
  banner.style.display='flex';
  banner.innerHTML=activeGroups.map(g=>`<div class="ma-banner-chip ma-banner-${g.color}">${g.icon} <b>${g.label}</b> · ${g.count} people${g.names?`<span class="ma-banner-names">${g.names}</span>`:''}</div>`).join('');
}

// MA tiered PDF (called from exportPDF when MA enabled)
function exportTieredPDF() {
  if(!state.workout)return;
  const {styleCfg,exercises,warmup,cooldown,diff}=state.workout;
  let html=`<html><head><style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{color:#ff4d00}table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#f0f0f0;text-align:left;padding:7px;font-size:12px}td{padding:7px;border-bottom:1px solid #eee;font-size:12px}.section{margin:18px 0 6px;font-size:15px;font-weight:bold;border-bottom:2px solid #ff4d00;padding-bottom:3px}.footer{margin-top:28px;font-size:10px;color:#999;text-align:center}</style></head><body>
  <h1>Inspire Habits Class — Mixed Ability</h1>
  <p style="color:#666;font-size:13px">Style: <b>${styleCfg.name}</b> | Focus: <b>${MUSCLE_FOCUS[state.muscle]?.label||state.muscle}</b> | Duration: <b>${state.workout.duration} min</b> | Participants: <b>${state.workout.participants}</b> | Date: <b>${new Date().toLocaleDateString()}</b></p>`;
  if(typeof buildTieredPDFSection==='function') html+=buildTieredPDFSection(exercises);
  html+=buildCoveragePDFSection(exercises, state.workout.muscle||state.muscle);
  if(warmup.length>0){html+=`<div class="section">🔥 Warm-Up</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>`;warmup.forEach((ex,i)=>{html+=`<tr><td>${i+1}</td><td>${ex.name}</td><td>${ex.duration}s</td><td>${ex.note||''}</td></tr>`;});html+=`</table>`;}
  if(cooldown.length>0){html+=`<div class="section">❄️ Cool-Down</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>`;cooldown.forEach((ex,i)=>{html+=`<tr><td>${i+1}</td><td>${ex.name}</td><td>${ex.duration}s</td><td>${ex.note||''}</td></tr>`;});html+=`</table>`;}
  html+=`<div class="footer">Generated by Inspire Habits · ${new Date().toLocaleString()}</div></body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); win.print();
}

// YGIG time control
function selectYgigTime(btn) {
  document.querySelectorAll('.ygig-time-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  state.ygigWorkSec = parseInt(btn.dataset.sec);
  // Update workout if already generated
  if (state.workout && state.workout.style==='ygig') {
    state.workout.ygigWorkSec = state.ygigWorkSec;
    state.workout.exercises.forEach(ex => { ex.seconds = state.ygigWorkSec; });
    renderPlanEditor();
  }
}
function setCustomYgigTime(val) {
  const v = Math.min(120, Math.max(15, parseInt(val)||45));
  state.ygigWorkSec = v;
  document.querySelectorAll('.ygig-time-btn').forEach(b=>b.classList.remove('active'));
  if (state.workout && state.workout.style==='ygig') {
    state.workout.ygigWorkSec = v;
    state.workout.exercises.forEach(ex => { ex.seconds = v; });
    renderPlanEditor();
  }
}

// Navigation
function goBack(){stopTimer();showScreen('setup-screen');}
function goToPlanEditor(){stopTimer();showScreen('plan-editor-screen');}
function switchToParticipant(){state.viewMode='participant';showScreen('participant-screen');}
function switchToInstructor(){state.viewMode='instructor';showScreen('timer-screen');}

// Init — single listener
document.addEventListener('DOMContentLoaded',()=>{
  // The inventory feeds PROP_LABELS/PROP_CSS, so it loads in every mode.
  state.inventory = loadInventory();
  rebuildPropMaps();
  // Athlete mode takes over the page entirely; skip the instructor boot.
  if (window.__ATHLETE_MODE) return;
  renderPropsGrid();
  // Offer to pick a dropped class back up before anything else steals focus.
  setTimeout(offerSessionResume,350);
});
