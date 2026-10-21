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
  savedWorkouts:   [],
  workoutHistory:  [],
  customExercises: IHStore.getJSON('hiit_custom_v2',       {}),
  customWarmup:    IHStore.getJSON('hiit_custom_warmup',   []),
  customCooldown:  IHStore.getJSON('hiit_custom_cooldown', []),
  inventory: {},
  modal: { category:null, editTarget:null, editIndex:null },
  libraryFilter: 'all', viewMode: 'instructor',
};

// Styles that can be randomly selected (excludes 'random' itself)
const STYLE_KEYS = ['tabata','amrap','emom','circuit','ladder','pyramid','hundred','superset','ygig'];

// ─── SELF-PACED STYLES ────────────────────────────────────────
// Four styles are paced by the athlete, not by the clock. Each runs as a
// single time-capped block covering the whole main workout, and the athlete
// tracks their own reps, rounds or rung on their phone. Giving every set its
// own slot both overran the class and stopped people working at their speed.
const PYRAMID_RUNGS = [5,10,15,20,15,10,5];
const LADDER_RUNGS  = [5,10,15,20];
const rungText = r => r.join(' → ');

// Instructors shape their own climb. Presets cover the common ones; anything
// else can be typed in as "4-8-12-16-12-8-4".
const RUNG_PRESETS = {
  pyramid: [
    { label:'5-10-15-20-15-10-5', rungs:[5,10,15,20,15,10,5] },
    { label:'4-8-12-16-12-8-4',   rungs:[4,8,12,16,12,8,4] },
    { label:'10-20-30-20-10',     rungs:[10,20,30,20,10] },
    { label:'5-10-15-10-5',       rungs:[5,10,15,10,5] },
  ],
  ladder: [
    { label:'5-10-15-20',    rungs:[5,10,15,20] },
    { label:'10-20-30-40',   rungs:[10,20,30,40] },
    { label:'4-8-12-16',     rungs:[4,8,12,16] },
    { label:'20-15-10-5',    rungs:[20,15,10,5] },
  ],
};

// The instructor's edit wins; otherwise the style's default climb is used.
function classRungs(w) {
  w = w || state.workout;
  const cfg = w && SELF_PACED[w.style];
  if (!cfg || !cfg.rungs) return null;
  return (Array.isArray(w.rungs) && w.rungs.length) ? w.rungs : cfg.rungs.slice();
}

function parseRungs(text) {
  return String(text || '').split(/[^0-9]+/).filter(Boolean)
    .map(n => parseInt(n, 10)).filter(n => n > 0 && n <= 200).slice(0, 12);
}

function makeRungEditor(style, rungs) {
  const presets = (RUNG_PRESETS[style] || []).map(p => {
    const active = p.rungs.length === rungs.length && p.rungs.every((n, i) => n === rungs[i]);
    return '<button class="rung-preset'+(active?' active':'')+'" data-onclick="setClassRungs(\''+p.rungs.join('-')+'\')">'+
      p.label+'</button>';
  }).join('');
  const total = rungs.reduce((s, n) => s + n, 0);
  return '<div class="rung-editor">'+
    '<div class="rung-current">Climb: <b>'+rungText(rungs)+'</b>'+
      '<span class="rung-total">'+rungs.length+' rungs · '+total+' reps per exercise</span></div>'+
    '<div class="rung-presets">'+presets+'</div>'+
    '<div class="rung-custom">'+
      '<input type="text" id="rung-input" value="'+rungs.join('-')+'" placeholder="e.g. 4-8-12-16-12-8-4" '+
        'data-onkeydown="if(event.key===\'Enter\')setClassRungs(this.value)">'+
      '<button class="rung-apply" data-onclick="setClassRungs(document.getElementById(\'rung-input\').value)">Apply</button>'+
    '</div></div>';
}

// Short label for a rung style, e.g. "4→16→4" for a pyramid or "10→40" for a ladder.
// Always reflects the instructor's current climb rather than the style default.
function rungRepsLabel(style, w) {
  w = w || (typeof state !== 'undefined' ? state.workout : null) || {};
  const def = SELF_PACED[style] && SELF_PACED[style].rungs;
  const r = (w.style === style && Array.isArray(w.rungs) && w.rungs.length) ? w.rungs : def;
  if (!r || !r.length) return '';
  if (r.length === 1) return String(r[0]);
  const peak = Math.max.apply(null, r), last = r[r.length - 1];
  return (r[0] !== peak && last !== peak)
    ? r[0] + '→' + peak + '→' + last
    : r[0] + '→' + last;
}

function setClassRungs(text) {
  const nums = parseRungs(text);
  if (!nums.length) { showToast('Enter rep counts like 4-8-12-16'); return; }
  state.workout.rungs = nums;
  const label = rungRepsLabel(state.workout.style, state.workout);
  (state.workout.exercises || []).forEach(ex => { ex.reps = label; ex.unit = 'reps'; });
  renderPlanEditor();
  showToast('Climb set to ' + nums.join(' → '));
}

const SELF_PACED = {
  hundred: {
    icon:'💯', ready:'100 REPS CHALLENGE', label:'100 REPS — YOUR OWN PACE',
    note:'Work the ladder in any order', rungs:null,
    reps:(ex,i)=>parseInt(ex.reps,10)||((i+1)*10),
    headline:l=>l.reduce((s,x)=>s+x.reps,0)+' reps across '+l.length+' exercises',
  },
  amrap: {
    icon:'🔄', ready:'AMRAP', label:'AMRAP — AS MANY ROUNDS AS POSSIBLE',
    note:'Repeat the full list — count your rounds', rungs:null,
    headline:l=>l.length+' exercises · as many rounds as you can',
  },
  pyramid: {
    icon:'🔺', ready:'PYRAMID', label:'PYRAMID — CLIMB AT YOUR OWN PACE',
    note:'Every exercise at each rung, up then back down', rungs:PYRAMID_RUNGS,
    headline:(l,r)=>l.length+' exercises · '+r.length+' rungs · '+rungText(r),
  },
  ladder: {
    icon:'📈', ready:'LADDER', label:'LADDER — CLIMB AT YOUR OWN PACE',
    note:'Every exercise at each rung', rungs:LADDER_RUNGS,
    headline:(l,r)=>l.length+' exercises · '+r.length+' rungs · '+rungText(r),
  },
};

const STYLES = {
  tabata:   { name:'Tabata',   icon:'🔥', desc:'Blocks of 8 × 20s max effort / 10s rest. The number of blocks is set by your class length.' },
  amrap:    { name:'AMRAP',    icon:'🔄', desc:'As Many Rounds As Possible within the time cap.' },
  emom:     { name:'EMOM',     icon:'⏱️', desc:'Every Minute On the Minute — one move per minute (40s work / 20s rest), or two moves sharing the minute (20s each with a quick switch).' },
  circuit:  { name:'Circuit',  icon:'⚡', desc:'Timed stations, work then transition, repeated for as many rounds as your class length allows.' },
  ladder:   { name:'Ladder',   icon:'📈', desc:'Rep ladder: 5→10→15→20. Builds muscular endurance.' },
  pyramid:  { name:'Pyramid',  icon:'🔺', desc:'Rep pyramid: 5→10→15→20→15→10→5. Climbs up then back down.' },
  hundred:  { name:'100 Reps', icon:'💯', desc:'Rep ladder across the exercises: 10, 20, 30 … up to 100 reps.' },
  superset: { name:'Superset',  icon:'💥', desc:'Paired exercises back-to-back with minimal rest.' },
  ygig:     { name:'You-Go-I-Go', icon:'🤝', desc:'Partners alternate: one does reps (harder) while the other holds an active rest. Switch when reps are done.' },
  custom:   { name:'Custom',   icon:'🛠️', desc:'You build it. Set your own rounds, work/rest, reps and props per exercise.' },
};

// ─── CUSTOM STYLE ─────────────────────────────────────────────
// Custom classes are instructor-authored: the generator only seeds a starting
// plan, then every timing value is editable. Per-exercise settings live on the
// exercise as cMode/cWork/cRest/cReps; class-wide settings live on w.custom.
const CUSTOM_DEFAULTS = { rounds:3, roundRest:60, work:40, rest:20, mode:'time', pace:'clock' };

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
  // Self-paced: one clock for the whole block, athletes track their own reps.
  if (cfg.pace === 'self') {
    const capSec = selfPacedCapSec(w);
    const rounds = Math.max(1, clampNum(cfg.rounds, 1, 20, 3));
    const ladder = (w.exercises || []).map((ex, i) => ({
      n:i+1, name:ex.name, prop:ex.propLabel || '',
      reps: ex.cMode === 'reps' ? clampNum(ex.cReps, 1, 200, 10) : clampNum(ex.cWork, 5, 600, cfg.work),
      unit: ex.cMode === 'reps' ? 'reps' : 'sec',
    }));
    const headline = ladder.length + ' exercises · ' +
      (rounds > 1 ? rounds + ' rounds at your own pace' : 'work at your own pace');
    out.push({ phase:'get-ready', label:'CUSTOM — YOUR OWN PACE', name:headline, prop:'', duration:5 });
    out.push({ phase:'work', label:'WORK — YOUR OWN PACE', name:headline, prop:'', duration:capSec,
      round:1, totalRounds:1, _exIdx:0, _ladder:ladder, _rungs:null,
      _paceNote: rounds > 1 ? 'Repeat the list ' + rounds + ' times' : 'Work through the list', _pace:'custom' });
    out.push({ phase:'get-ready', label:'🛠️ TIME!', name:headline, prop:'', duration:5 });
    return out;
  }
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
// Custom rounds are the instructor's to set, so they are fitted once (when the
// class is generated, or on "Fit to time") rather than on every edit.
function fitCustomToTime(w) {
  w = w || state.workout; if (!w) return false;
  const cfg = customCfg(w), ex = w.exercises || [];
  if (cfg.pace === 'self' || !ex.length) return false;
  const B = mainBudgetSec(w), rr = clampNum(cfg.roundRest, 0, 600, 60);
  const perEx = ex.reduce((s, e) => s + clampNum(e.cWork, 5, 600, cfg.work) + clampNum(e.cRest, 0, 300, cfg.rest), 0);
  const options = [[null, null, perEx], [40, 20, ex.length * 60], [30, 15, ex.length * 45], [30, 10, ex.length * 40], [20, 10, ex.length * 30]];
  let best = null;
  options.forEach(([W, S, per], oi) => {
    for (let R = 1; R <= 20; R++) {
      const total = R * ((R > 1 ? 5 : 0) + per) + (R - 1) * rr;
      const score = Math.abs(total - B) + oi * 8;
      if (!best || score < best.score) best = { W, S, R, score };
    }
  });
  cfg.rounds = best.R;
  if (best.W != null) {
    cfg.work = best.W; cfg.rest = best.S;
    ex.forEach(e => { e.cWork = best.W; e.cRest = best.S; syncCustomEx(e); });
  }
  return true;
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
      if(propUserCapped(prop))return;                        // the whole class does it at once
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

function cbWork(cb){ return secOf(cb&&cb.work,30); }
function cbRest(cb){ const n=Number(cb&&cb.rest); return isFinite(n)&&n>0?Math.round(n):0; }
function coreBurnerSeconds(w){
  w=w||state.workout;
  const cb=w&&w.coreBurner;
  if(!cb||!cb.exercises||!cb.exercises.length)return 0;
  const rounds=Math.max(1,cb.rounds||1);
  return 5 + rounds*((rounds>1?4:0) + cb.exercises.length*(cbWork(cb)+cbRest(cb)));
}

// ─── CLASS LENGTH ─────────────────────────────────────────────
// The old fixed shapes (8 Tabata rounds per move, 3 circuit rounds, 4 superset
// rounds) ignored the length the instructor picked: a 20 minute Tabata ran 43.
// Every clock style is now sized from the time left once the warm-up,
// cool-down and any core burner are paid for, so the timer lands on the class
// length. The shapes are worked out when the sequence is built, so removing a
// move or adding a finisher re-fits the class automatically.
function secOf(v,fb){ const n=Number(v); return isFinite(n)&&n>0?Math.round(n):fb; }
function targetSec(w){
  w=w||state.workout; if(!w)return 0;
  const d=Number(w.duration);
  if(isFinite(d)&&d>0)return Math.round(d*60);
  return Math.round(((Number(w.mainDur)||30)+(Number(w.warmupDuration)||0)+((w.cooldown||[]).length?5:0))*60);
}
function warmupSeconds(w){ const a=(w&&w.warmup)||[]; return a.length?a.reduce((s,e)=>s+secOf(e.duration,30)+5,0)+3:0; }
function cooldownSeconds(w){ const a=(w&&w.cooldown)||[]; return a.length?a.reduce((s,e)=>s+secOf(e.duration,30)+5,0)+5:0; }
// Seconds the main block should fill (the 5s "MAIN WORKOUT" lead-in excluded).
function mainBudgetSec(w){
  w=w||state.workout; if(!w)return 0;
  return Math.max(120, targetSec(w)-warmupSeconds(w)-cooldownSeconds(w)-coreBurnerSeconds(w)-5);
}
function selfPacedCapSec(w){ return Math.max(300, Math.round(mainBudgetSec(w)/60)*60); }
// Tolerance the plan header and the tests hold a class to.
function timeTolerance(target){ return Math.max(120, Math.round(target*0.1)); }

function tabataPlan(w){
  const n=((w&&w.exercises)||[]).length;
  if(!n)return {blocks:[],rounds:[],blockSec:240,gapSec:10};
  // A block is 8 x 20s on / 10s off with no rest after the 8th effort (230s),
  // and 20s to change over between blocks. Whole blocks come in 4 minute
  // steps, which left a 20 minute class up to 2 minutes off, so the last block
  // may be a shorter 4-7 round finisher to land on the class length.
  const B=mainBudgetSec(w);
  let best=null;
  for(let full=0;full<=40;full++){
    for(const m of [0,4,5,6,7]){
      const count=full+(m?1:0);
      if(!count)continue;
      // every move gets at least one round in its block
      const per=Math.ceil(n/count);
      if(per>8||(m&&per>m))continue;
      const total=full*230+(m?30*m-10:0)+20*(count-1);
      const score=Math.abs(total-B)+(m?5:0);
      if(!best||score<best.score)best={full,m,count,score};
    }
  }
  if(!best){ const f=Math.ceil(n/8); best={full:f,m:0,count:f}; }
  const k=best.count;
  const rounds=[];
  for(let b=0;b<k;b++) rounds.push(b<best.full?8:best.m);
  const blocks=[];
  if(k>=n){ for(let b=0;b<k;b++) blocks.push([b%n]); }
  else for(let b=0;b<k;b++){
    const s=Math.floor(b*n/k), e=Math.floor((b+1)*n/k), g=[];
    for(let i=s;i<e;i++) g.push(i);
    blocks.push(g);
  }
  return {blocks,rounds,blockSec:240,gapSec:10};
}
const CIRCUIT_TIMINGS=[[45,15],[40,20],[30,15],[30,10],[20,10]];
function circuitPlan(w){
  const n=((w&&w.exercises)||[]).length, B=mainBudgetSec(w);
  let best=null;
  CIRCUIT_TIMINGS.forEach(([W,S],oi)=>{
    for(let R=1;R<=12;R++){
      const total=R*(5+n*(W+S))+30*(R-1);
      const score=Math.abs(total-B)+oi*15+(R===1?45:0);
      if(!best||score<best.score) best={work:W,rest:S,rounds:R,total,score};
    }
  });
  return best||{work:45,rest:15,rounds:1,total:0};
}
const SUPERSET_TIMINGS=[[40,20],[30,15],[45,15],[30,10]];
function supersetPlan(w){
  const ex=(w&&w.exercises)||[], B=mainBudgetSec(w);
  const pairs=[];
  for(let i=0;i<ex.length;i+=2) pairs.push(ex.length-i>=2?[i,i+1]:[i]);
  const slots=pairs.reduce((s,p)=>s+p.length,0);
  let best=null;
  SUPERSET_TIMINGS.forEach(([W,S],oi)=>{
    for(let r=1;r<=6;r++) for(let passes=1;passes<=4;passes++){
      const total=passes*r*slots*(W+S)+30*Math.max(0,passes*pairs.length-1)+(passes>1?5*passes:0);
      const score=Math.abs(total-B)+oi*15+Math.abs(r-4)*6+(passes-1)*25;
      if(!best||score<best.score) best={work:W,rest:S,rounds:r,passes,total,score};
    }
  });
  return Object.assign({pairs},best||{work:40,rest:20,rounds:4,passes:1,total:0});
}
// A real minute: the clock turns over every 60s on the dot. One move gets
// 40s on / 20s off; two moves share the minute 20s each with a 5s change-over.
function emomPlan(w){
  const ex=(w&&w.exercises)||[];
  const exPerMin=ex.length>=6?2:1;
  const groups=[];
  for(let i=0;i<ex.length;i+=exPerMin) groups.push({start:i,items:ex.slice(i,i+exPerMin)});
  const workPerEx=exPerMin===2?20:40;
  const totalMins=groups.length?Math.max(groups.length,Math.round(mainBudgetSec(w)/60)):0;
  return {exPerMin,workPerEx,groups,minuteSec:60,totalMins};
}
// An odd move out has to partner with something; it is never paired with itself.
const YGIG_ACTIVE_REST={name:'Plank or Wall-Sit Hold',propLabel:'Bodyweight',reps:'hold',prop:'bodyweight',_fallback:true};
function ygigPlan(w){
  const ex=(w&&w.exercises)||[];
  const workSec=Math.min(180,secOf(w&&w.ygigWorkSec,45));
  const pairs=[];
  for(let i=0;i<ex.length;i+=2) pairs.push({idx:i,primary:ex[i],active:ex[i+1]||YGIG_ACTIVE_REST});
  const pairSec=5+workSec*2+8+10;
  const B=mainBudgetSec(w);
  // Whole rounds of every pair come in big steps (4 pairs at 45s is ~8 min),
  // so the final round may run only the first few pairs to land on time.
  let rounds=0, lastPairs=0;
  if(pairs.length){
    const P=pairs.length;
    let bestErr=Infinity;
    for(let R=1;R<=12;R++) for(let j=0;j<P;j++){
      const count=R+(j?1:0);
      const total=5+(R*P+j)*pairSec+(count>1?5*count:0);
      const err=Math.abs(total-B)+(j?10:0);
      if(err<bestErr){bestErr=err;rounds=count;lastPairs=j;}
    }
  }
  return {workSec,pairs,pairSec,rounds,lastPairs};
}
// Rough ceiling on how many moves fit the block, so a 20 minute class is not
// handed 14 exercises it can never get through.
function maxExercisesForTime(style,B,ygigSec){
  switch(style){
    case 'tabata':   return 4*Math.max(1,Math.round((B+20)/250));
    case 'circuit':  return Math.max(2,Math.floor((B-5)/30));
    case 'superset': return 2*Math.max(1,Math.floor((B+30)/120));
    case 'emom':     return 2*Math.max(1,Math.round(B/60));
    case 'ygig':     return 2*Math.max(1,Math.round((B-5)/(5+2*secOf(ygigSec,45)+18)));
    default:         return Infinity;
  }
}
// Fills a warm-up or cool-down to a time target from a shuffled pool.
function pickTimedMoves(pool,target){
  const out=[]; let t=0;
  for(const ex of shuffle(pool)){
    const d=secOf(ex.duration,30)+5;
    if(t+d>target+15)continue;
    out.push(ex); t+=d;
    if(t>=target-15)break;
  }
  return out;
}
// Labels that depend on the fitted shape, kept in step with the timer.
function syncPlanTiming(w){
  w=w||state.workout; if(!w)return;
  w.mainDur=Math.max(2,Math.round(mainBudgetSec(w)/60));
  if(w.style==='circuit'){
    const p=circuitPlan(w);
    (w.exercises||[]).forEach(ex=>{ ex.reps=p.work+'s'; ex.unit='work'; ex.seconds=p.work; });
  }
}
function classSeconds(w){
  w=w||state.workout;
  if(!w)return 0;
  return buildSequenceFor(w).reduce((s,x)=>s+(x.duration||0),0);
}
function mainBlockSeconds(w){
  w=w||state.workout;
  if(!w)return 0;
  return buildMainSeq(w).reduce((s,x)=>s+(x.duration||0),0);
}
// The 100s ladder follows the list order, so it is renumbered after any edit.
function renumberHundred(w){
  w=w||state.workout;
  if(!w||w.style!=='hundred')return;
  (w.exercises||[]).forEach((ex,i)=>{ ex.reps=((i+1)*10)+''; ex.unit='reps'; ex.seconds=Math.max(30,(i+1)*8); });
}
function planTimeSummary(w){
  w=w||state.workout;
  const planned=classSeconds(w), target=targetSec(w), tol=timeTolerance(target);
  const diff=planned-target;
  return {planned,target,diff,tol,ok:Math.abs(diff)<=tol};
}
function updatePlanTimeBadge(){
  const badge=document.getElementById('plan-time-badge');
  const btn=document.getElementById('plan-fit-btn');
  const w=state.workout;
  if(!badge||!w)return;
  const s=planTimeSummary(w);
  badge.textContent='⏱ '+fmtMinSec(s.planned)+' of '+Math.round(s.target/60)+' min';
  badge.classList.toggle('time-off',!s.ok);
  badge.title=s.ok?'Planned class time is on target':
    'Planned class runs '+fmtMinSec(Math.abs(s.diff))+(s.diff>0?' over':' under')+' the '+Math.round(s.target/60)+' minutes you chose';
  if(btn)btn.style.display=s.ok?'none':'';
}
// Re-fits the bits the instructor owns (custom rounds, YGIG turn length).
// Clock styles already fit themselves; if they still miss, the gap comes from
// the warm-up, cool-down or finisher and the toast says which.
function fitPlanToTime(){
  const w=state.workout; if(!w)return;
  const before=planTimeSummary(w);
  if(before.ok){ showToast('Already on time: '+fmtMinSec(before.planned)); updatePlanTimeBadge(); return; }
  const snap=cloneWorkout(w);
  if(w.style==='custom') fitCustomToTime(w);
  else if(w.style==='ygig'){
    let best=null;
    [20,30,45,60,90].forEach(sec=>{
      w.ygigWorkSec=sec;
      const err=Math.abs(classSeconds(w)-before.target);
      if(!best||err<best.err)best={sec,err};
    });
    w.ygigWorkSec=best.sec; state.ygigWorkSec=best.sec;
  }
  syncPlanTiming(w);
  const after=planTimeSummary(w);
  if(!after.ok){
    const tips=[];
    if(after.diff>0){
      if(w.coreBurner)tips.push('remove the core burner');
      if(warmupSeconds(w)>after.target*0.3)tips.push('trim the warm-up');
      tips.push('remove a move');
    } else tips.push('add a move or a core burner');
    showToast('Still '+fmtMinSec(Math.abs(after.diff))+(after.diff>0?' over':' under')+' — try: '+tips.join(', '),'warning');
  } else if(after.planned!==before.planned){
    w._edited=true;
    renderPlanEditor();
    showUndoToast('Fitted to '+fmtMinSec(after.planned),snap);
    return;
  }
  renderPlanEditor();
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
  // A finisher is carved out of the main block, so a short class keeps its time.
  if(mainBudgetSec(state.workout)<600)return false;
  addCoreBurner({auto:true,reason:advice.reason,silent:true});
  if(state.workout.coreBurner && !(opts&&opts.silent))
    showToast('🎯 Core Burner added automatically — '+advice.reason+'.');
  return !!(state.workout&&state.workout.coreBurner);
}

// Two-step picker: pick a region, then (optionally) an emphasis inside it.
// The 8 original keys are kept so classes saved before the picker still load.
// Narrow emphasis themes have empty `keys` on purpose — the coarse focus tags
// would let the whole region in, so only the muscle signature admits exercises.
const MUSCLE_FOCUS = {
  full:   { label:'Full Body',  keys:['full','upper','lower','core','glutes','cardio'] },
  upper:  { label:'Upper Body', keys:['upper','push','pull'] },
  lower:  { label:'Lower Body', keys:['lower','glutes'] },
  core:   { label:'Core',       keys:['core'] },
  cardio: { label:'Cardio',     keys:['cardio','full'] },
  push:   { label:'Push',       keys:['push','upper'] },
  pull:   { label:'Pull',       keys:['pull','upper'] },
  glutes: { label:'Glutes + Hamstrings', keys:['glutes','lower'] },
  chestback:     { label:'Chest + Back',      keys:[] },
  shouldersarms: { label:'Shoulders + Arms',  keys:[] },
  quads:         { label:'Quads + Calves',    keys:[] },
  hips:          { label:'Glutes + Hips',     keys:[] },
};
const MUSCLE_REGIONS = {
  full:   { label:'Full Body', icon:'🏋️', emphasis:[] },
  upper:  { label:'Upper',     icon:'💪', emphasis:['push','pull','chestback','shouldersarms'] },
  lower:  { label:'Lower',     icon:'🦵', emphasis:['quads','glutes','hips'] },
  core:   { label:'Core',      icon:'🎯', emphasis:[] },
  cardio: { label:'Cardio',    icon:'❤️', emphasis:[] },
  custom: { label:'Custom',    icon:'🧩', emphasis:[] },
};
const MUSCLE_REGION_OF = {
  push:'upper', pull:'upper', chestback:'upper', shouldersarms:'upper',
  quads:'lower', glutes:'lower', hips:'lower',
};
function muscleRegion(key) {
  if (key === 'custom' || customFocusIds(key)) return 'custom';
  if (MUSCLE_REGIONS[key]) return key;
  return MUSCLE_REGION_OF[key] || 'full';
}
// Label + focus tags for any muscle key, including 'custom:chest,glutes'.
function muscleFocus(key) {
  const ids = customFocusIds(key);
  if (ids) return { label: customFocusLabel(ids), keys: [] };
  return MUSCLE_FOCUS[key] || MUSCLE_FOCUS.full;
}

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

   maxUsers (optional, any share mode):
     A class-wide cap on how many people may be on this prop at the same
     time (cable bands hang off a door anchor, sliders need floor space).
     Above the cap the prop becomes a rotating station — it is never put to
     the whole class, it is limited to a couple of plan slots, and it is
     skipped in all-at-once formats (You-Go-I-Go, Core Burner).
     0 / blank = no cap.
   ──────────────────────────────────────────────────────────────────── */
const PROP_DEFAULTS = {
  dumbbells:       { label:'Dumbbells',           icon:'🏋️', css:'yellow', qty:30, share:'each'      },
  resistanceBands: { label:'Cable Bands',         icon:'🔴',  css:'red',    qty:4,  share:'station',  maxUsers:3 },
  bands:           { label:'Mini Bands',          icon:'🔗',  css:'blue',   qty:16, share:'each'      },
  bench:           { label:'Bench',               icon:'🪑',  css:'purple', qty:4,  share:'station'   },
  yogaBall:        { label:'Stability Ball',      icon:'🔵',  css:'green',  qty:1,  share:'station'   },
  elevationBlocks: { label:'Elevation Blocks',    icon:'📦',  css:'orange', qty:8,  share:'station'   },
  balls:           { label:'Med Ball',            icon:'⚽',  css:'pink',   qty:0,  share:'station'   },
  slamBalls:       { label:'Slam Ball',           icon:'💣',  css:'red2',   qty:2,  share:'station'   },
  ankleWeights:    { label:'Ankle Weights',       icon:'🦶',  css:'teal',   qty:8,  share:'each'      },
  sliders:         { label:'Sliders',             icon:'🛷',  css:'slate',  qty:8,  share:'each',     maxUsers:3 },
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
  const mu = parseInt(p.maxUsers, 10);
  return {
    label: String(p.label != null ? p.label : (base.label || id)).slice(0, 40).trim() || id,
    icon:  String(p.icon  != null ? p.icon  : (base.icon  || '🏋️')).slice(0, 4) || '🏋️',
    css:   PROP_CSS_CHOICES.includes(p.css) ? p.css : (base.css || 'slate'),
    share: SHARE_MODES[p.share] ? p.share : (base.share || 'station'),
    qty:   isNaN(qty) ? (base.qty == null ? 1 : base.qty) : Math.min(999, Math.max(0, qty)),
    // 0 means "no cap", so a saved 0 must survive and not fall back to the default.
    maxUsers: isNaN(mu) ? (base.maxUsers || 0) : Math.min(99, Math.max(0, mu)),
    builtin: !!PROP_DEFAULTS[id],
  };
}

function loadInventory() {
  let saved = {};
  saved = IHStore.getJSON(INVENTORY_KEY, {}) || {};
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
    out[id] = { label:p.label, icon:p.icon, css:p.css, share:p.share, qty:p.qty, maxUsers:p.maxUsers || 0 };
  });
  // Remember which built-ins were deleted, or they would come straight back.
  PROP_ORDER.forEach(id => { if (!state.inventory[id]) out[id] = { _removed:true }; });
  return IHStore.setJSON(INVENTORY_KEY, out);
}

const propMeta  = id => (state.inventory && state.inventory[id]) || PROP_DEFAULTS[id] ||
                        { label:id, icon:'🏋️', css:'slate', qty:1, share:'station', builtin:false };
const propQty   = id => propMeta(id).qty;
const propShare = id => propMeta(id).share;
const propIsUnlimited = id => propShare(id) === 'unlimited';
const propExists = id => !!(state.inventory && state.inventory[id]);
const propMaxUsers = id => propIsUnlimited(id) ? 0 : (propMeta(id).maxUsers || 0);

// Plan slots a user-capped prop may fill (a couple of stations, never the whole class).
const USER_CAP_SLOTS = 2;

// True when the class is bigger than the prop's "max people at once" cap.
function propUserCapped(id, people) {
  const n = people == null ? state.participants : people;
  const mu = propMaxUsers(id);
  return mu > 0 && n > mu;
}
// "max 3 at once" when the cap applies to this class, otherwise ''.
function propUserCapNote(id, people) {
  return propUserCapped(id, people) ? 'max ' + propMaxUsers(id) + ' at once' : '';
}

// How many people can use this prop at the same time.
function propCapacity(id, people) {
  if (propIsUnlimited(id)) return Infinity;
  const n = people == null ? state.participants : people;
  const qty = propQty(id);
  if (qty <= 0) return 0;
  let cap = qty >= n ? Infinity : qty;
  if (propUserCapped(id, n)) cap = Math.min(cap, propMaxUsers(id));
  return cap;
}

// 'ok' — everyone can use it · 'limited' — rotate through it ·
// 'short' — not enough to go round, so the move is dropped · 'none' — not owned.
function propStatus(id, people) {
  const n = people == null ? state.participants : people;
  if (propIsUnlimited(id)) return 'ok';
  const qty = propQty(id);
  if (qty <= 0) return 'none';
  // With a max-at-once cap, only that many people ever need the gear.
  const need = propUserCapped(id, n) ? propMaxUsers(id) : n;
  if (qty >= need) return need < n ? 'limited' : 'ok';
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
// ─── PER-INSTRUCTOR STORAGE ───────────────────────────────────
// The studio laptop is shared. Kat builds her classes at home, then teaches
// from the same machine Carson taught on an hour earlier. Saved classes and
// history used to sit in one global key, so whoever saved last silently
// wiped the other's work, and everyone saw everyone else's list.
//
// Anything personal is now filed under the instructor who signed in for
// this sitting. Equipment and the custom exercise library stay shared on
// purpose — they describe the studio, not the person.
const INSTRUCTOR_SESSION_KEY = 'hiit_session_instructor';
const PERSONAL_SAVED   = 'hiit_saved';
const PERSONAL_HISTORY = 'hiit_history';
// Classes actually taught are a studio record, not a personal one. Whoever is
// on the floor next needs to know the room already did heavy glutes on
// Monday, so this one key is deliberately shared by all three instructors and
// every entry carries the name of whoever ran it.
const STUDIO_HISTORY = 'hiit_history_studio';

// sessionStorage, not localStorage: it survives a refresh mid-class but dies
// with the tab, so the next person to open the app is always asked who they
// are instead of inheriting whoever taught last.
//
// Safari blocks sessionStorage too on a file:// page. Without the memory
// fallback below, currentInstructorId() would return '' on every call and
// all three instructors would quietly share one shelf again — the exact
// bug the per-instructor keys were added to fix.
let instructorIdMemo = '';
function currentInstructorId() {
  try {
    const v = IHStore.getSession(INSTRUCTOR_SESSION_KEY);
    if (v) return v;
  } catch (e) {}
  return instructorIdMemo;
}
function setCurrentInstructorId(id) {
  instructorIdMemo = id || '';
  IHStore.setSession(INSTRUCTOR_SESSION_KEY, id);
}
function personalKey(base, id) {
  const who = id || currentInstructorId();
  return who ? base + '__' + who : base;
}

// The old shared lists belong to whoever was last active, so hand them over
// once rather than letting three people open the new build to empty shelves.
const PERSONAL_SPLIT_FLAG = 'hiit_personal_split_done';
function migrateLegacyPersonalData() {
  if (IHStore.get(PERSONAL_SPLIT_FLAG)) return;
  const owner = IHStore.get('hiit_active_profile') || 'kat';
  [PERSONAL_SAVED, PERSONAL_HISTORY].forEach(base => {
    const legacy = IHStore.get(base);
    const target = base + '__' + owner;
    if (legacy && !IHStore.get(target)) IHStore.set(target, legacy);
  });
  IHStore.set(PERSONAL_SPLIT_FLAG, '1');
}

// Histories that were filed per-instructor get poured into the one studio log
// and stamped with whoever owned that shelf, so nobody loses classes they
// already taught when this build lands.
const STUDIO_MERGE_FLAG = 'hiit_history_studio_done';
function migrateHistoryToStudio() {
  if (IHStore.get(STUDIO_MERGE_FLAG)) return;
  const ids = (typeof PROFILES !== 'undefined') ? Object.keys(PROFILES) : ['kat', 'carson', 'melissa'];
  // A pre-profiles history has no owner recorded. It belongs to whoever was
  // last active — the same assumption migrateLegacyPersonalData already
  // makes — and must NOT be pinned on whoever happens to open this build
  // first, which would credit their classes to a stranger.
  const legacyOwner = IHStore.get('hiit_active_profile') || 'kat';
  const lists = [readJSON(STUDIO_HISTORY, [])];
  ids.forEach(id => {
    lists.push(readJSON(PERSONAL_HISTORY + '__' + id, [])
      .map(h => stampInstructor(h, h.instructorId || h.profileId || id)));
  });
  lists.push(readJSON(PERSONAL_HISTORY, [])
    .map(h => stampInstructor(h, h.instructorId || h.profileId || legacyOwner)));
  IHStore.setJSON(STUDIO_HISTORY, mergeById.apply(null, lists).slice(0, HISTORY_CAP));
  IHStore.set(STUDIO_MERGE_FLAG, '1');
}

// Three people now share one shelf, so a 50-class cap would quietly evict a
// third of everyone's record.
const HISTORY_CAP = 150;

/** Attaches who taught it. Name is copied, not looked up later, so the log
 *  still reads correctly if a profile is ever renamed or removed. */
function stampInstructor(entry, id) {
  const who = id || currentInstructorId() ||
    ((typeof profileState !== 'undefined') ? profileState.activeProfile : null);
  const p = (typeof PROFILES !== 'undefined' && who) ? PROFILES[who] : null;
  entry.instructorId   = who || null;
  entry.instructorName = entry.instructorName || (p ? p.name : (who || 'Unknown'));
  entry.instructorIcon = entry.instructorIcon || (p ? p.icon : '🏋️');
  return entry;
}

function readJSON(key, fallback) {
  return IHStore.getJSON(key, fallback);
}
/** Pulls the signed-in instructor's own classes, plus the shared studio log. */
function loadPersonalData() {
  state.savedWorkouts  = readJSON(personalKey(PERSONAL_SAVED), []);
  state.workoutHistory = readJSON(STUDIO_HISTORY, []);
}

// Two tabs on one laptop each hold their own copy of these lists, so writing
// one back wholesale drops whatever the other tab added. Merging on the way
// out costs nothing and makes a lost save impossible.
function mergeById(...lists) {
  const seen = new Set(); const out = [];
  lists.forEach(list => (list || []).forEach(item => {
    if (item && item.id != null && !seen.has(item.id)) { seen.add(item.id); out.push(item); }
  }));
  return out.sort((a, b) => (b.id || 0) - (a.id || 0));
}
function syncSavedWorkouts() {
  state.savedWorkouts = mergeById(state.savedWorkouts, readJSON(personalKey(PERSONAL_SAVED), []));
  return state.savedWorkouts;
}
/** Same protection for the studio log — two instructors teaching back-to-back
 *  on one laptop must not overwrite each other's classes. */
function syncHistory() {
  state.workoutHistory = mergeById(state.workoutHistory, readJSON(STUDIO_HISTORY, [])).slice(0, HISTORY_CAP);
  return state.workoutHistory;
}

/** Writes everything personal back. Returns false if any part of it failed
 *  to reach disk, so callers can tell the instructor the truth rather than
 *  showing a tick over a class that was never stored. */
function saveToStorage() {
  let ok = true;
  ok = IHStore.setJSON(personalKey(PERSONAL_SAVED), state.savedWorkouts) && ok;
  ok = IHStore.setJSON(STUDIO_HISTORY, syncHistory()) && ok;
  ok = IHStore.setJSON('hiit_custom_v2',       state.customExercises) && ok;
  ok = IHStore.setJSON('hiit_custom_warmup',   state.customWarmup) && ok;
  ok = IHStore.setJSON('hiit_custom_cooldown', state.customCooldown) && ok;
  return ok;
}
function showToast(msg, type='') {
  let t = document.getElementById('toast');
  if (!t) { t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast show${type?' toast-'+type:''}`;
  // A second toast must not be hidden early by the first one's timer.
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2800);
}
function askConfirm(msg) {
  try { return typeof confirm === 'function' ? confirm(msg) : true; } catch (e) { return true; }
}
// Toast with an Undo button for plan edits. Only the latest edit is undoable;
// the snapshot is the whole workout, so undo restores swaps, removals and
// renumbered reps in one step.
function showUndoToast(msg, snapshot) {
  let bar = document.getElementById('undo-toast');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'undo-toast'; bar.className = 'undo-toast';
    bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  bar.innerHTML = '<span class="undo-msg"></span><button type="button" class="undo-btn">↶ Undo</button>';
  bar.querySelector('.undo-msg').textContent = msg;
  showUndoToast._snap = snapshot;
  bar.querySelector('.undo-btn').onclick = undoPlanEdit;
  bar.classList.add('show');
  clearTimeout(showUndoToast._timer);
  showUndoToast._timer = setTimeout(() => { bar.classList.remove('show'); showUndoToast._snap = null; }, 10000);
}
function undoPlanEdit() {
  const snap = showUndoToast._snap; if (!snap) return;
  showUndoToast._snap = null;
  state.workout = snap;
  const bar = document.getElementById('undo-toast'); if (bar) bar.classList.remove('show');
  renderPlanEditor();
  showToast('↶ Undone');
}
function cloneWorkout(w) {
  if (!w) return w;
  try { return typeof structuredClone === 'function' ? structuredClone(w) : JSON.parse(JSON.stringify(w)); }
  catch (e) { return JSON.parse(JSON.stringify(w)); }
}
// Everything the running class keeps on state.timer. Cleared whenever the
// class ends or a different plan takes over, so nothing (the phone link's
// class clock included) mistakes an old sequence for the current class.
function resetTimerState() {
  const t = state.timer;
  clearInterval(t.interval);
  t.interval = null; t.isRunning = false;
  t.sequence = []; t.current = 0; t.seconds = 0; t.totalSteps = 0;
  t._started = false; t._finished = false; t._logged = false;
  t.deadline = 0; t.lastWhole = 0; t.remainingMs = 0; t._pausedAt = null; t.workoutRef = null;
  t._lastPersist = 0;
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
  const cap = propUserCapNote(ex.prop);
  if (cap) label += ' (' + cap + ')';
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
  const slider = document.getElementById('participant-slider');
  if (slider && String(slider.value) !== String(state.participants)) slider.value = state.participants;
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
  limited.forEach(id => parts.push(propMeta(id).label + ' ×' + propQty(id) +
    (propUserCapped(id) ? ' (max ' + propMaxUsers(id) + ' people at once — rotate)' : ' (rotate as station)')));
  short.forEach(id => parts.push(propMeta(id).label + ' ×' + propQty(id) +
    ' (not enough for ' + n + ' — will be skipped)'));

  if (!parts.length) { note.style.display = 'none'; return; }
  if (n < 8) parts.unshift('ℹ️ Equipment limits for ' + n + ' people');
  note.textContent = parts.join(' · ');
  note.style.display = 'block';
}
// Region buttons + emphasis chips + custom picker, all drawn from state.muscle.
function renderMuscleFocus() {
  const region = muscleRegion(state.muscle);
  document.querySelectorAll('.muscle-btn').forEach(b => b.classList.toggle('active', b.dataset.muscle === region));

  const emph = document.getElementById('muscle-emphasis');
  if (emph) {
    const opts = MUSCLE_REGIONS[region].emphasis;
    emph.style.display = opts.length ? 'flex' : 'none';
    emph.innerHTML = !opts.length ? '' :
      '<span class="emph-label">Emphasis</span>' +
      [region].concat(opts).map(k => {
        const label = k === region ? 'All ' + MUSCLE_REGIONS[region].label.toLowerCase() : MUSCLE_FOCUS[k].label;
        return '<button type="button" class="emph-chip' + (state.muscle === k ? ' active' : '') +
          '" data-onclick="selectEmphasis(\'' + k + '\')">' + label + '</button>';
      }).join('');
  }

  const cust = document.getElementById('muscle-custom');
  if (cust) {
    cust.style.display = region === 'custom' ? 'block' : 'none';
    if (region === 'custom') {
      const picked = new Set(customFocusIds(state.muscle) || []);
      const chips = tier => Object.values(MUSCLE_GROUPS).filter(m => m.tier === tier).map(m =>
        '<button type="button" class="emph-chip cust-chip' + (picked.has(m.id) ? ' active' : '') +
        '" aria-pressed="' + picked.has(m.id) + '" data-onclick="toggleCustomMuscle(\'' + m.id + '\')">' +
        m.icon + ' ' + m.short + '</button>').join('');
      cust.innerHTML =
        '<div class="cust-group"><span class="emph-label">Main muscles</span>' + chips('major') + '</div>' +
        '<div class="cust-group"><span class="emph-label">Smaller muscles</span>' + chips('minor') + '</div>' +
        '<div class="cust-hint">' + (picked.size
          ? picked.size + ' selected — main muscles are guaranteed in the plan, smaller ones are worked in as accessories.'
          : 'Pick at least one muscle group.') + '</div>';
    }
  }
}
function selectMuscle(btn) {
  const region = btn.dataset.muscle;
  state.muscle = region === 'custom' ? (customFocusIds(state.muscle) ? state.muscle : 'custom') : region;
  renderMuscleFocus();
}
function selectEmphasis(key) {
  if (!MUSCLE_FOCUS[key]) return;
  state.muscle = key;
  renderMuscleFocus();
}
function toggleCustomMuscle(id) {
  if (!MUSCLE_GROUPS[id]) return;
  const picked = new Set(customFocusIds(state.muscle) || []);
  picked.has(id) ? picked.delete(id) : picked.add(id);
  state.muscle = makeCustomFocusKey([...picked]) || 'custom';
  renderMuscleFocus();
}
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
      : status === 'limited' ? '<span class="prop-count-note">×' + p.qty + ' · ' +
          (propUserCapped(id) ? 'max ' + propMaxUsers(id) + ' at once' : 'shared') + '</span>'
      : '<span class="prop-count-note ok">×' + p.qty + '</span>';
    return '<label class="prop-toggle">' +
      '<input type="checkbox" value="' + escapeHtml(id) + '"' + (on ? ' checked' : '') +
        ' data-onchange="updateProps()">' +
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
    const mu = unlimited ? 0 : (p.maxUsers || 0);
    const capped = mu > 0 && n > mu;
    const need = capped ? mu : n;
    const enough = unlimited || p.qty >= need;
    const statusTxt = unlimited ? 'Unlimited'
      : p.qty <= 0 ? 'Not owned'
      : enough && capped ? 'Max ' + mu + ' at once · rotate through it'
      : enough ? 'Enough for ' + n
      : p.share === 'each' ? 'Too few for ' + need + ' — will be skipped'
      : 'Shared station · ' + p.qty + ' at a time';
    const statusCls = unlimited ? 'ok'
      : enough ? (capped ? 'limited' : 'ok')
      : (p.share === 'each' ? 'short' : 'limited');
    const eid = escapeHtml(id);

    return '<div class="inv-row" data-id="' + eid + '">' +
      '<input class="inv-icon" value="' + escapeHtml(p.icon) + '" maxlength="4" ' +
        'data-onchange="setInvField(\'' + eid + '\',\'icon\',this.value)" aria-label="Icon">' +
      '<div class="inv-main">' +
        '<input class="inv-name" value="' + escapeHtml(p.label) + '" maxlength="40" ' +
          'data-onchange="setInvField(\'' + eid + '\',\'label\',this.value)" aria-label="Name">' +
        '<div class="inv-status ' + statusCls + '">' + statusTxt +
          (p.builtin ? '' : ' · custom') + '</div>' +
      '</div>' +
      '<div class="inv-qty">' +
        (unlimited
          ? '<span class="inv-qty-na">—</span>'
          : '<button class="inv-step" data-onclick="stepInv(\'' + eid + '\',-1)">−</button>' +
            '<input class="inv-num" type="number" min="0" max="999" value="' + p.qty + '" ' +
              'data-onchange="setInvField(\'' + eid + '\',\'qty\',this.value)" aria-label="How many">' +
            '<button class="inv-step" data-onclick="stepInv(\'' + eid + '\',1)">+</button>') +
      '</div>' +
      '<div class="inv-max">' +
        (unlimited
          ? '<span class="inv-qty-na">—</span>'
          : '<input class="inv-num" type="number" min="0" max="99" value="' + (mu || '') + '" placeholder="∞" ' +
              'data-onchange="setInvField(\'' + eid + '\',\'maxUsers\',this.value)" aria-label="Max people at once">') +
      '</div>' +
      '<select class="inv-share" data-onchange="setInvField(\'' + eid + '\',\'share\',this.value)" aria-label="Sharing">' +
        Object.entries(SHARE_MODES).map(([k, m]) =>
          '<option value="' + k + '"' + (p.share === k ? ' selected' : '') + '>' + m.label + '</option>').join('') +
      '</select>' +
      '<button class="inv-del" data-onclick="removeInvProp(\'' + eid + '\')" title="Remove">✕</button>' +
    '</div>';
  }).join('');

  body.innerHTML =
    '<div class="inv-intro">Set what your studio owns. Quantities decide which exercises can be ' +
      'programmed for a class of <b>' + n + '</b>. Set a quantity to <b>0</b> to hide equipment ' +
      'from class setup without losing its exercises — put a number back to bring it in again. ' +
      '<b>Max at once</b> caps how many people in the whole class can be on that equipment at the ' +
      'same time (cable bands and sliders default to 3); leave it blank for no cap.</div>' +
    '<div class="inv-head"><span>Equipment</span><span>How many</span><span>Max at once</span><span>Sharing</span><span></span></div>' +
    rows +
    '<div class="inv-add">' +
      '<input id="inv-new-icon" class="inv-icon" value="🏋️" maxlength="4" aria-label="New icon">' +
      '<input id="inv-new-name" class="inv-name" placeholder="Add equipment…" maxlength="40" ' +
        'data-onkeydown="if(event.key===\'Enter\')addInvProp()">' +
      '<input id="inv-new-qty" class="inv-num" type="number" min="0" max="999" value="4" aria-label="How many">' +
      '<button class="inv-add-btn" data-onclick="addInvProp()">+ Add</button>' +
    '</div>' +
    '<div class="inv-note">Custom equipment has no exercises of its own yet — add your own moves ' +
      'to it from the exercise library.</div>';
}

function setInvField(id, field, val) {
  if (!_invDraft || !_invDraft[id]) return;
  const before = _invDraft[id];
  // A blank "max at once" box means no cap, not "keep the old number".
  if (field === 'maxUsers' && String(val).trim() === '') val = 0;
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
  // Regenerating throws away swaps, removals and edits the instructor made.
  if (!opts.force && !opts.silent && state.workout && state.workout._edited &&
      !askConfirm('Regenerate this class? Your manual edits to the plan will be lost.')) return;
  // Resolve random style
  let resolvedStyle = opts.forceStyle || state.style;
  if (resolvedStyle === 'random') {
    // You-Go-I-Go needs a partner, so a solo class never draws it.
    const keys = STYLE_KEYS.filter(k => k !== 'ygig' || (state.participants || 0) >= 2);
    resolvedStyle = keys[Math.floor(Math.random() * keys.length)];
    // Show which style was picked
    const styleNames = {tabata:'🔥 Tabata',circuit:'⚡ Circuit',amrap:'🔄 AMRAP',emom:'⏱️ EMOM',ladder:'📈 Ladder',pyramid:'🔺 Pyramid',hundred:'💯 100 Reps',superset:'💥 Superset',ygig:'🤝 You-Go-I-Go'};
    if (!opts.silent) showToast('🎲 Randomly picked: '+styleNames[resolvedStyle]);
  }
  const styleCfg = STYLES[resolvedStyle];
  if (!styleCfg) { showToast('Unknown style: '+resolvedStyle); return; }
  if (resolvedStyle === 'ygig' && (state.participants || 0) < 2) {
    showToast('You-Go-I-Go needs at least 2 people working in pairs — pick another style.', 'error');
    return;
  }
  const diff = (state.difficulty||'i')[0];
  const focusKeys = muscleFocus(state.muscle).keys;
  if (state.muscle === 'custom') { showToast('Pick at least one muscle group for your custom class.','error'); return; }
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
      // In YGIG both partners work at once, so a rotating station will not do.
      if (resolvedStyle === 'ygig' && propCapacity(prop) !== Infinity) return;
      seen.add(ex.name);
      candidates.push({...ex,prop});
    });
  });

  // A YGIG class with only capped props selected still needs partner moves:
  // top up with bodyweight work rather than queueing pairs for a prop.
  let ygigTopUp = false;
  if (resolvedStyle === 'ygig' && candidates.length < 4) {
    (DB.bodyweight || []).forEach(ex => {
      if (seen.has(ex.name)) return;
      if (!ex.difficulty || !ex.difficulty.includes(diff)) return;
      if (ex.partner && !allowPartner) return;
      seen.add(ex.name); ygigTopUp = true;
      candidates.push({...ex, prop:'bodyweight'});
    });
  }

  if (candidates.length===0) {
    showToast('No exercises match those props + focus. Try adding props or a different focus.','error');
    return;
  }

  const warmupDur = state.includeWarmup?(state.warmupDuration||7):0;
  const cooldownDur = state.includeCooldown?5:0;
  const classLen = state.duration||45;
  // Warm-up and cool-down are filled to time, not to a count. A very short
  // class keeps them in proportion so there is still a main block.
  const allWarmup=[...WARMUP_POOL,...(state.customWarmup||[])];
  const allCooldown=[...COOLDOWN_POOL,...(state.customCooldown||[])];
  const warmupExs = state.includeWarmup
    ? pickTimedMoves(allWarmup, Math.min(warmupDur*60, Math.round(classLen*60*0.3)) - 3) : [];
  const cooldownExs = state.includeCooldown
    ? pickTimedMoves(allCooldown, Math.min(cooldownDur*60, Math.round(classLen*60*0.2)) - 5) : [];
  const estBudget = Math.max(120, classLen*60 - warmupSeconds({warmup:warmupExs}) - cooldownSeconds({cooldown:cooldownExs}) - 5);
  const mainDur = Math.max(2, Math.round(estBudget/60));

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
  // ...but never more moves than the block has time to run.
  const maxByTime = maxExercisesForTime(resolvedStyle, estBudget, state.ygigWorkSec);
  const timeCapped = exCount > maxByTime;
  exCount = Math.max(2, Math.min(exCount, maxByTime));
  // A short YGIG class runs one pass of its pairs, so the pair count itself
  // has to fill the block; longer classes repeat the pairs in rounds.
  if (resolvedStyle === 'ygig') {
    const pairSec = 5 + 2*secOf(state.ygigWorkSec,45) + 18;
    const fitPairs = Math.round((estBudget - 5) / pairSec);
    if (fitPairs <= 7) exCount = 2 * Math.max(1, fitPairs);
    else {
      let best = null;
      for (let P = 4; P <= 7; P++) for (let R = 2; R <= 12; R++) {
        const err = Math.abs(5 + R*P*pairSec + 5*R - estBudget);
        if (!best || err < best.err) best = { P, err };
      }
      exCount = 2 * best.P;
    }
  }
  // Themed focuses (e.g. shoulders & arms) put primary-muscle moves first.
  if (typeof rankFocusCandidates==='function') {
    const ranked = rankFocusCandidates(candidates, state.muscle, exCount);
    if (Array.isArray(ranked) && ranked !== candidates && ranked.length) { candidates.length = 0; candidates.push(...ranked); }
  }

  const stationCount = state.participants>=8?Math.ceil(exCount/2):exCount;
  // How many plan slots each prop can support at once, straight from the
  // studio inventory — a prop nobody has to queue for is left uncapped.
  const PROP_LIMITS_MAX = {};
  (state.props||[]).forEach(prop => {
    const cap = propCapacity(prop);
    if (cap === Infinity || cap <= 0) return;
    PROP_LIMITS_MAX[prop] = propUserCapped(prop) ? Math.min(cap, USER_CAP_SLOTS) : cap;
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

  if (resolvedStyle==='superset' && selected.length>1) selected=selected.slice(0,Math.floor(selected.length/2)*2);
  if (resolvedStyle==='hundred')  selected=selected.slice(0,10);
  if (resolvedStyle==='ygig') {
    // Candidates were already limited to props everybody can use at once.
    const ygigEven = selected.slice(0, Math.floor(selected.length/2)*2);
    if (ygigEven.length < 2) {
      showToast('Not enough partner-friendly exercises for You-Go-I-Go with these props.','error');
      return;
    }
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
      case 'ladder':   reps=rungRepsLabel('ladder');  unit='reps'; seconds=30; break;
      case 'pyramid':  reps=rungRepsLabel('pyramid'); unit='reps'; seconds=30; break;
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

  state.workout = {
    style:resolvedStyle, styleCfg, exercises,
    warmup:warmupExs, cooldown:cooldownExs,
    diff, mainDur, stationCount,
    warmupDuration:warmupDur,
    participants:state.participants,
    ygigWorkSec:state.ygigWorkSec,
    muscle:state.muscle,
    duration:classLen,
    // Coverage metadata produced by programming.js
    accessoryFocus: picked.accessoryFocus,
    recentClasses:  picked.recentClasses,
    muscleLoad:     muscleLoadForExercises(exercises),
  };
  // A new plan is never the class that was running before it.
  resetTimerState();
  if (resolvedStyle==='custom') customCfg(state.workout);
  maybeAutoAddCoreBurner({silent:opts.silent});
  if (resolvedStyle==='custom') fitCustomToTime(state.workout);
  // The pair count was picked before a core burner took its share of the
  // block, so drop trailing pairs if one pass alone would now overrun.
  if (resolvedStyle==='ygig') {
    const w=state.workout;
    while (w.exercises.length>2) {
      const yp=ygigPlan(w);
      if (5+yp.pairs.length*yp.pairSec <= mainBudgetSec(w)+60) break;
      w.exercises.splice(-2);
    }
    w.muscleLoad=muscleLoadForExercises(w.exercises);
  }
  syncPlanTiming(state.workout);

  if (timeCapped && exCount < contract.requiredMajors.length && !opts.silent) {
    showToast('ℹ️ '+classLen+' min fits '+exCount+' moves in this style, so some muscle groups are worked as assistants only.');
  } else if (picked.gaps.length && !opts.silent) {
    showToast('⚠️ No exercise available for: '+picked.gaps.map(id=>muscleLabel(id)).join(', '),'error');
  } else if (picked.weakGaps.length && !opts.silent) {
    showToast('ℹ️ Assist-only this class: '+picked.weakGaps.map(id=>muscleLabel(id)).join(', ')+'. Add props for direct work.');
  }
  if (resolvedStyle==='ygig' && !opts.silent) {
    if (ygigTopUp) showToast('🤝 Added bodyweight moves — partners work at the same time, so shared-station props were left out.');
    else if ((state.participants||0) % 2) showToast('🤝 '+state.participants+' people: make one group a trio — one works, two hold the active rest, then rotate.');
  }

  renderPlanEditor();
  showScreen('plan-editor-screen');
}

// ─── PLAN EDITOR ─────────────────────────────────────────────
function renderPlanEditor() {
  if (!state.workout) return;
  renderCoveragePanel();
  if (typeof syncClassQRButton==='function') syncClassQRButton();
  syncPlanTiming(state.workout);
  updatePlanTimeBadge();
  if (typeof MA!=='undefined'&&MA.enabled) {
    renderTieredPlanEditor();
    // The tiered view has no style banners of its own; put them in front of
    // the main block so EMOM minutes, YGIG time and ladder rungs stay editable.
    const pc=document.getElementById('plan-exercises');
    if (pc) {
      const tmp=document.createElement('div');
      appendStyleBanners(tmp);
      const main=pc.querySelector('[data-section="main-section"]');
      Array.from(tmp.children||[]).forEach(b=>{ if(main&&main.parentNode===pc) pc.insertBefore(b,main); else pc.appendChild(b); });
    }
    return;
  }
  const {style,styleCfg,exercises,warmup,cooldown,diff,stationCount}=state.workout;
  document.getElementById('plan-style-badge').textContent  = styleCfg.icon+' '+styleCfg.name;
  document.getElementById('plan-muscle-badge').textContent = '💪 '+muscleFocus(state.muscle).label;
  document.getElementById('plan-people-badge').textContent = '👥 '+state.workout.participants;
  document.getElementById('plan-diff-badge').textContent   = '⭐ '+(DIFF_LABEL[diff]||diff);
  document.getElementById('plan-style-desc').textContent   = (STYLES[style]&&STYLES[style].desc)||styleCfg.desc;
  const stNote=document.getElementById('plan-station-note');
  if (state.workout.participants>=8){stNote.textContent='📍 Suggested stations: '+stationCount+' (pairs share props)';stNote.style.display='block';}
  else stNote.style.display='none';

  const container=document.getElementById('plan-exercises'); container.innerHTML='';

  if (warmup.length>0) {
    container.appendChild(makeSectionHeader('🔥 Warm-Up','~'+Math.max(1,Math.round(warmupSeconds(state.workout)/60))+' min','warmup-section'));
    warmup.forEach((ex,i)=>container.appendChild(makePlanWarmCoolCard(ex,i,'warmup')));
  }

  appendStyleBanners(container);
  renderPlanMainSection(container);
}

// Style banners (EMOM minutes, Tabata blocks, circuit rounds, YGIG pairs and
// time per person, ladder rungs). Shared by the standard and mixed-ability
// plan views so both show how the class will actually run.
function appendStyleBanners(container) {
  const {style,exercises}=state.workout;
  if (style==='emom') {
    const p = emomPlan(state.workout);
    const banner=document.createElement('div'); banner.className='style-info-banner';
    // Call out anything the class has to queue for.
    const limitedInPlan = exercises.filter(ex => propCapacity(ex.prop) !== Infinity);
    const limitedNote = limitedInPlan.length>0 && state.participants>1
      ? ' <b>Note:</b> '+limitedInPlan.map(e=>escapeHtml(e.propLabel)).join(', ')+' — shared prop, use as a station.'
      : '';
    const cycles = p.groups.length ? Math.round(p.totalMins/p.groups.length*10)/10 : 0;
    const shape = p.exPerMin===2
      ? 'two moves share each minute: 20s on the first, a 5s switch, 20s on the second, then 15s rest'
      : 'one move per minute: 40s work, 20s rest';
    banner.innerHTML='<span class="sib-icon">⏱️</span><span><b>EMOM:</b> '+exercises.length+' exercises, '+shape+'. <b>'+p.totalMins+' minutes</b> — the list cycles '+cycles+'× to fill the block.'+limitedNote+'</span>';
    container.appendChild(banner);
  }
  if (style==='tabata') {
    const tp = tabataPlan(state.workout);
    const banner=document.createElement('div'); banner.className='style-info-banner';
    const short=(tp.rounds||[]).filter(r=>r<8).length;
    banner.innerHTML='<span class="sib-icon">🔥</span><span><b>Tabata:</b> '+tp.blocks.length+' block'+(tp.blocks.length===1?'':'s')+
      ' of 8 × 20s on / 10s off (4 min each) with 20s to change over'+
      (short?' — the last is a shorter '+tp.rounds[tp.rounds.length-1]+'-round finisher so the class ends on time':'')+'. '+
      (tp.blocks.some(b=>b.length>1)?'Blocks with more than one move alternate them round by round.':'One move per block.')+'</span>';
    container.appendChild(banner);
  }
  if (style==='circuit' || style==='superset') {
    const cp = style==='circuit' ? circuitPlan(state.workout) : supersetPlan(state.workout);
    const banner=document.createElement('div'); banner.className='style-info-banner';
    banner.innerHTML = style==='circuit'
      ? '<span class="sib-icon">⚡</span><span><b>Circuit:</b> '+cp.work+'s work / '+cp.rest+'s transition, <b>'+cp.rounds+' round'+(cp.rounds===1?'':'s')+'</b> with 30s between rounds.</span>'
      : '<span class="sib-icon">💥</span><span><b>Superset:</b> each pair '+cp.rounds+'× back-to-back ('+cp.work+'s on / '+cp.rest+'s off)'+(cp.passes>1?', <b>'+cp.passes+' passes</b> through the list':'')+'.</span>';
    container.appendChild(banner);
  }
  if (style==='ygig') {
    const yp = ygigPlan(state.workout);
    const banner=document.createElement('div'); banner.className='style-info-banner ygig-banner';
    const ygigSec = state.workout.ygigWorkSec || state.ygigWorkSec || 45;
    const roundNote = (yp.rounds>1 ? ' <b>'+yp.rounds+' rounds</b> through '+yp.pairs.length+' pairs' : '')
      + (yp.lastPairs ? (yp.rounds>1?', the last':' One pass')+' with only the first '+yp.lastPairs+' pair'+(yp.lastPairs===1?'':'s')+' to finish on time.' : (yp.rounds>1?'.':''));
    banner.innerHTML='<span class="sib-icon">🤝</span><div class="ygig-banner-content"><div><b>You-Go-I-Go:</b> Person A does reps while Person B holds active rest. Switch when done.'+roundNote+'</div><div class="ygig-time-control"><span class="ygig-time-label">⏱ Time per person:</span><div class="ygig-time-btns"><button class="ygig-time-btn '+(ygigSec===20?'active':'')+'" data-sec="20" data-onclick="selectYgigTime(this)">20s</button><button class="ygig-time-btn '+(ygigSec===30?'active':'')+'" data-sec="30" data-onclick="selectYgigTime(this)">30s</button><button class="ygig-time-btn '+(ygigSec===45?'active':'')+'" data-sec="45" data-onclick="selectYgigTime(this)">45s</button><button class="ygig-time-btn '+(ygigSec===60?'active':'')+'" data-sec="60" data-onclick="selectYgigTime(this)">60s</button><button class="ygig-time-btn '+(ygigSec===90?'active':'')+'" data-sec="90" data-onclick="selectYgigTime(this)">90s</button></div><input type="number" class="ygig-time-custom" min="15" max="120" value="'+ygigSec+'" data-onchange="setCustomYgigTime(this.value)" placeholder="sec"/></div></div>';
    container.appendChild(banner);
  }
  if (SELF_PACED[style]) {
    const banner=document.createElement('div'); banner.className='style-info-banner';
    const cfg=SELF_PACED[style];
    const rungs=classRungs();
    const mins=Math.max(5,Math.round(state.workout.mainDur||30));
    const detail = style==='hundred'
      ? '<b>100 Reps Challenge:</b> Each exercise gets progressively more reps — 10, 20, 30 …. Total = '+
        exercises.reduce((s,e,i)=>s+(parseInt(e.reps,10)||((i+1)*10)),0)+' reps.'
      : style==='amrap'
        ? '<b>AMRAP:</b> Repeat the full list as many times as you can.'
        : '<b>'+STYLES[style].name+':</b> Every exercise at each rung.';
    const blurb='<span class="sib-icon">'+cfg.icon+'</span><span>'+detail+
      ' One '+mins+'-minute clock for the whole block — athletes work at their own pace '+
      'and track reps on their phone.</span>';
    if (rungs) {
      banner.classList.add('rung-banner');
      banner.innerHTML='<div class="sib-row">'+blurb+'</div>'+makeRungEditor(style,rungs);
    } else {
      banner.innerHTML=blurb;
    }
    container.appendChild(banner);
  }
}

function renderPlanMainSection(container) {
  const {style,exercises,cooldown}=state.workout;
  if (style==='custom') container.appendChild(makeCustomPanel());

  container.appendChild(makeSectionHeader('⚡ Main Workout',
    style==='custom' ? '<span id="custom-main-est">'+fmtMinSec(customMainSeconds())+'</span>'
                     : '~'+Math.round(state.workout.mainDur)+' min','main-section'));
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
    container.appendChild(makeSectionHeader('❄️ Cool-Down','~'+Math.max(1,Math.round(cooldownSeconds(state.workout)/60))+' min','cooldown-section'));
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
      '<label class="cp-field"><span>Work</span><input type="number" min="5" max="180" step="5" value="'+escapeHtml(String(cbWork(cb)))+'" data-onchange="setCoreBurnerCfg(\'work\',this.value)"></label>'+
      '<label class="cp-field"><span>Rest</span><input type="number" min="0" max="120" step="5" value="'+escapeHtml(String(cbRest(cb)))+'" data-onchange="setCoreBurnerCfg(\'rest\',this.value)"></label>'+
      '<label class="cp-field"><span>Rounds</span><input type="number" min="1" max="6" value="'+escapeHtml(String(Math.max(1,parseInt(cb.rounds,10)||1)))+'" data-onchange="setCoreBurnerCfg(\'rounds\',this.value)"></label>'+
      '<button class="cb-add-ex" data-onclick="addCoreBurnerExercise()">+ Add core move</button>'+
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
        '<div class="exercise-reps">'+escapeHtml(String(cbWork(cb)))+'s</div>'+
        '<div class="exercise-reps-label">work</div>'+
        '<div class="plan-card-actions">'+
          '<button class="swap-btn" data-onclick="swapCoreBurnerExercise('+i+')" title="Swap" aria-label="Swap core move">⇄</button>'+
          '<button class="del-btn" data-onclick="removeCoreBurnerExercise('+i+')" title="Remove" aria-label="Remove core move">✕</button>'+
        '</div>'+
      '</div>';
    container.appendChild(card);
  });
}

function makeSectionHeader(title,sub,section) {
  const div=document.createElement('div'); div.className='section-header';
  if (section) div.setAttribute('data-section', section);
  div.innerHTML='<span class="section-title">'+title+'</span><span class="section-sub">'+sub+'</span>';
  const btn=document.createElement('button'); btn.className='add-ex-inline-btn'; btn.textContent='+ Add';
  btn.onclick=()=>openAddExerciseModal(section==='warmup-section'?'warmup':section==='cooldown-section'?'cooldown':null, true);
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
  const modeBtn=(v,l)=>'<button class="cp-mode-btn'+(cfg.mode===v?' active':'')+'" data-onclick="setCustomCfg(\'mode\',\''+v+'\')">'+l+'</button>';
  const paceBtn=(v,l,d)=>'<button class="cp-pace-btn'+(cfg.pace===v?' active':'')+'" data-onclick="setCustomCfg(\'pace\',\''+v+'\')">'+
    '<b>'+l+'</b><span>'+d+'</span></button>';
  const selfPaced=cfg.pace==='self';
  div.innerHTML=
    '<div class="cp-head"><span class="sib-icon">🛠️</span><div>'+
      '<b>Custom class</b> — this plan is yours to shape. Reorder, swap or remove anything, '+
      'use <b>+ Add</b> for your own movements, and set the timing per exercise below.'+
    '</div></div>'+
    '<div class="cp-pace-row">'+
      paceBtn('clock','⏱ On the clock','Everyone moves together on your work/rest intervals.')+
      paceBtn('self','🏃 Self-paced','One clock for the whole block. Athletes track their own reps on their phone.')+
    '</div>'+
    '<div class="cp-grid">'+
      '<label class="cp-field"><span>Rounds</span>'+
        '<input type="number" min="1" max="20" value="'+cfg.rounds+'" data-onchange="setCustomCfg(\'rounds\',this.value)"></label>'+
      (selfPaced?'':
      '<label class="cp-field"><span>Rest between rounds</span>'+
        '<input type="number" min="0" max="600" step="5" value="'+cfg.roundRest+'" data-onchange="setCustomCfg(\'roundRest\',this.value)"></label>')+
      '<label class="cp-field"><span>Default '+(selfPaced?'target':'work')+'</span>'+
        '<input type="number" min="5" max="600" step="5" value="'+cfg.work+'" data-onchange="setCustomCfg(\'work\',this.value)"></label>'+
      (selfPaced?'':
      '<label class="cp-field"><span>Default rest</span>'+
        '<input type="number" min="0" max="300" step="5" value="'+cfg.rest+'" data-onchange="setCustomCfg(\'rest\',this.value)"></label>')+
      '<div class="cp-field"><span>New exercises use</span>'+
        '<div class="cp-mode-row">'+modeBtn('time','⏱ Time')+modeBtn('reps','🔢 Reps')+'</div></div>'+
    '</div>'+
    '<div class="cp-foot">'+
      '<button class="cp-apply" data-onclick="applyCustomDefaultsToAll()">↧ Apply defaults to every exercise</button>'+
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
  if(field==='pace') { cfg.pace = val==='self'?'self':'clock'; renderPlanEditor(); return; }
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
  return '<div class="cx-row" data-onclick="event.stopPropagation()">'+
    '<div class="cx-toggle">'+
      '<button class="cx-mode'+(!isReps?' active':'')+'" data-onclick="setCustomExMode('+i+',\'time\')">⏱ Time</button>'+
      '<button class="cx-mode'+(isReps?' active':'')+'" data-onclick="setCustomExMode('+i+',\'reps\')">🔢 Reps</button>'+
    '</div>'+
    (isReps
      ? '<label class="cx-field"><span>Reps</span><input type="number" min="1" max="200" value="'+ex.cReps+'" data-onchange="setCustomExField('+i+',\'cReps\',this.value)"></label>'+
        '<label class="cx-field"><span>Time cap</span><input type="number" min="5" max="600" step="5" value="'+ex.cWork+'" data-onchange="setCustomExField('+i+',\'cWork\',this.value)"></label>'
      : '<label class="cx-field"><span>Work</span><input type="number" min="5" max="600" step="5" value="'+ex.cWork+'" data-onchange="setCustomExField('+i+',\'cWork\',this.value)"></label>')+
    '<label class="cx-field"><span>Rest</span><input type="number" min="0" max="300" step="5" value="'+ex.cRest+'" data-onchange="setCustomExField('+i+',\'cRest\',this.value)"></label>'+
    '<label class="cx-field cx-prop"><span>Prop</span><select data-onchange="setCustomExProp('+i+',this.value)">'+
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
        '<span class="exercise-prop prop-'+propCss+'">'+escapeHtml(ex.propLabel)+'</span>'+
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
        '<button class="edit-btn" data-onclick="editPlanExercise('+i+')" title="Edit" aria-label="Edit '+escapeHtml(ex.name)+'">✏️</button>'+
        '<button class="swap-btn" data-onclick="swapExercise('+i+')" title="Swap (keeps muscle coverage)" aria-label="Swap '+escapeHtml(ex.name)+'">⇄</button>'+
        '<button class="del-btn"  data-onclick="removeExercise('+i+')" title="Remove" aria-label="Remove '+escapeHtml(ex.name)+'">✕</button>'+
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
      '<div class="exercise-reps">'+secOf(ex.duration,30)+'s</div>'+
      '<div class="exercise-reps-label">hold/work</div>'+
      '<div class="plan-card-actions">'+
        '<button class="edit-btn" data-onclick="editWarmCoolExercise(\''+type+'\','+i+')" title="Edit">✏️</button>'+
        '<button class="del-btn"  data-onclick="removeWarmCoolExercise(\''+type+'\','+i+')" title="Remove">✕</button>'+
      '</div>'+
    '</div>';
  return card;
}

function removeExercise(idx){
  const w=state.workout; if(!w||!w.exercises[idx])return;
  const snap=cloneWorkout(w);
  const removed=w.exercises[idx];
  // YGIG moves live in pairs (primary + partner's active rest); taking one
  // out would shift every later pair and match a move with itself.
  if(w.style==='ygig'&&!(typeof MA!=='undefined'&&MA.enabled)){
    const start=idx-(idx%2);
    w.exercises.splice(start,2);
  } else w.exercises.splice(idx,1);
  renumberHundred(w);
  w.muscleLoad=muscleLoadForExercises(w.exercises);
  w._edited=true;
  renderPlanEditor();
  // Dropping an exercise can leave the class without core work, or short on
  // time — surface the finisher rather than silently changing their plan.
  const advice=coreBurnerAdvice();
  const what=w.style==='ygig'?'Pair removed':'Removed '+removed.name;
  showUndoToast(advice?what+' · 🎯 Core Burner suggested — '+advice.reason+'.':what, snap);
}
function removeWarmCoolExercise(type,idx){
  const w=state.workout; const list=type==='warmup'?w.warmup:w.cooldown; if(!list||!list[idx])return;
  const snap=cloneWorkout(w);
  const removed=list.splice(idx,1)[0];
  w._edited=true;
  renderPlanEditor();
  showUndoToast('Removed '+removed.name,snap);
}
function swapExercise(idx,opts){
  opts=opts||{};
  const ex=state.workout.exercises[idx],diff=state.workout.diff;
  if(!ex)return;
  const snap=opts.silent?null:cloneWorkout(state.workout);
  const wStyle=state.workout.style; // use resolved style from workout
  const focusKey=state.workout.muscle||state.muscle;
  const focusKeys=muscleFocus(focusKey).keys;
  const contract=getFocusContract(focusKey);
  const inPlan=new Set(state.workout.exercises.map(e=>e.name));
  const sig=ex.muscles&&ex.muscles.primary?ex.muscles:resolveMuscles(ex);

  // Which majors would go uncovered if this exercise simply vanished?
  const others=state.workout.exercises.filter((_,i)=>i!==idx);
  const covered=new Set();
  others.forEach(o=>{const s=resolveMuscles(o);[...s.primary,...s.secondary].forEach(id=>covered.add(id));});
  const mustKeep=contract.requiredMajors.filter(id=>!covered.has(id)&&[...sig.primary,...sig.secondary].includes(id));

  // Candidates: every selected prop (the instructor's own moves included),
  // same difficulty + focus, not already in the plan, and only props there
  // are enough of. YGIG partners work at the same time, so no shared props.
  const contractGroups=new Set([...contract.requiredMajors,...contract.minorPool]);
  const people=state.workout.participants;
  const props=(state.props&&state.props.length)?state.props:[ex.prop||'bodyweight'];
  const custom=Object.values(state.customExercises||{}).flat();
  const pool=[];
  props.forEach(prop=>{
    if(!propUsable(prop,people))return;
    if(wStyle==='ygig'&&propCapacity(prop,people)!==Infinity)return;
    // Same slot limit the generator uses for props the class has to share.
    const cap=propCapacity(prop,people);
    if(cap!==Infinity&&prop!==ex.prop){
      const slots=propUserCapped(prop,people)?Math.min(cap,USER_CAP_SLOTS):cap;
      if(state.workout.exercises.filter(o=>o.prop===prop).length>=slots)return;
    }
    const seen=new Set();
    (DB[prop]||[]).concat(custom.filter(c=>(c.prop||'bodyweight')===prop).map(c=>({...c,_custom:true}))).forEach(e=>{
      if(!e||!e.name||inPlan.has(e.name)||seen.has(e.name))return;
      seen.add(e.name);
      if(!e.difficulty||!e.difficulty.includes(diff))return;
      const tagged=e.focus&&e.focus.some(f=>focusKeys.includes(f));
      if(!tagged){
        const es=resolveMuscles(e);
        if(![...es.primary,...es.secondary].some(id=>contractGroups.has(id)))return;
      }
      if(e.avoidForTime&&['tabata','amrap','emom','circuit','hundred'].includes(wStyle))return;
      pool.push({...e,prop});
    });
  });
  if(!pool.length){ if(!opts.silent) showToast('No alternatives found for your props and difficulty'); return; }

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
    case 'ladder':  reps=rungRepsLabel('ladder');  unit='reps'; seconds=30; break;
    case 'pyramid': reps=rungRepsLabel('pyramid'); unit='reps'; seconds=30; break;
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
  state.workout._edited=true;
  if(opts.silent)return;
  renderPlanEditor();
  showUndoToast('Swapped '+ex.name+' → '+newEx.name+(mustKeep.length?' (coverage kept)':''),snap);
}
function editPlanExercise(idx){const ex=state.workout.exercises[idx];state.modal.editTarget='plan-main';state.modal.editIndex=idx;state.modal.category=exCat(ex);openExerciseModal(state.modal.category,ex);}
function editWarmCoolExercise(type,idx){const ex=type==='warmup'?state.workout.warmup[idx]:state.workout.cooldown[idx];state.modal.editTarget=type==='warmup'?'plan-warmup':'plan-cooldown';state.modal.editIndex=idx;state.modal.category=type;openExerciseModal(type,ex);}

// ─── SAVE / EXPORT ────────────────────────────────────────────
function defaultClassName(){
  if(!state.workout)return 'Class';
  const cfg=state.workout.styleCfg||{};
  const focus=muscleFocus(state.muscle).label;
  const day=new Date().toLocaleDateString(undefined,{weekday:'long'});
  return day+' '+(cfg.name||'Class')+(focus?' — '+focus:'');
}
function openSaveClassModal(){
  if(!state.workout){showToast('Build a class first');return;}
  const modal=document.getElementById('save-class-modal');
  const input=document.getElementById('save-class-name');
  const sub=document.getElementById('save-class-sub');
  if(!modal||!input)return;
  const cfg=state.workout.styleCfg||{};
  if(sub)sub.textContent=(cfg.icon?cfg.icon+' ':'')+(cfg.name||'Class')+' · '+
    state.workout.duration+' min · '+state.workout.exercises.length+' exercises';
  input.value=defaultClassName();
  modal.style.display='flex';
  // Pre-selected so a new name simply replaces the suggestion.
  setTimeout(()=>{input.focus();input.select();},30);
}
function closeSaveClassModal(){
  const modal=document.getElementById('save-class-modal');
  if(modal)modal.style.display='none';
}
function saveWorkout(name){
  if(!state.workout)return;
  const clean=(name||'').trim()||defaultClassName();
  const saved={
    id:Date.now(),
    name:clean,
    date:new Date().toLocaleDateString(),
    // A copy: later edits to the open plan must not rewrite the saved class.
    workout:cloneWorkout(state.workout),
    participants:state.workout.participants,
    duration:state.workout.duration,
    muscle:state.muscle,
    style:state.workout.style,
    // Kept so loading restores the setup exactly, not just the exercises.
    difficulty:state.difficulty,
    props:Array.isArray(state.props)?state.props.slice():state.props,
    includeWarmup:state.includeWarmup,
    includeCooldown:state.includeCooldown,
    warmupDuration:state.warmupDuration,
    ygigWorkSec:state.ygigWorkSec
  };
  const merged=mergeById([saved],state.savedWorkouts,readJSON(personalKey(PERSONAL_SAVED),[]));
  if(merged.length>20){
    const dropped=merged.slice(20).map(s=>'“'+(s.name||'Class')+'”').join(', ');
    if(!askConfirm('You can keep 20 saved classes. Saving this one removes your oldest: '+dropped+
      '.\n\nBack it up first from the Saved screen if you want to keep it. Save anyway?')){showToast('Not saved');return null;}
    merged.length=20;
  }
  state.savedWorkouts=merged;
  // A tick over a class the browser refused to keep is the worst outcome:
  // she finds out on Monday, in front of the room. Say so now instead.
  if(saveToStorage())showToast('✅ Saved “'+clean+'”','success');
  else showToast('⚠️ “'+clean+'” is open now, but this browser won\'t keep it ('+
    IHStore.shortReason()+'). Tap ⬇︎ Back up on the Saved screen.','warn');
  return saved;
}
function exportPDF(){
  if(!state.workout)return;
  if(typeof MA!=='undefined'&&MA.enabled){exportTieredPDF();return;}
  const {styleCfg,exercises,warmup,cooldown,diff}=state.workout;
  let html='<html><head><style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{color:#ff4d00}table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#f0f0f0;text-align:left;padding:7px;font-size:12px}td{padding:7px;border-bottom:1px solid #eee;font-size:12px}.section{margin:18px 0 6px;font-size:15px;font-weight:bold;border-bottom:2px solid #ff4d00;padding-bottom:3px}.footer{margin-top:28px;font-size:10px;color:#999;text-align:center}</style></head><body><h1>Inspire Habits Class</h1><p style="color:#666;font-size:13px">Style: <b>'+escapeHtml(styleCfg.name)+'</b> | Focus: <b>'+escapeHtml(muscleFocus(state.muscle).label)+'</b> | Difficulty: <b>'+escapeHtml(DIFF_LABEL[diff]||diff)+'</b> | Duration: <b>'+escapeHtml(state.workout.duration)+' min</b> (planned '+fmtMinSec(classSeconds(state.workout))+') | Participants: <b>'+escapeHtml(state.workout.participants)+'</b> | Date: <b>'+new Date().toLocaleDateString()+'</b></p>';
  if(warmup.length>0){html+='<div class="section">🔥 Warm-Up</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>';warmup.forEach((ex,i)=>{html+='<tr><td>'+(i+1)+'</td><td>'+escapeHtml(ex.name)+'</td><td>'+secOf(ex.duration,30)+'s</td><td>'+escapeHtml(ex.note||'')+'</td></tr>';});html+='</table>';}
  html+=buildCoveragePDFSection(exercises, state.workout.muscle||state.muscle);
  html+='<div class="section">⚡ Main Workout</div><table><tr><th>#</th><th>Exercise</th><th>Prop</th><th>Muscle</th><th>Targets</th><th>Reps/Time</th><th>Easier</th><th>Harder</th></tr>';
  exercises.forEach((ex,i)=>{const sig=ex.muscles&&ex.muscles.primary?ex.muscles:resolveMuscles(ex);html+='<tr><td>'+(i+1)+'</td><td>'+escapeHtml(ex.name)+(ex.isPartner?' 👥':'')+'</td><td>'+escapeHtml(ex.propLabel)+'</td><td>'+escapeHtml(ex.muscle||'')+'</td><td style="font-size:10px">'+escapeHtml(sig.primary.map(id=>muscleLabel(id,true)).join(', '))+(sig.secondary.length?' <span style="color:#999">(+'+escapeHtml(sig.secondary.map(id=>muscleLabel(id,true)).join(', '))+')</span>':'')+'</td><td>'+escapeHtml(ex.reps)+' '+escapeHtml(ex.unit||'')+'</td><td style="color:#888;font-size:11px">'+escapeHtml(ex.easier||'')+'</td><td style="color:#888;font-size:11px">'+escapeHtml(ex.harder||'')+'</td></tr>';});
  html+='</table>';
  const cbPdf=state.workout.coreBurner;
  if(cbPdf&&cbPdf.exercises&&cbPdf.exercises.length){
    const cbRounds=Math.max(1,parseInt(cbPdf.rounds,10)||1);
    html+='<div class="section">🎯 Core Burner — '+cbWork(cbPdf)+'s on / '+cbRest(cbPdf)+'s off'+(cbRounds>1?' &times; '+cbRounds+' rounds':'')+'</div><table><tr><th>#</th><th>Exercise</th><th>Prop</th><th>Pattern</th><th>Work</th></tr>';
    cbPdf.exercises.forEach((ex,i)=>{html+='<tr><td>'+(i+1)+'</td><td>'+escapeHtml(ex.name)+'</td><td>'+escapeHtml(ex.propLabel)+'</td><td>'+escapeHtml(CORE_PATTERN_LABEL[ex._cbPattern]||'Core')+'</td><td>'+cbWork(cbPdf)+'s</td></tr>';});
    html+='</table>';
  }
  if(cooldown.length>0){html+='<div class="section">❄️ Cool-Down</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>';cooldown.forEach((ex,i)=>{html+='<tr><td>'+(i+1)+'</td><td>'+escapeHtml(ex.name)+'</td><td>'+secOf(ex.duration,30)+'s</td><td>'+escapeHtml(ex.note||'')+'</td></tr>';});html+='</table>';}
  html+='<div class="footer">Generated by Inspire Habits · '+new Date().toLocaleString()+'</div></body></html>';
  const win=window.open('','_blank');
  if(!win){showToast('Pop-ups are blocked — allow them to print','error');return;}
  win.document.write(html);win.document.close();win.print();
}
function buildCoveragePDFSection(exercises, focusKey){
  const r=analyzeCoverage(exercises,focusKey);
  let h='<div class="section">🧬 Muscle Coverage</div><table><tr><th>Major group</th><th>Direct</th><th>Assist</th><th>Exercises</th></tr>';
  r.majors.forEach(m=>{
    h+='<tr><td><b>'+escapeHtml(m.label)+'</b></td><td>'+m.direct+'</td><td>'+m.assist+'</td><td style="font-size:10px;color:'+(m.covered?'#555':'#c00')+'">'+(escapeHtml(m.exercises.join(', '))||'⚠️ NOT COVERED')+'</td></tr>';
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
  // Minutes actually taught, so a class ended early is not logged as full length.
  const seq=state.timer.sequence||[];
  let taughtMin=null,endedEarly=false;
  if(seq.length){
    const total=seqSuffix(seq)[0];
    const left=state.timer.current>=seq.length?0:classTimeLeft();
    taughtMin=Math.round((total-left)/60);
    endedEarly=left>30;
  }
  // Roll today's check-ins into each participant's attendance record.
  if(typeof Roster!=='undefined'&&typeof MA!=='undefined'&&MA.enabled)Roster.commitAttendance();
  // Rich entry: the coverage engine reads muscleLoad + exerciseNames to
  // rotate accessory work away from what was just taught.
  state.workoutHistory.unshift(stampInstructor({
    id:Date.now(), ts:Date.now(),
    date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
    style:state.workout.styleCfg.name,
    muscle:muscleFocus(state.workout.muscle||state.muscle).label,
    muscleKey:state.workout.muscle||state.muscle,
    duration:state.workout.duration, participants:state.workout.participants,
    taughtMin:taughtMin, endedEarly:endedEarly,
    exercises:exs.length,
    exerciseNames:exs.map(e=>e.name),
    muscleLoad:muscleLoadForExercises(exs),
    accessoryFocus:state.workout.accessoryFocus||[],
    profileId:currentInstructorId()||((typeof profileState!=='undefined')?profileState.activeProfile:null),
  }));
  // The log is kept for coverage and the studio view, but it must not grow
  // without bound in a few-MB localStorage quota.
  if(state.workoutHistory.length>HISTORY_CAP)state.workoutHistory.length=HISTORY_CAP;
  saveToStorage();
}
function showHistory(){
  syncSavedWorkouts();
  syncHistory();
  const hc=document.getElementById('history-list');hc.innerHTML='';
  if(!state.workoutHistory.length)hc.innerHTML='<div class="empty-state">No classes taught yet.<br>Every class run from this studio shows up here, whoever taught it.</div>';
  else state.workoutHistory.forEach(e=>{
    const d=document.createElement('div');d.className='history-card';
    const top=Object.entries(e.muscleLoad||{}).sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([id])=>'<span class="hist-mg">'+muscleIcon(id)+' '+escapeHtml(muscleLabel(id,true))+'</span>').join('');
    const mine=e.instructorId&&e.instructorId===currentInstructorId();
    const who='<span class="hist-who'+(mine?' is-mine':'')+'">'+
      escapeHtml(e.instructorIcon||'🏋️')+' '+escapeHtml(e.instructorName||'Unknown')+(mine?' · you':'')+'</span>';
    d.innerHTML='<div class="history-top"><div class="history-date">'+escapeHtml(e.date)+' '+escapeHtml(e.time)+'</div>'+who+'</div>'+
      '<div class="history-info"><span class="history-style">'+escapeHtml(e.style)+'</span><span class="history-muscle">'+escapeHtml(e.muscle)+'</span></div>'+
      '<div class="history-meta">'+(e.endedEarly&&e.taughtMin!=null?escapeHtml(e.taughtMin)+' of ':'')+escapeHtml(e.duration)+' min'+(e.endedEarly?' (ended early)':'')+' · '+escapeHtml(e.participants)+' people · '+escapeHtml(e.exercises)+' exercises</div>'+
      (top?'<div class="hist-mg-row">'+top+'</div>':'')+
      (e.note?'<div class="history-note">📝 '+escapeHtml(e.note)+'</div>':'');
    hc.appendChild(d);
  });
  const sc=document.getElementById('saved-list');sc.innerHTML='';
  sc.appendChild(buildStorageNotice());
  const tools=document.createElement('div');
  tools.className='saved-tools';
  tools.innerHTML='<button class="small-btn" data-onclick="exportSavedClasses()">⬇︎ Back up to file</button>'+
    '<button class="small-btn" data-onclick="triggerImportClasses()">📥 Restore from file</button>';
  sc.appendChild(tools);
  if(!state.savedWorkouts.length)sc.insertAdjacentHTML('beforeend','<div class="empty-state">No saved classes yet.<br>Build a class, then tap 💾 Save Class on the plan screen.</div>');
  else state.savedWorkouts.forEach(sw=>{
    const d=document.createElement('div');d.className='history-card saved-card';
    const cfg=(sw.workout&&sw.workout.styleCfg)||{};
    const icon=escapeHtml(cfg.icon||'🏋️');
    const styleName=cfg.name||sw.style||'Class';
    const focus=muscleFocus(sw.muscle).label;
    const exCount=(sw.workout&&sw.workout.exercises)?sw.workout.exercises.length:0;
    const burner=(sw.workout&&sw.workout.coreBurner&&sw.workout.coreBurner.exercises&&sw.workout.coreBurner.exercises.length)
      ?' · 🎯 Core Burner':'';
    const idArg=escapeHtml(JSON.stringify(sw.id));
    d.innerHTML='<div class="history-date">Saved '+escapeHtml(sw.date)+'</div>'+
      '<div class="saved-name">'+escapeHtml(sw.name)+'</div>'+
      '<div class="history-info"><span class="history-style">'+icon+' '+escapeHtml(styleName)+'</span>'+
        (focus?'<span class="history-muscle">'+escapeHtml(focus)+'</span>':'')+'</div>'+
      '<div class="history-meta">'+escapeHtml(sw.duration)+' min · '+escapeHtml(sw.participants)+' people · '+exCount+' exercises'+burner+'</div>'+
      '<div class="saved-actions">'+
        '<button class="small-btn go" data-onclick="goLiveSavedWorkout('+idArg+')">📺 Go Live</button>'+
        '<button class="small-btn" data-onclick="loadSavedWorkout('+idArg+')">✏️ Open</button>'+
        '<button class="small-btn danger" data-onclick="deleteSavedWorkout('+idArg+')" aria-label="Delete '+escapeHtml(sw.name)+'">✕</button>'+
      '</div>';
    sc.appendChild(d);
  });
  showScreen('history-screen');
}
// Silence is the wrong default here. If the browser is refusing to keep
// anything, or is going to bin it a week from now, she needs to know while
// there is still time to press Back up — not the next time she opens the app.
function buildStorageNotice(){
  const box=document.createElement('div');
  if(!IHStore.ok()){
    box.className='storage-notice is-bad';
    box.innerHTML='<div class="sn-title">⚠️ This browser isn\'t keeping your classes</div>'+
      '<div class="sn-body">'+escapeHtml(IHStore.explain())+'</div>';
    return box;
  }
  if(IHStore.degraded()){
    box.className='storage-notice is-bad';
    box.innerHTML='<div class="sn-title">⚠️ Some changes weren\'t saved</div>'+
      '<div class="sn-body">The browser stopped accepting new data part-way through this session ('+
      escapeHtml(IHStore.shortReason())+'). Back up to a file before closing the tab.</div>';
    return box;
  }
  // Safari deletes all site storage after seven days without a visit. It is
  // the one browser where working perfectly today guarantees nothing.
  // Installing the app exempts it, so don't nag someone who already has.
  if (IHStore.isSafari()&&!IHStore.isInstalled()&&state.savedWorkouts.length){
    const onPhone=/iPhone|iPad|iPod/.test(navigator.userAgent||'');
    const how=onPhone
      ? 'tap Share, then <b>Add to Home Screen</b>'
      : 'open Safari\u2019s Share menu and choose <b>Add to Dock</b>';
    box.className='storage-notice is-info';
    box.innerHTML='<div class="sn-title">🧭 Safari clears site data after 7 days away</div>'+
      '<div class="sn-body">Saved classes live in this browser, and Safari deletes them if '+
      'the app goes a week without being opened. Either back them up to a file, or '+how+
      ' — installed apps are exempt and keep their classes for good.</div>';
    return box;
  }
  box.className='storage-notice is-hidden';
  return box;
}
// Putting the saved settings back, not just the exercises. Without this a
// loaded class kept whatever was last on the setup screen, so Regenerate
// would quietly build something else and the plan header read wrong.
function applySavedWorkout(sw){
  // Work on a copy so the saved class stays as it was saved.
  const w=cloneWorkout(sw.workout);
  // A different class is taking over: drop the old live sequence.
  resetTimerState();
  state.workout=w;
  state.muscle=sw.muscle!=null?sw.muscle:(w?w.muscle:state.muscle);
  state.style=sw.style!=null?sw.style:(w?w.style:state.style);
  state.duration=sw.duration!=null?sw.duration:(w?w.duration:state.duration);
  state.participants=sw.participants!=null?sw.participants:(w?w.participants:state.participants);
  if(sw.difficulty!=null)state.difficulty=sw.difficulty;else if(w&&w.diff!=null)state.difficulty=w.diff;
  if(Array.isArray(sw.props))state.props=sw.props.slice();
  if(sw.includeWarmup!=null)state.includeWarmup=sw.includeWarmup;
  if(sw.includeCooldown!=null)state.includeCooldown=sw.includeCooldown;
  if(sw.warmupDuration!=null)state.warmupDuration=sw.warmupDuration;else if(w&&w.warmupDuration!=null)state.warmupDuration=w.warmupDuration;
  if(sw.ygigWorkSec!=null)state.ygigWorkSec=sw.ygigWorkSec;else if(w&&w.ygigWorkSec!=null)state.ygigWorkSec=w.ygigWorkSec;
  renderMuscleFocus();
}
function loadSavedWorkout(id){
  const sw=state.savedWorkouts.find(s=>s.id===id);if(!sw||!sw.workout)return;
  applySavedWorkout(sw);
  renderPlanEditor();showScreen('plan-editor-screen');
  showToast('Loaded “'+sw.name+'”');
}
function goLiveSavedWorkout(id){
  const sw=state.savedWorkouts.find(s=>s.id===id);if(!sw||!sw.workout)return;
  applySavedWorkout(sw);
  renderPlanEditor();
  goLive();
}
function deleteSavedWorkout(id){
  syncSavedWorkouts();
  const sw=state.savedWorkouts.find(s=>s.id===id);
  if(sw&&!confirm('Delete “'+sw.name+'”?\n\nThis cannot be undone.'))return;
  state.savedWorkouts=state.savedWorkouts.filter(s=>s.id!==id);saveToStorage();showHistory();
}

// ─── BACK UP / RESTORE SAVED CLASSES ──────────────────────────
// A browser is not a filing cabinet, and Safari is the clearest proof:
//
//   · Opened from a folder (file://), it stores nothing at all.
//   · Private Browsing and "Block all cookies" refuse writes.
//   · Even when everything works, Safari deletes all site storage after
//     seven days without a visit. An instructor who builds a block of
//     classes and comes back a fortnight later finds an empty shelf, with
//     no warning and nothing to undo.
//
// So classes have to be able to leave the browser. A backup file is also
// how a class moves from a laptop at home to the one in the studio, which
// is how these three actually work.
const BACKUP_VERSION = 1;

function buildClassBackup(){
  syncSavedWorkouts();
  const who=currentInstructorId();
  const p=(typeof PROFILES!=='undefined'&&who)?PROFILES[who]:null;
  return {
    app:'inspire-habits',
    kind:'classes',
    version:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    instructorId:who||null,
    instructorName:p?p.name:null,
    classes:state.savedWorkouts,
    // Small, and it keeps a restored class recognisable if it leans on a
    // move the studio added itself.
    customExercises:state.customExercises,
    customWarmup:state.customWarmup,
    customCooldown:state.customCooldown,
  };
}

/** Safari needs the anchor in the document and the object URL kept alive
 *  past the click, or the download silently never starts. */
function downloadJSON(filename,obj){
  try{
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=filename;a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      try{document.body.removeChild(a);}catch(e){}
      URL.revokeObjectURL(url);
    },4000);
    return true;
  }catch(e){return false;}
}

function exportSavedClasses(){
  const data=buildClassBackup();
  if(!data.classes.length){showToast('No saved classes to back up yet');return;}
  const who=(data.instructorName||'studio').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const date=new Date().toISOString().split('T')[0];
  if(downloadJSON('inspire-habits-classes-'+who+'-'+date+'.json',data)){
    IHStore.set('hiit_last_backup',String(Date.now()));
    showToast('⬇︎ Backed up '+data.classes.length+' class'+(data.classes.length===1?'':'es'),'success');
  }
  else showToast('Couldn\'t create the backup file','error');
}

function triggerImportClasses(){
  const input=document.createElement('input');
  input.type='file';
  // Safari on macOS ignores unknown MIME hints, so offer the extension too.
  input.accept='application/json,.json';
  input.style.display='none';
  document.body.appendChild(input);
  input.addEventListener('change',e=>{
    const file=e.target.files&&e.target.files[0];
    if(file)readClassBackup(file);
    try{document.body.removeChild(input);}catch(err){}
  });
  input.click();
}

function readClassBackup(file){
  const reader=new FileReader();
  reader.onerror=()=>showToast('Couldn\'t read that file','error');
  reader.onload=ev=>{
    let data;
    try{data=JSON.parse(ev.target.result);}
    catch(err){showToast('That isn\'t a backup file — it isn\'t readable JSON','error');return;}
    applyClassBackup(data);
  };
  reader.readAsText(file);
}

function applyClassBackup(data){
  // Accept this app's own backups, and tolerate a bare array in case
  // someone hand-edits one.
  const incoming=Array.isArray(data)?data:(data&&Array.isArray(data.classes)?data.classes:null);
  if(!incoming){showToast('That file has no saved classes in it','error');return;}
  const valid=incoming.filter(c=>c&&c.workout&&Array.isArray(c.workout.exercises)&&c.id!=null)
    .map(c=>{
      // A file can be hand-edited or come from an older build. These fields
      // sit at the top level of a saved class (the card reads them there,
      // not from .workout), and a gap would render as "undefined min".
      const w=c.workout||{};
      const dateOk=typeof c.date==='string'&&!isNaN(new Date(c.date).getTime());
      const num=(v,alt,fb)=>(typeof v==='number'&&v>0)?v:((typeof alt==='number'&&alt>0)?alt:fb);
      return Object.assign({},c,{
        name:(typeof c.name==='string'&&c.name.trim())?c.name:'Restored class',
        date:dateOk?c.date:new Date().toLocaleDateString(),
        duration:num(c.duration,w.duration,45),
        participants:num(c.participants,w.participants,8),
        style:c.style||w.style||'circuit',
        muscle:c.muscle||w.muscle||'full',
        difficulty:c.difficulty||w.diff||'intermediate',
      });
    });
  if(!valid.length){showToast('No usable classes in that file','error');return;}

  syncSavedWorkouts();
  const before=state.savedWorkouts.length;
  const existing={};
  state.savedWorkouts.forEach(c=>{existing[c.id]=true;});
  // A backup restored onto a laptop that already has classes must not
  // silently drop either side, so merge by id and keep both.
  const added=valid.filter(c=>!existing[c.id]).length;
  state.savedWorkouts=mergeById(state.savedWorkouts,valid);
  const overflow=state.savedWorkouts.length>20;
  if(overflow)state.savedWorkouts.length=20;

  if(data&&!Array.isArray(data)){
    if(data.customExercises&&typeof data.customExercises==='object'){
      Object.keys(data.customExercises).forEach(k=>{
        if(!state.customExercises[k])state.customExercises[k]=data.customExercises[k];
      });
    }
    ['customWarmup','customCooldown'].forEach(k=>{
      if(Array.isArray(data[k])){
        const have={};(state[k]||[]).forEach(x=>{if(x&&x.name)have[x.name]=true;});
        data[k].forEach(x=>{if(x&&x.name&&!have[x.name])state[k].push(x);});
      }
    });
  }

  const stored=saveToStorage();
  showHistory();
  let msg='📥 Restored '+added+' class'+(added===1?'':'es');
  if(added<valid.length)msg+=' · '+(valid.length-added)+' already here';
  if(overflow)msg+=' · trimmed to the newest 20';
  if(!stored)msg+=' · not kept ('+IHStore.shortReason()+')';
  showToast(msg,stored?'success':'warn');
  if(before&&added)console.info('[inspire-habits] merged backup into '+before+' existing classes');
}

// ─── TIMER SEQUENCE ───────────────────────────────────────────
// The style shapes (tabataPlan, circuitPlan, supersetPlan, emomPlan,
// ygigPlan) live with the class-length helpers near the top of this file, so
// the plan banner, the time badge and the timer all read the same numbers.

function buildTimerSequence(){ return buildSequenceFor(state.workout); }

// The main block alone, built from the workout passed in (never state.workout)
// so the plan can be measured without touching the live class.
function buildMainSeq(w){
  const style=w.style, exercises=w.exercises||[], seq=[];
  if(style==='tabata'){
    const p=tabataPlan(w);
    p.blocks.forEach((blk,bi)=>{
      const last=bi===p.blocks.length-1;
      const R=(p.rounds&&p.rounds[bi])||8;
      for(let r=0;r<R;r++){
        const ei=blk[r%blk.length], ex=exercises[ei];
        seq.push({phase:'work',label:p.blocks.length>1?'WORK · BLOCK '+(bi+1)+'/'+p.blocks.length:'WORK',name:ex.name,prop:ex.propLabel,duration:20,round:r+1,totalRounds:R,_exIdx:ei});
        // The last rest is the block's last; the class does not need a rest
        // and then a change-over straight after it, nor either at the very end.
        if(r<R-1) seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:10,round:r+1,totalRounds:R});
      }
      if(!last) seq.push({phase:'rest',label:'NEXT BLOCK',name:'',prop:'',duration:p.gapSec+10});
    });
  }
  else if(style==='circuit'){
    const p=circuitPlan(w);
    for(let r=0;r<p.rounds;r++){
      seq.push({phase:'get-ready',label:'ROUND '+(r+1)+' OF '+p.rounds,name:'Round Starting',prop:'',duration:5});
      exercises.forEach((ex,ei)=>{
        seq.push({phase:'work',label:'WORK',name:ex.name,prop:ex.propLabel,duration:p.work,round:r+1,totalRounds:p.rounds,_exIdx:ei});
        seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:p.rest});
      });
      if(r<p.rounds-1)seq.push({phase:'rest',label:'ROUND REST',name:'',prop:'',duration:30});
    }
  }
  else if(style==='emom'){
    const p=emomPlan(w);
    for(let m=0;m<p.totalMins;m++){
      const g=p.groups[m%p.groups.length];
      const tag='MIN '+(m+1)+'/'+p.totalMins;
      if(g.items.length===1){
        const ex=g.items[0];
        seq.push({phase:'work',label:tag+' — WORK',name:ex.name,prop:ex.propLabel,duration:40,round:m+1,totalRounds:p.totalMins,_exIdx:g.start});
        seq.push({phase:'rest',label:'REST — NEXT MINUTE',name:'',prop:'',duration:20});
      } else {
        g.items.forEach((ex,gi)=>{
          seq.push({phase:'work',label:tag+' — '+(gi+1)+'/2',name:ex.name,prop:ex.propLabel,duration:20,round:m+1,totalRounds:p.totalMins,_exIdx:g.start+gi});
          seq.push(gi===0
            ?{phase:'rest',label:'SWITCH',name:'',prop:'',duration:5}
            :{phase:'rest',label:'REST — NEXT MINUTE',name:'',prop:'',duration:15});
        });
      }
    }
  }
  else if(SELF_PACED[style]){
    // One continuous clock for the whole main block. These four styles are
    // paced by the athlete, so forcing every set into its own slot both
    // overran the class and stopped anyone from working at their own speed.
    const cfg=SELF_PACED[style];
    const capSec=selfPacedCapSec(w);
    const rungs=classRungs(w);
    const ladder=exercises.map((ex,i)=>({n:i+1,name:ex.name,prop:ex.propLabel||'',
      reps:cfg.reps?cfg.reps(ex,i):(parseInt(ex.reps,10)||0),unit:ex.unit||'reps'}));
    const headline=cfg.headline(ladder,rungs);
    seq.push({phase:'get-ready',label:cfg.ready,name:headline,prop:'',duration:5});
    seq.push({phase:'work',label:cfg.label,name:headline,prop:'',duration:capSec,
      round:1,totalRounds:1,_exIdx:0,_ladder:ladder,_rungs:rungs||null,
      _paceNote:cfg.note,_pace:style});
    seq.push({phase:'get-ready',label:cfg.icon+' TIME!',name:headline,prop:'',duration:5});
  }
  else if(style==='ygig'){
    const p=ygigPlan(w);
    if(!p.pairs.length) return seq;
    seq.push({phase:'get-ready',label:'YOU-GO-I-GO',name:'Partners ready!',prop:'',duration:5});
    for(let r=0;r<p.rounds;r++){
      if(p.rounds>1) seq.push({phase:'get-ready',label:'ROUND '+(r+1)+' OF '+p.rounds,name:'Round Starting',prop:'',duration:5});
      const roundPairs=(r===p.rounds-1&&p.lastPairs)?p.pairs.slice(0,p.lastPairs):p.pairs;
      roundPairs.forEach((pair,pi)=>{
        const primary=pair.primary, activeRest=pair.active;
        const ygig={role:'primary',partner:activeRest.name,partnerProp:activeRest.propLabel,reps:primary.reps};
        seq.push({phase:'get-ready',label:'PAIR '+(pi+1)+' OF '+roundPairs.length,name:primary.name+' + '+activeRest.name,prop:'',duration:5});
        // Person A does the reps while Person B holds the active rest, then swap.
        seq.push({phase:'work',label:'PERSON A — REPS',name:primary.name,prop:primary.propLabel,
          duration:p.workSec,round:1,totalRounds:2,_exIdx:pair.idx,_ygig:ygig});
        seq.push({phase:'rest',label:'SWITCH!',name:'Partners switch positions',prop:'',duration:8});
        seq.push({phase:'work',label:'PERSON B — REPS',name:primary.name,prop:primary.propLabel,
          duration:p.workSec,round:2,totalRounds:2,_exIdx:pair.idx,_ygig:ygig});
        seq.push({phase:'rest',label:'NEXT PAIR',name:'',prop:'',duration:10});
      });
    }
  }
  else if(style==='superset'){
    const p=supersetPlan(w);
    for(let pass=0;pass<p.passes;pass++){
      if(p.passes>1) seq.push({phase:'get-ready',label:'ROUND '+(pass+1)+' OF '+p.passes,name:'Round Starting',prop:'',duration:5});
      p.pairs.forEach((pair,pi)=>{
        for(let r=0;r<p.rounds;r++){
          pair.forEach(ei=>{
            const ex=exercises[ei];
            seq.push({phase:'work',label:'WORK',name:ex.name,prop:ex.propLabel,duration:p.work,round:r+1,totalRounds:p.rounds,_exIdx:ei});
            seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:p.rest});
          });
        }
        const lastPair=pass===p.passes-1&&pi===p.pairs.length-1;
        if(!lastPair) seq.push({phase:'rest',label:'SUPERSET REST',name:'',prop:'',duration:30});
      });
    }
  }
  else if(style==='custom'){buildCustomMainSeq(w).forEach(s=>seq.push(s));}
  return seq;
}

function buildSequenceFor(w){
  const exercises=w.exercises||[], warmup=w.warmup||[], cooldown=w.cooldown||[], seq=[];
  warmup.forEach((ex,i)=>{
    if(i===0)seq.push({phase:'get-ready',label:'GET READY',name:'Warm-Up Starting',prop:'',duration:3});
    seq.push({phase:'warmup',label:'WARM-UP',name:ex.name,prop:ex.note||'',duration:secOf(ex.duration,30),round:i+1,totalRounds:warmup.length,_wuIdx:i});
    seq.push({phase:'rest',label:'NEXT',name:'',prop:'',duration:5});
  });
  seq.push({phase:'get-ready',label:'MAIN WORKOUT',name:'Get Ready!',prop:'',duration:5});
  buildMainSeq(w).forEach(s=>seq.push(s));
  const cb=w.coreBurner;
  if(cb&&cb.exercises&&cb.exercises.length){
    const rounds=Math.max(1,cb.rounds||1), work=cbWork(cb), rest=cbRest(cb);
    seq.push({phase:'get-ready',label:'🎯 CORE BURNER',
      name:cb.exercises.length+' core moves · '+work+'s on / '+rest+'s off',prop:'',duration:5});
    for(let r=0;r<rounds;r++){
      if(rounds>1) seq.push({phase:'get-ready',label:'CORE ROUND '+(r+1)+' OF '+rounds,name:'',prop:'',duration:4});
      cb.exercises.forEach((ex,i)=>{
        seq.push({phase:'work',label:'CORE BURNER',name:ex.name,prop:ex.propLabel,
          duration:work,round:r+1,totalRounds:rounds,_cbIdx:i});
        if(rest>0) seq.push({phase:'rest',label:'REST',name:'',prop:'',duration:rest});
      });
    }
  }
  if(cooldown.length>0){seq.push({phase:'get-ready',label:'COOL-DOWN',name:'Great Work!',prop:'',duration:5});cooldown.forEach((ex,i)=>{seq.push({phase:'cooldown',label:'STRETCH',name:ex.name,prop:ex.note||'',duration:secOf(ex.duration,30),round:i+1,totalRounds:cooldown.length,_cdIdx:i});seq.push({phase:'rest',label:'NEXT',name:'',prop:'',duration:5});});}
  // Attach coaching cues once, centrally — every style builder benefits without
  // each one having to remember to pass the field through.
  const cueByName = {};
  exercises.forEach(ex => { if (ex.cue) cueByName[ex.name] = ex.cue; });
  if (cb && cb.exercises) cb.exercises.forEach(ex => { if (ex.cue) cueByName[ex.name] = ex.cue; });
  seq.forEach(s => { if (s.phase === 'work' && cueByName[s.name]) s.cue = cueByName[s.name]; });
  return seq;
}

// ─── TIMER ENGINE ─────────────────────────────────────────────
function showTimerScreens(viewMode){
  state.viewMode=viewMode;
  buildSidebar();
  if(typeof syncClassQRButton==='function')syncClassQRButton();
  if(viewMode==='participant'){showScreen('participant-screen');}
  else{document.getElementById('timer-style-name').textContent=state.workout.styleCfg.icon+' '+state.workout.styleCfg.name;showScreen('timer-screen');}
}
function startTimerEngine(viewMode){
  const t=state.timer;
  // Never leave an old interval ticking under the new class.
  clearInterval(t.interval);t.isRunning=false;
  syncPlanTiming(state.workout);
  const seq=buildTimerSequence();
  if(!seq.length){showToast('This class has no intervals to run','error');return;}
  // Peeking at the plan mid-class used to throw the class back to the start.
  const canContinue=t.sequence&&t.sequence.length===seq.length&&t.workoutRef===state.workout&&
    !t._finished&&t.current>0&&t.current<seq.length;
  if(canContinue&&askConfirm('Carry on from interval '+(t.current+1)+' of '+seq.length+'?\n\nCancel starts the class again from the top.')){
    const secs=t.seconds;
    t.sequence=seq;t.totalSteps=seq.length;t.workoutRef=state.workout;
    showTimerScreens(viewMode);
    t._silentLoad=true;loadTimerStep(t.current);
    const step=seq[t.current];
    if(secs>0&&step&&secs<=step.duration){t.seconds=secs;updateTimerDisplay();}
    if(typeof MA!=='undefined'&&MA.enabled){if(viewMode==='participant'){injectMALiveUI();renderMAGroupBanner();}else injectMAInstructorUI();}
    toggleTimer();
    return;
  }
  resetTimerState();
  t.sequence=seq;t.current=0;t.totalSteps=seq.length;
  t.workoutRef=state.workout;
  showTimerScreens(viewMode);
  loadTimerStep(0);
  if(typeof MA!=='undefined'&&MA.enabled){if(viewMode==='participant'){injectMALiveUI();renderMAGroupBanner();}else injectMAInstructorUI();}
  toggleTimer();
}
function goLive(){
  startTimerEngine('participant');
  // Still inside the tap, which is what lets the share sheet (AirDrop) open.
  if(typeof ihPhoneHandoff==='function')ihPhoneHandoff();
}
function openInstructorView(){startTimerEngine('instructor');}
function buildSidebar(){const list=document.getElementById('sidebar-exercise-list');if(!list)return;list.innerHTML='';state.workout.exercises.forEach((ex,i)=>{const d=document.createElement('div');d.className='sidebar-ex';d.id='sidebar-ex-'+i;d.innerHTML='<span class="sidebar-num">'+(i+1)+'</span><span class="sidebar-name">'+escapeHtml(ex.name)+'</span><span class="sidebar-reps">'+escapeHtml(String(ex.reps))+'</span><button class="sidebar-swap" type="button" data-onclick="swapLive('+i+')" title="Swap this move" aria-label="Swap '+escapeHtml(ex.name)+'">⇄</button>';list.appendChild(d);});
  const cb=state.workout.coreBurner;
  if(cb&&cb.exercises&&cb.exercises.length){
    const hd=document.createElement('div');hd.className='sidebar-cb-head';hd.textContent='🎯 Core Burner';list.appendChild(hd);
    cb.exercises.forEach((ex,i)=>{const d=document.createElement('div');d.className='sidebar-ex sidebar-cb';d.id='sidebar-cb-'+i;d.innerHTML='<span class="sidebar-num">•</span><span class="sidebar-name">'+escapeHtml(ex.name)+'</span><span class="sidebar-reps">'+escapeHtml(String(cbWork(cb)))+'s</span>';list.appendChild(d);});
  }
}
// The next step anyone actually moves in (skips rests and "get ready" cards).
function nextWorkStep(seq,idx){
  for(let k=idx+1;k<seq.length;k++){const s=seq[k];if(s.phase==='work'||s.phase==='warmup'||s.phase==='cooldown')return s;}
  return null;
}
// What the room needs to know is coming: during a rest that is the next move
// and the kit to grab, not just the word "Rest".
function nextUpLabel(seq,idx){
  const step=seq[idx],next=seq[idx+1];if(!step||!next)return '';
  const nw=nextWorkStep(seq,idx);
  const nwTxt=nw&&nw.name?nw.name+(nw.phase==='work'&&nw.prop?' · '+nw.prop:''):'';
  if(step.phase!=='work'&&nwTxt)return nwTxt;
  if(next.phase==='rest')return '😮‍💨 Rest'+(nwTxt?' → '+nwTxt:'');
  return next.name||next.label||'';
}
function stepExercise(step){
  const w=state.workout;if(!w||!step||step._ladder)return null;
  if(step._cbIdx!=null)return ((w.coreBurner&&w.coreBurner.exercises)||[])[step._cbIdx]||null;
  if(step._exIdx!=null)return (w.exercises||[])[step._exIdx]||null;
  return null;
}
// Easier / harder options for the move being worked, or the one coming up.
function modsExerciseFor(seq,idx){
  const step=seq[idx];if(!step)return null;
  return stepExercise(step.phase==='work'?step:nextWorkStep(seq,idx));
}
function paintMods(el,ex){
  if(!el)return;
  const h=ex&&(ex.easier||ex.harder)
    ?(ex.easier?'<span class="mod-badge easier">↓ Easier: '+escapeHtml(ex.easier)+'</span>':'')+
     (ex.harder?'<span class="mod-badge harder">↑ Harder: '+escapeHtml(ex.harder)+'</span>':'')
    :'';
  el.innerHTML=h;el.style.display=h?'flex':'none';
}
function loadTimerStep(idx){
  const seq=state.timer.sequence||[];if(idx>=seq.length){finishWorkout();return;}
  if(idx<0)idx=0;
  const step=seq[idx];state.timer.seconds=step.duration;
  const quiet=state.timer._silentLoad;state.timer._silentLoad=false;
  if(!quiet){
    if(step.phase==='work')audioCue.startWork();else if(step.phase==='rest')audioCue.startRest();
  }
  if(typeof ihOnStep==='function')ihOnStep(step,seq[idx+1],idx,quiet);
  const phaseEl=document.getElementById('timer-phase');phaseEl.textContent=step.label;phaseEl.className='phase-label';
  if(step.phase==='work')phaseEl.classList.add('work');else if(step.phase==='rest')phaseEl.classList.add('rest');else if(step.phase==='warmup'||step.phase==='cooldown')phaseEl.classList.add('warmcool');else phaseEl.classList.add('get-ready');
  // YGIG: show both partner exercises
  if(step._ygig && step.phase==='work'){
    const ygigInfo=document.getElementById('ygig-partner-info');
    if(ygigInfo){
      ygigInfo.style.display='block';
      ygigInfo.innerHTML='<div class="ygig-timer-primary"><span class="ygig-timer-label">'+escapeHtml(step.label)+'</span><span class="ygig-timer-ex">'+escapeHtml(step.name)+'</span><span class="ygig-timer-reps">'+escapeHtml(String(step._ygig.reps))+' reps</span></div><div class="ygig-timer-rest"><span class="ygig-timer-label-rest">PARTNER — ACTIVE REST</span><span class="ygig-timer-ex-rest">'+escapeHtml(step._ygig.partner)+'</span><span class="ygig-timer-reps-rest">Hold until done</span></div>';
    }
    document.getElementById('timer-exercise').textContent=step.name||'';
  } else {
    const ygigInfo=document.getElementById('ygig-partner-info');
    if(ygigInfo) ygigInfo.style.display='none';
    document.getElementById('timer-exercise').textContent=step.name||'';
  }
  const ladderEl=document.getElementById('block-ladder');
  if(ladderEl){
    if(step._ladder){
      const rungs=step._rungs;
      ladderEl.style.display='block';
      ladderEl.innerHTML='<div class="hl-title">'+escapeHtml(step._paceNote||'')+'</div>'+
        (rungs?'<div class="hl-rungs">'+rungs.map((r,i)=>'<span class="hl-rung">'+escapeHtml(String(r))+'</span>'+
          (i<rungs.length-1?'<span class="hl-arrow">→</span>':'')).join('')+'</div>':'')+
        '<div class="hl-grid">'+step._ladder.map(l=>'<div class="hl-item">'+
          '<span class="hl-n">'+escapeHtml(String(l.n))+'</span>'+
          '<span class="hl-name">'+escapeHtml(l.name)+'</span>'+
          (rungs?'':'<span class="hl-reps">'+escapeHtml(String(l.reps))+'</span>')+'</div>').join('')+'</div>';
    } else { ladderEl.style.display='none'; ladderEl.innerHTML=''; }
  }
  const propEl=document.getElementById('timer-prop');propEl.textContent=step.prop||'';propEl.style.display=step.prop?'inline-block':'none';
  const cueEl=document.getElementById('timer-cue');
  if(cueEl){cueEl.textContent=step.cue?'💡 '+step.cue:'';cueEl.style.display=step.cue?'block':'none';}
  const arc=document.getElementById('timer-arc');arc.className='timer-progress';
  if(step.phase==='rest')arc.classList.add('rest-mode');else if(step.phase==='warmup'||step.phase==='cooldown')arc.classList.add('warmcool-mode');
  document.getElementById('current-round').textContent=step.round?'Round '+step.round:'';
  document.getElementById('total-rounds').textContent=step.totalRounds?'/ '+step.totalRounds:'';
  const next=seq[idx+1],nextBox=document.getElementById('next-up-box');
  if(next){document.getElementById('next-exercise').textContent=nextUpLabel(seq,idx);nextBox.style.display='flex';}else nextBox.style.display='none';
  paintMods(document.getElementById('timer-mods'),modsExerciseFor(seq,idx));
  updateTimerDisplay();updateOverallProgress(idx);loadParticipantStep(idx);
}
function loadParticipantStep(idx){
  const seq=state.timer.sequence||[];if(idx>=seq.length)return;const step=seq[idx];
  // Mixed ability draws its own three-zone exercise panel, but the shared
  // pieces below (ladder, clock, progress, time left) still have to update.
  const maOn=typeof MA!=='undefined'&&MA.enabled&&typeof renderLiveClassView==='function';
  if(maOn)renderLiveClassView(idx);
  const pPhase=document.getElementById('p-phase');if(!pPhase)return;
  if(!maOn){
    pPhase.textContent=step.label;pPhase.className='p-phase-label';
    if(step.phase==='work')pPhase.classList.add('work');else if(step.phase==='rest')pPhase.classList.add('rest');else pPhase.classList.add('neutral');
  }

  // Build the headline + sub-line first, then write once. (Previously the
  // 100-rep / YGIG text was overwritten by the generic assignment below.)
  let headline=step.name||'';
  const nu=nextUpLabel(seq,idx);
  let subline=nu?'Next: '+nu:'';
  if(step.phase==='work'&&step._paceNote){ subline=step._paceNote; }
  if(step.phase==='work'&&step._ygig){
    headline=step.name+' — '+step._ygig.reps+' reps';
    subline='Partner: '+step._ygig.partner+' (active rest)';
  }
  const pNext=document.getElementById('p-next');
  if(!maOn){
    document.getElementById('p-exercise').textContent=headline;
    if(pNext)pNext.textContent=subline;
    const pProp=document.getElementById('p-prop');pProp.textContent=step.prop||'';pProp.style.display=step.prop?'block':'none';
  } else if(pNext){
    if(step.phase==='work'&&(step._ygig||step._paceNote)) pNext.textContent=subline;
    else if(step.phase!=='work'&&nu) pNext.textContent='Next: '+nu;
  }
  paintMods(document.getElementById('p-mods'),maOn?null:modsExerciseFor(seq,idx));
  const pLad=document.getElementById('p-ladder');
  if(pLad){
    // With mixed ability on, the shared ladder/rungs sit above the level
    // panels so everyone sees the class shape before their own move.
    const zones=document.getElementById('ma-live-zones'), timerC=document.getElementById('p-timer-circle');
    try{
      if(maOn&&step._ladder&&zones&&zones.parentNode&&pLad.nextSibling!==zones) zones.parentNode.insertBefore(pLad,zones);
      else if(!maOn&&timerC&&timerC.parentNode&&timerC.nextSibling!==pLad) timerC.parentNode.insertBefore(pLad,timerC.nextSibling);
    }catch(e){}
    if(step._ladder){
      const rungs=step._rungs;
      pLad.style.display='block';
      pLad.innerHTML=(rungs?'<div class="pl-rungs">'+rungs.map((r,i)=>'<span class="pl-rung">'+escapeHtml(String(r))+'</span>'+
          (i<rungs.length-1?'<span class="pl-arrow">→</span>':'')).join('')+'</div>':'')+
        '<div class="pl-grid">'+step._ladder.map(l=>'<div class="pl-item">'+
          '<span class="pl-n">'+escapeHtml(String(l.n))+'</span>'+
          '<span class="pl-name">'+escapeHtml(l.name)+'</span>'+
          (rungs?'':'<span class="pl-reps">'+escapeHtml(String(l.reps))+'</span>')+'</div>').join('')+'</div>';
    } else { pLad.style.display='none'; pLad.innerHTML=''; }
  }
  const pDisp=document.getElementById('p-timer');
  if(pDisp)pDisp.textContent=step.duration>=60
    ?Math.floor(step.duration/60)+':'+String(step.duration%60).padStart(2,'0')
    :String(step.duration).padStart(2,'0');
  const pUnitEl=document.getElementById('p-timer-unit');if(pUnitEl)pUnitEl.textContent=step.duration>=60?'remaining':'seconds';
  updateOverallProgress(idx);
}
// ─── AUDIO CUES ───────────────────────────────────────────────
// Synthesised with WebAudio — no asset files, works offline.
// ─── AUDIO CUES ───────────────────────────────────────────────
// Two different audiences, two different sensible defaults. The instructor's
// laptop is the room's cue, so it starts ON. A phone starts OFF — a dozen
// handsets beeping a half-second out of sync is worse than silence — and the
// athlete turns it on if they want it. Separate keys so one never overrides
// the other when an instructor also opens a class link on her own machine.
function soundIsAthlete(){
  return !!(window.__ATHLETE_MODE || /[#&]c=/.test(location.hash || ''));
}
function soundKey(){ return soundIsAthlete() ? 'hiit_sound_athlete' : 'hiit_sound'; }
function soundEnabled(){
  let v = null;
  v = IHStore.get(soundKey());
  if (v === 'on')  return true;
  if (v === 'off') return false;
  return !soundIsAthlete();
}

const audioCue = {
  // A getter, because __ATHLETE_MODE is not known when this file parses.
  get enabled() { return soundEnabled(); },
  set enabled(v) { IHStore.set(soundKey(), v ? 'on' : 'off'); },
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
  // Higher pitch for the last three seconds before a work interval, so the
  // room can tell "go is coming" from "rest is coming" without looking.
  preWork()    { this.beep(880, 120, 0.18); },
  startWork()  { this.beep(990, 220, 0.22); },
  startRest()  { this.beep(440, 220, 0.18); },
  finish()     { [523,659,784].forEach((f,i)=>setTimeout(()=>this.beep(f,260,0.22), i*180)); },
};
function toggleSound(){
  const on = !audioCue.enabled;
  audioCue.enabled = on;
  syncSoundButtons();
  // Unlocking WebAudio has to happen inside the tap itself, or iOS keeps the
  // context suspended and every later cue is silently dropped.
  if (on) { audioCue.ensure(); audioCue.beep(880, 120); }
  showToast(on ? '🔊 Sound on' : '🔇 Sound off');
}
/** Keeps every sound button on screen showing the true state. */
function syncSoundButtons(){
  const on = audioCue.enabled;
  document.querySelectorAll('.sound-toggle-btn').forEach(b => {
    b.textContent = on ? '🔊' : '🔇';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'Sound on — tap to mute' : 'Sound off — tap for audio cues';
    b.classList.toggle('is-muted', !on);
  });
}

function updateTimerDisplay(){
  const s=state.timer.seconds;
  // A whole-block countdown runs for many minutes, so raw seconds ("1980")
  // are unreadable across a room. Switch to m:ss once past a minute.
  const txt=s>=60?Math.floor(s/60)+':'+String(s%60).padStart(2,'0'):String(s).padStart(2,'0');
  const unit=s>=60?'remaining':'seconds';
  document.getElementById('timer-display').textContent=txt;
  const tUnit=document.getElementById('timer-unit');if(tUnit)tUnit.textContent=unit;
  const step=state.timer.sequence[state.timer.current],total=step?step.duration:1;
  document.getElementById('timer-arc').style.strokeDashoffset=CIRCUMFERENCE*(1-s/total);
  const pDisp=document.getElementById('p-timer');if(pDisp)pDisp.textContent=txt;
  const pUnit=document.getElementById('p-timer-unit');if(pUnit)pUnit.textContent=unit;
  const pCircle=document.getElementById('p-timer-circle');
  if(pCircle&&step){pCircle.className='p-timer-circle';if(step.phase==='rest')pCircle.classList.add('rest');else if(step.phase==='warmup'||step.phase==='cooldown')pCircle.classList.add('warmcool');}
  updateOverallProgress(state.timer.current);
}
function fmtClock(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
// Seconds still to run from the start of each step, cached per sequence.
let _sufSeq=null,_suf=[0];
function seqSuffix(seq){
  if(_sufSeq!==seq||_suf.length!==seq.length+1){
    _suf=new Array(seq.length+1);_suf[seq.length]=0;
    for(let k=seq.length-1;k>=0;k--)_suf[k]=_suf[k+1]+(Number(seq[k].duration)||0);
    _sufSeq=seq;
  }
  return _suf;
}
/** Whole seconds left in the class, counting the part of the current step still to run. */
function classTimeLeft(){
  const t=state.timer,seq=t.sequence||[];if(!seq.length)return 0;
  const i=Math.max(0,Math.min(t.current||0,seq.length));
  if(i>=seq.length)return 0;
  const suf=seqSuffix(seq);
  return suf[i+1]+Math.max(0,Math.min(seq[i].duration,t.seconds||0));
}
// Progress by time, not by interval count: a 30-minute AMRAP is one interval
// and a Tabata block is sixteen, so counting steps told nobody anything.
function updateOverallProgress(idx){
  const t=state.timer,seq=t.sequence||[];if(!seq.length)return;
  const total=seqSuffix(seq)[0]||1;
  const left=classTimeLeft();
  const pct=Math.max(0,Math.min(100,(1-left/total)*100));
  const n=Math.min(seq.length,(idx==null?t.current:idx)+1);
  const bar=document.getElementById('overall-progress');if(bar)bar.style.width=pct+'%';
  const lbl=document.getElementById('progress-label');
  if(lbl)lbl.textContent='Interval '+n+' of '+seq.length+' · '+fmtClock(left)+' left in class';
  const pProg=document.getElementById('p-overall-progress');if(pProg)pProg.style.width=pct+'%';
  const pLeft=document.getElementById('p-time-left');if(pLeft)pLeft.textContent=fmtClock(left)+' left in class';
}
function toggleTimer(){
  const t=state.timer;
  if(t.isRunning){
    clearInterval(t.interval);t.isRunning=false;
    // Keep the exact remainder, not the rounded-up whole second, so a
    // pause/resume never gives the room extra time.
    t.remainingMs=Math.max(0,(t.deadline||0)-Date.now());
    t._pausedAt={current:t.current,seconds:t.seconds};
    persistLiveSession();releaseWakeLock();
    document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='▶';});
  } else {
    // The class is over (or was never built): the button must not replay
    // the finish and log the class a second time.
    if(t._finished||!t.sequence||!t.sequence.length){
      showToast('Class finished — press Go Live to run it again');
      return;
    }
    if(t.current>=t.sequence.length){finishWorkout();return;}
    t.isRunning=true;
    if(t._started&&typeof offerResyncLink==='function')offerResyncLink();
    t._started=true;
    audioCue.ensure(); // unlock WebAudio inside the user gesture
    requestWakeLock(); // must also be inside the gesture to be granted
    document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='⏸';});
    // Deadline-based so the clock can't drift on a long class or a
    // backgrounded tab the way a naive 1000ms decrement does.
    // Recover the duration from the current step if a caller painted the
    // screen without loading it, otherwise the first tick sees 0 remaining
    // and the clock never starts.
    if(!t.seconds){const st=t.sequence[t.current];if(st)t.seconds=st.duration;}
    const p=t._pausedAt;
    const exact=p&&p.current===t.current&&p.seconds===t.seconds&&t.remainingMs>0&&t.remainingMs<=t.seconds*1000;
    t.deadline=Date.now()+(exact?t.remainingMs:t.seconds*1000);
    t.remainingMs=0;t._pausedAt=null;
    t.lastWhole=t.seconds;
    t._lastPersist=Date.now();
    clearInterval(t.interval);
    t.interval=setInterval(timerTick,200);
  }
}
/**
 * One clock tick. The deadline of the next step is the previous deadline plus
 * its duration, never "now plus duration", so a late tick cannot make every
 * interval a little longer. If the tab slept through several steps (a locked
 * phone, a throttled background tab) the loop catches up to where the class
 * really is instead of resuming one step late.
 */
function timerTick(){
  const t=state.timer;
  if(!t.isRunning)return;
  const now=Date.now();
  const remaining=Math.ceil((t.deadline-now)/1000);
  if(remaining>0){
    if(now-(t._lastPersist||0)>=5000){t._lastPersist=now;persistLiveSession();}
    if(remaining===t.lastWhole)return;
    t.lastWhole=remaining;t.seconds=remaining;
    const step=t.sequence[t.current],next=t.sequence[t.current+1];
    let spoke=false;
    try{spoke=typeof ihOnTick==='function'&&ihOnTick(remaining,step,next,t.current)===true;}catch(e){}
    if(remaining<=3&&!spoke){
      if(step&&step.phase!=='work'&&next&&next.phase==='work')audioCue.preWork();else audioCue.countdown();
    }
    updateTimerDisplay();
    return;
  }
  let guard=0;
  while(t.deadline<=now&&guard++<2000){
    t.current++;
    if(t.current>=t.sequence.length){loadTimerStep(t.current);return;}
    t.deadline+=t.sequence[t.current].duration*1000;
  }
  loadTimerStep(t.current);
  if(!t.isRunning)return;
  t.seconds=Math.max(1,Math.ceil((t.deadline-now)/1000));
  t.lastWhole=t.seconds;
  updateTimerDisplay();
  t._lastPersist=now;
  persistLiveSession(); // checkpoint on every interval boundary
}
function stopTimer(){
  const t=state.timer;
  if(t.isRunning){t.remainingMs=Math.max(0,(t.deadline||0)-Date.now());t._pausedAt={current:t.current,seconds:t.seconds};}
  clearInterval(t.interval);t.isRunning=false;persistLiveSession();releaseWakeLock();
  document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='▶';});
}
// Jump to another interval, keeping the clock running only if it already was.
// (⏭/⏮ used to start a paused class, and ⏭ on the last step did nothing.)
function jumpToStep(idx){
  const t=state.timer;if(!t.sequence||!t.sequence.length||t._finished)return;
  const wasRunning=t.isRunning;
  clearInterval(t.interval);t.isRunning=false;
  t.remainingMs=0;t._pausedAt=null;
  if(idx>=t.sequence.length){t.current=t.sequence.length;finishWorkout();return;}
  t.current=Math.max(0,idx);
  loadTimerStep(t.current);
  if(wasRunning)toggleTimer();
  else{persistLiveSession();document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='▶';});}
}
function nextExercise(){jumpToStep(state.timer.current+1);}
function prevExercise(){jumpToStep(state.timer.current-1);}
/** Skips every remaining interval of the current exercise (and the rests between them). */
function skipExercise(){
  const t=state.timer,seq=t.sequence||[];if(!seq.length||t._finished)return;
  const key=s=>s?(s._ladder?'L':(s._exIdx!=null?'e'+s._exIdx:(s._cbIdx!=null?'c'+s._cbIdx:(s._wuIdx!=null?'w'+s._wuIdx:(s._cdIdx!=null?'d'+s._cdIdx:null))))):null;
  // During a rest the "current exercise" is the one about to start.
  let i=t.current,cur=key(seq[i]);
  if(!cur){const nw=seq.findIndex((s,k)=>k>i&&key(s));if(nw<0){jumpToStep(seq.length);return;}i=nw;cur=key(seq[nw]);}
  let j=i+1;
  while(j<seq.length){const k=key(seq[j]);if(k&&k!==cur)break;if(seq[j].phase==='get-ready')break;j++;}
  // Land on the change-over before the next move rather than its first second.
  while(j>i+1&&seq[j-1].phase==='rest'&&!key(seq[j-1])&&j-1>t.current)j--;
  const name=seq[i].name||'that move';
  jumpToStep(j);
  if(j<seq.length)showToast('⏩ Skipped '+name);
}

// ─── LIVE SESSION PERSISTENCE ─────────────────────────────────
// A dropped phone or an accidental refresh mid-class used to lose
// everything. The running class is now checkpointed to localStorage
// so it can be resumed exactly where it left off.
// Scoped to the instructor too: two people mid-class on one laptop were
// overwriting each other's checkpoint, and the first to finish wiped the
// other's only crash-recovery.
const LIVE_KEY_BASE='hiit_live_session';
function liveKey(){return personalKey(LIVE_KEY_BASE);}
function persistLiveSession(){
  if(!state.workout||!state.timer.sequence.length)return;
  // Storage full or blocked never breaks the class — IHStore falls back to
  // memory, which still survives a same-tab refresh of the timer screen.
  IHStore.setJSON(liveKey(),{
    savedAt:Date.now(),
    workout:state.workout,
    muscle:state.muscle,
    viewMode:state.viewMode,
    current:state.timer.current,
    seconds:state.timer.seconds,
    totalSteps:state.timer.totalSteps,
    ma:(typeof MA!=='undefined'&&MA.enabled)?{enabled:true,groups:MA.groups,assignments:MA.assignments||null}:null,
  });
}
function clearLiveSession(){IHStore.remove(liveKey());}
function readLiveSession(){
  const s=IHStore.getJSON(liveKey(),null);
  // Anything older than 4 hours is a stale class, not a refresh.
  if(!s||!s.workout||Date.now()-s.savedAt>4*60*60*1000){clearLiveSession();return null;}
  return s;
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
function resumeLiveSession(s,opts){
  const t=state.timer;
  clearInterval(t.interval);t.isRunning=false;
  // A copy, so editing the plan later never rewrites the stored checkpoint
  // (or a saved class that shares the same object).
  state.workout=cloneWorkout(s.workout);
  syncPlanTiming(state.workout);
  state.muscle=s.muscle||state.muscle;
  renderMuscleFocus();
  if(s.ma&&typeof MA!=='undefined'){MA.enabled=true;MA.groups=s.ma.groups||MA.groups;if(s.ma.assignments)MA.assignments=s.ma.assignments;}
  resetTimerState();
  const seq=buildTimerSequence();
  t.sequence=seq;
  t.totalSteps=seq.length;
  t.workoutRef=state.workout;
  t.current=Math.max(0,Math.min(s.current||0,seq.length-1));
  // A class that had already been under way counts as started, so the next
  // ▶ offers the resync link instead of acting like a fresh start.
  t._started=(s.current||0)>0||(s.seconds>0&&seq[t.current]&&s.seconds<seq[t.current].duration);
  state.viewMode=s.viewMode||'instructor';
  if(!seq.length){showToast('That class has no intervals to run','error');return;}
  buildSidebar();
  t._silentLoad=true;
  if(state.viewMode==='participant'){
    showScreen('participant-screen');loadTimerStep(t.current);
    if(typeof MA!=='undefined'&&MA.enabled){injectMALiveUI();renderMAGroupBanner();}
  } else {
    document.getElementById('timer-style-name').textContent=state.workout.styleCfg.icon+' '+state.workout.styleCfg.name;
    showScreen('timer-screen');loadTimerStep(t.current);
    if(typeof MA!=='undefined'&&MA.enabled)injectMAInstructorUI();
  }
  // Restore the exact second they were on, then wait for the instructor to hit play.
  if(s.seconds>0&&seq[t.current]&&s.seconds<=seq[t.current].duration)t.seconds=s.seconds;
  document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='▶';});
  updateTimerDisplay();
  if(!(opts&&opts.silent))showToast('▶ Resumed at interval '+(t.current+1)+' — press play when ready');
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
  // A phone that locks or a tab that is swapped away may never come back
  // (iOS kills it), so checkpoint the moment it is hidden, not only on unload.
  const persistIfLive=()=>{ if(state.timer.sequence&&state.timer.sequence.length&&!state.timer._finished)persistLiveSession(); };
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){persistIfLive();return;}
    if(document.visibilityState==='visible'&&state.timer.isRunning){requestWakeLock();timerTick();}
  });
  window.addEventListener('pagehide',persistIfLive);
  window.addEventListener('beforeunload',persistIfLive);
}

function finishWorkout(){
  const t=state.timer;
  const firstTime=!t._logged;
  clearInterval(t.interval);t.isRunning=false;releaseWakeLock();
  if(firstTime){logWorkoutComplete();audioCue.finish();}
  clearLiveSession();
  // The class is over: drop the sequence so nothing (the ▶ button, the phone
  // link's class clock) treats it as still running, but remember that it
  // finished and was logged.
  resetTimerState();
  t._finished=true;t._logged=true;
  if(firstTime&&typeof ihShowSummary==='function')ihShowSummary();
  document.getElementById('timer-exercise').textContent='🎉 Workout Complete!';
  document.getElementById('timer-phase').textContent='DONE';document.getElementById('timer-phase').className='phase-label get-ready';
  document.getElementById('timer-display').textContent='✓';
  document.getElementById('overall-progress').style.width='100%';
  document.getElementById('progress-label').textContent='Workout complete! Great job! 🔥';
  document.getElementById('next-up-box').style.display='none';
  ['timer-mods','p-mods'].forEach(id=>{const el=document.getElementById(id);if(el){el.style.display='none';el.innerHTML='';}});
  const pProg=document.getElementById('p-overall-progress');if(pProg)pProg.style.width='100%';
  const pLeft=document.getElementById('p-time-left');if(pLeft)pLeft.textContent='';
  document.querySelectorAll('#play-pause-btn,#p-play-pause').forEach(b=>{if(b)b.textContent='▶';});
  const pPhase=document.getElementById('p-phase');if(pPhase){pPhase.textContent='DONE! 🎉';pPhase.className='p-phase-label neutral';}
  const pEx=document.getElementById('p-exercise');if(pEx)pEx.textContent='Amazing Work!';
  const pNext=document.getElementById('p-next');if(pNext)pNext.textContent='';
}
/** Ends the class early (or on time) and logs it once. */
function endClassAndLog(){
  const t=state.timer;
  if(t._finished){showToast('This class is already logged');return;}
  if(!t.sequence||!t.sequence.length){showToast('No class is running');return;}
  if(!askConfirm('End the class now and log it as taught?'))return;
  finishWorkout();
  showToast('🏁 Class ended and logged');
}

// MA banner helper
function renderMAGroupBanner() {
  const banner=document.getElementById('ma-group-banner'); if(!banner)return;
  if(typeof MA==='undefined'){banner.style.display='none';return;}
  const activeGroups=MA.groups.filter(g=>g.count>0);
  if(!activeGroups.length){banner.style.display='none';return;}
  banner.style.display='flex';
  banner.innerHTML=activeGroups.map(g=>`<div class="ma-banner-chip ma-banner-${escapeHtml(g.color)}">${escapeHtml(g.icon)} <b>${escapeHtml(g.label)}</b> · ${escapeHtml(g.count)} people${g.names?`<span class="ma-banner-names">${escapeHtml(g.names)}</span>`:''}</div>`).join('');
}

// MA tiered PDF (called from exportPDF when MA enabled)
function exportTieredPDF() {
  if(!state.workout)return;
  const {styleCfg,exercises,warmup,cooldown,diff}=state.workout;
  let html=`<html><head><style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{color:#ff4d00}table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#f0f0f0;text-align:left;padding:7px;font-size:12px}td{padding:7px;border-bottom:1px solid #eee;font-size:12px}.section{margin:18px 0 6px;font-size:15px;font-weight:bold;border-bottom:2px solid #ff4d00;padding-bottom:3px}.footer{margin-top:28px;font-size:10px;color:#999;text-align:center}</style></head><body>
  <h1>Inspire Habits Class — Mixed Ability</h1>
  <p style="color:#666;font-size:13px">Style: <b>${escapeHtml(styleCfg.name)}</b> | Focus: <b>${escapeHtml(muscleFocus(state.muscle).label)}</b> | Duration: <b>${escapeHtml(state.workout.duration)} min</b> (planned ${fmtMinSec(classSeconds(state.workout))}) | Participants: <b>${escapeHtml(state.workout.participants)}</b> | Date: <b>${new Date().toLocaleDateString()}</b></p>`;
  if(typeof buildTieredPDFSection==='function') html+=buildTieredPDFSection(exercises);
  html+=buildCoveragePDFSection(exercises, state.workout.muscle||state.muscle);
  if(warmup.length>0){html+=`<div class="section">🔥 Warm-Up</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>`;warmup.forEach((ex,i)=>{html+=`<tr><td>${i+1}</td><td>${escapeHtml(ex.name)}</td><td>${secOf(ex.duration,30)}s</td><td>${escapeHtml(ex.note||'')}</td></tr>`;});html+=`</table>`;}
  if(cooldown.length>0){html+=`<div class="section">❄️ Cool-Down</div><table><tr><th>#</th><th>Exercise</th><th>Duration</th><th>Notes</th></tr>`;cooldown.forEach((ex,i)=>{html+=`<tr><td>${i+1}</td><td>${escapeHtml(ex.name)}</td><td>${secOf(ex.duration,30)}s</td><td>${escapeHtml(ex.note||'')}</td></tr>`;});html+=`</table>`;}
  html+=`<div class="footer">Generated by Inspire Habits · ${new Date().toLocaleString()}</div></body></html>`;
  const win=window.open('','_blank');
  if(!win){showToast('Pop-ups are blocked — allow them to print','error');return;}
  win.document.write(html); win.document.close(); win.print();
}

// YGIG time control
function applyYgigWorkSec(v){
  state.ygigWorkSec = v;
  if (state.workout && state.workout.style==='ygig') {
    state.workout.ygigWorkSec = v;
    state.workout.exercises.forEach(ex => { ex.seconds = v; });
    state.workout._edited = true;
    syncPlanTiming(state.workout);
    renderPlanEditor();
  }
}
function selectYgigTime(btn) {
  document.querySelectorAll('.ygig-time-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  applyYgigWorkSec(parseInt(btn.dataset.sec,10)||45);
}
function setCustomYgigTime(val) {
  const v = Math.min(120, Math.max(15, parseInt(val,10)||45));
  document.querySelectorAll('.ygig-time-btn').forEach(b=>b.classList.remove('active'));
  applyYgigWorkSec(v);
}

// Navigation
function classInProgress(){
  const t=state.timer;
  return !!(t.sequence&&t.sequence.length&&t._started&&!t._finished);
}
function goBack(){
  const onClass=['timer-screen','participant-screen'].some(id=>{const el=document.getElementById(id);return el&&el.classList.contains('active');});
  if(onClass&&classInProgress()&&!askConfirm('Leave the class? The timer stops and the class is not logged.\n\nUse 🏁 End class & log to record it.'))return;
  stopTimer();
  if(onClass){clearLiveSession();resetTimerState();}
  showScreen('setup-screen');
}
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
  renderMuscleFocus();
  syncSoundButtons();
  const scf=document.getElementById('save-class-form');
  if(scf)scf.addEventListener('submit',e=>{
    e.preventDefault();
    const input=document.getElementById('save-class-name');
    saveWorkout(input?input.value:'');
    closeSaveClassModal();
  });
  startInstructorSitting();
});

// Nothing personal is read until we know whose it is. Everything that used
// to run straight from DOMContentLoaded now waits behind the name picker.
function beginInstructorSession(id){
  setCurrentInstructorId(id);
  migrateLegacyPersonalData();
  migrateHistoryToStudio();
  if(typeof profileState!=='undefined'){
    profileState.activeProfile=id;
    IHStore.set('hiit_active_profile',id);
  }
  loadPersonalData();
  if(typeof Roster!=='undefined'&&Roster.load)Roster.load();
  if(typeof renderProfileSwitcher==='function')renderProfileSwitcher();
  if(typeof updateProfileBadge==='function')updateProfileBadge();
  // Resume only after the lists are the right person's, so the bar can't
  // offer a class belonging to whoever taught before them.
  setTimeout(offerSessionResume,350);
}
function startInstructorSitting(){
  const already=currentInstructorId();
  if(already){beginInstructorSession(already);return;}
  // If profiles.js failed to load, fall back to the shared keys rather than
  // locking an instructor out of their own app.
  if(typeof ihNeedsInstructorPick!=='function'||typeof ihMountInstructorPicker!=='function'){
    loadPersonalData();
    setTimeout(offerSessionResume,350);
    return;
  }
  if(!ihNeedsInstructorPick()){
    loadPersonalData();
    setTimeout(offerSessionResume,350);
    return;
  }
  ihMountInstructorPicker(beginInstructorSession);
}
