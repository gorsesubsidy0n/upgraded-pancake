// ============================================================
//  INSPIRE HABITS — muscle-map.js
//  Canonical muscle taxonomy + resolver.
//
//  Every exercise in the database carries a free-text `muscle`
//  label ("Quadriceps / Glutes", "Deltoids / Triceps", ...).
//  This module turns that text into a structured, machine-usable
//  muscle signature so the generator can guarantee coverage:
//
//     { primary: ['quads'], secondary: ['glutes'], tertiary: [...] }
//
//  Convention: in the source label the FIRST segment is the prime
//  mover, later segments are assistors. Tertiary muscles are the
//  anatomically-implied assistors (a push-up always taxes triceps).
//  Only primary + secondary can "cover" a major group — tertiary
//  contributes variety credit only, so coverage stays honest.
// ============================================================

// ── CANONICAL MUSCLE GROUPS ───────────────────────────────────
// tier:   'major' = must be hit in a full-body class
//         'minor' = accessory; rotated based on recent class history
// region: used to scope coverage when the class is not full-body
const MUSCLE_GROUPS = {
  // ---- MAJOR ----
  chest:      { id:'chest',      label:'Chest',        short:'Chest',    icon:'🫀', tier:'major', region:'upper', pattern:'push' },
  back:       { id:'back',       label:'Back / Lats',  short:'Back',     icon:'🦅', tier:'major', region:'upper', pattern:'pull' },
  shoulders:  { id:'shoulders',  label:'Shoulders',    short:'Delts',    icon:'🪖', tier:'major', region:'upper', pattern:'push' },
  quads:      { id:'quads',      label:'Quads',        short:'Quads',    icon:'🦵', tier:'major', region:'lower', pattern:'squat' },
  hamstrings: { id:'hamstrings', label:'Hamstrings',   short:'Hams',     icon:'🔗', tier:'major', region:'lower', pattern:'hinge' },
  glutes:     { id:'glutes',     label:'Glutes',       short:'Glutes',   icon:'🍑', tier:'major', region:'lower', pattern:'hinge' },
  core:       { id:'core',       label:'Core / Abs',   short:'Core',     icon:'🎯', tier:'major', region:'core',  pattern:'brace' },

  // ---- MINOR / ACCESSORY ----
  biceps:     { id:'biceps',     label:'Biceps',           short:'Biceps',  icon:'💪', tier:'minor', region:'upper', pattern:'pull' },
  triceps:    { id:'triceps',    label:'Triceps',          short:'Tris',    icon:'🔨', tier:'minor', region:'upper', pattern:'push' },
  reardelts:  { id:'reardelts',  label:'Rear Delts / Traps', short:'Rear',  icon:'🪶', tier:'minor', region:'upper', pattern:'pull' },
  forearms:   { id:'forearms',   label:'Forearms / Grip',  short:'Grip',    icon:'🤏', tier:'minor', region:'upper', pattern:'carry' },
  calves:     { id:'calves',     label:'Calves',           short:'Calves',  icon:'🦶', tier:'minor', region:'lower', pattern:'push' },
  adductors:  { id:'adductors',  label:'Adductors',        short:'Adds',    icon:'↔️', tier:'minor', region:'lower', pattern:'lateral' },
  abductors:  { id:'abductors',  label:'Glute Med / Abductors', short:'Abd', icon:'🧲', tier:'minor', region:'lower', pattern:'lateral' },
  hipflexors: { id:'hipflexors', label:'Hip Flexors',      short:'Hip Flex',icon:'🚴', tier:'minor', region:'core',  pattern:'flex' },
  obliques:   { id:'obliques',   label:'Obliques',         short:'Obliques',icon:'🌀', tier:'minor', region:'core',  pattern:'rotate' },
  lowerback:  { id:'lowerback',  label:'Lower Back / Erectors', short:'Erectors', icon:'🏛️', tier:'minor', region:'core', pattern:'extend' },
};

const MAJOR_IDS = Object.values(MUSCLE_GROUPS).filter(m => m.tier === 'major').map(m => m.id);
const MINOR_IDS = Object.values(MUSCLE_GROUPS).filter(m => m.tier === 'minor').map(m => m.id);

// ── FOCUS → REQUIRED COVERAGE CONTRACT ────────────────────────
// `requiredMajors` is the hard guarantee for a generated class.
// `minorPool` is the rotating accessory set for that focus.
const FOCUS_CONTRACT = {
  full:   { requiredMajors:['chest','back','shoulders','quads','hamstrings','glutes','core'],
            minorPool:['biceps','triceps','reardelts','calves','adductors','abductors','obliques','lowerback','forearms','hipflexors'],
            minorTargets:4, wantConditioning:true },
  upper:  { requiredMajors:['chest','back','shoulders'],
            minorPool:['biceps','triceps','reardelts','forearms','core'],
            minorTargets:3, wantConditioning:false },
  lower:  { requiredMajors:['quads','hamstrings','glutes'],
            minorPool:['calves','adductors','abductors','lowerback'],
            minorTargets:3, wantConditioning:false },
  core:   { requiredMajors:['core'],
            minorPool:['obliques','hipflexors','lowerback','abductors'],
            minorTargets:3, wantConditioning:false },
  cardio: { requiredMajors:['quads','glutes','core'],
            minorPool:['calves','abductors','adductors','hipflexors','obliques'],
            minorTargets:3, wantConditioning:true },
  push:   { requiredMajors:['chest','shoulders'],
            minorPool:['triceps','core','forearms'],
            minorTargets:2, wantConditioning:false },
  pull:   { requiredMajors:['back'],
            minorPool:['biceps','reardelts','forearms','lowerback'],
            minorTargets:3, wantConditioning:false },
  glutes: { requiredMajors:['glutes','hamstrings'],
            minorPool:['abductors','adductors','lowerback','calves'],
            minorTargets:3, wantConditioning:false },
};

function getFocusContract(muscleKey) {
  return FOCUS_CONTRACT[muscleKey] || FOCUS_CONTRACT.full;
}

// ── TEXT → MUSCLE ID RULES ────────────────────────────────────
// Ordered: first match on a segment wins. Longest/most specific first.
const MUSCLE_TOKEN_RULES = [
  [/gluteus\s*medius|glute\s*med|\btfl\b|hip\s*abduct|abductor/i, ['abductors']],
  [/gluteus\s*maximus|glute/i,                                    ['glutes']],
  [/hamstring/i,                                                  ['hamstrings']],
  [/quadricep|\bquads?\b/i,                                       ['quads']],
  [/adductor/i,                                                   ['adductors']],
  [/gastrocnemius|soleus|calf|calves/i,                           ['calves']],
  [/pectoral|\bchest\b|\bpecs?\b/i,                               ['chest']],
  [/\blats?\b|latissimus|rhomboid|\bback\b(?!\s*extension)/i,     ['back']],
  [/rear\s*delt|trapezius|\btraps?\b/i,                           ['reardelts']],
  [/rotator\s*cuff|infraspinatus|teres\s*minor/i,                 ['reardelts']],
  [/serratus/i,                                                   ['shoulders']],
  [/deltoid|shoulder/i,                                           ['shoulders']],
  [/tricep/i,                                                     ['triceps']],
  [/bicep|brachialis|brachioradialis/i,                           ['biceps']],
  [/forearm|grip/i,                                               ['forearms']],
  [/oblique/i,                                                    ['obliques']],
  [/hip\s*flexor/i,                                               ['hipflexors']],
  [/erector\s*spinae|lower\s*back|spinal\s*erector/i,             ['lowerback']],
  [/rectus\s*abdominis|transvers|lower\s*abdominal|\bcore\b|\babs?\b|anti-extension|anti-rotation/i, ['core']],
  [/full\s*body/i,                                                ['__full__']],
];

// A "Full Body" label expands into a compound movement signature.
const FULL_BODY_SIGNATURE = {
  primary:   ['quads','glutes','shoulders','core'],
  secondary: ['chest','back','hamstrings'],
};

// Anatomically-implied assistors. Contribute variety credit only —
// they never satisfy a required-major guarantee on their own.
const IMPLIED_ASSISTORS = {
  chest:      ['triceps','shoulders'],
  shoulders:  ['triceps'],
  back:       ['biceps','reardelts','forearms'],
  biceps:     ['forearms'],
  triceps:    ['shoulders'],
  quads:      ['glutes','calves'],
  hamstrings: ['glutes','lowerback'],
  glutes:     ['hamstrings','abductors'],
  core:       ['obliques','hipflexors'],
  obliques:   ['core'],
  lowerback:  ['glutes'],
};

// Exercises whose free-text label under-describes what they train.
// Keys are exact exercise names.
const EXERCISE_MUSCLE_OVERRIDES = {
  'Bench Dip':                    { primary:['triceps'],   secondary:['chest','shoulders'] },
  'Dumbbell Suitcase Carry':      { primary:['core'],      secondary:['obliques','forearms','shoulders'] },
  'Dumbbell Renegade Row':        { primary:['back'],      secondary:['core','biceps','chest'] },
  'Mini Band Pull-Apart':         { primary:['reardelts'], secondary:['back','shoulders'] },
  // Rhomboids/scapular retraction — this is the mid-back prime mover, rear delts assist.
  // Also the only true "pull" the bodyweight-only pool has, so the classification matters.
  'Reverse Snow Angel':           { primary:['back'],      secondary:['reardelts','lowerback'] },
  'Superman Hold':                { primary:['lowerback'], secondary:['glutes','back'] },
  'Bear Crawl':                   { primary:['core'],      secondary:['shoulders','quads','chest'] },
  'Bear Crawl (Short)':           { primary:['core'],      secondary:['shoulders','quads'] },
  'Burpee':                       { primary:['quads','chest'], secondary:['core','shoulders','glutes'] },
  'Squat Thrust':                 { primary:['quads','core'],  secondary:['shoulders','glutes'] },
  'Inchworm':                     { primary:['hamstrings','core'], secondary:['shoulders','chest'] },
  'Slider Inchworm':              { primary:['hamstrings','core'], secondary:['shoulders','chest'] },
  'Jumping Jack':                 { primary:['calves'],    secondary:['shoulders','abductors'] },
  'Skater Jump':                  { primary:['abductors'], secondary:['glutes','quads','calves'] },
  'High Knee':                    { primary:['hipflexors'],secondary:['calves','core'] },
  'Ankle Weight Standing March':  { primary:['hipflexors'],secondary:['calves','core'] },
  'Dumbbell Thruster':            { primary:['quads','shoulders'], secondary:['glutes','core','triceps'] },
  'Med Ball Thruster':            { primary:['quads','shoulders'], secondary:['glutes','core'] },
  'Slam Ball Thruster':           { primary:['quads','shoulders'], secondary:['glutes','core'] },
  'Dumbbell Clean':               { primary:['hamstrings','shoulders'], secondary:['back','glutes','forearms'] },
  'Slam Ball Clean':              { primary:['hamstrings','shoulders'], secondary:['back','glutes'] },
  'Med Ball Slam':                { primary:['core','back'],   secondary:['shoulders','quads'] },
  'Slam Ball Overhead Slam':      { primary:['back','core'],   secondary:['shoulders','quads'] },
  'Dumbbell Swing':               { primary:['glutes','hamstrings'], secondary:['core','shoulders','forearms'] },
  'Wall Sit':                     { primary:['quads'],     secondary:['glutes','calves'] },
  'Plank Hold':                   { primary:['core'],      secondary:['shoulders','obliques'] },
  'Elevated Plank Hold':          { primary:['core'],      secondary:['shoulders','obliques'] },
  'Stability Ball Plank':         { primary:['core'],      secondary:['shoulders','obliques'] },
  'Side Plank':                   { primary:['obliques'],  secondary:['core','abductors','shoulders'] },
  'Pike Push-Up':                 { primary:['shoulders'], secondary:['triceps','core'] },
  'Stability Ball Pike':          { primary:['core'],      secondary:['shoulders','hipflexors'] },
  'Slider Pike':                  { primary:['core'],      secondary:['shoulders','hipflexors'] },
  'Dumbbell Upright Row':         { primary:['reardelts','shoulders'], secondary:['back','biceps'] },
  'Mini Band Push-Up':            { primary:['chest'],     secondary:['triceps','core','shoulders'] },
  'Slider Chest Fly':             { primary:['chest'],     secondary:['core','shoulders'] },
  'Slider Plank Jack':            { primary:['core'],      secondary:['abductors','shoulders'] },
  'Mountain Climber':             { primary:['core','hipflexors'], secondary:['shoulders'] },
};

// ── RESOLVER ──────────────────────────────────────────────────
const _muscleCache = new Map();

function _tokensToIds(segment) {
  for (const [re, ids] of MUSCLE_TOKEN_RULES) {
    if (re.test(segment)) return ids;
  }
  return [];
}

function _uniq(arr) { return [...new Set(arr)]; }

// Fallback signature derived from the coarse `focus` tags.
function _signatureFromFocus(focus = []) {
  const primary = [], secondary = [];
  if (focus.includes('push'))   { primary.push('chest','shoulders'); secondary.push('triceps'); }
  if (focus.includes('pull'))   { primary.push('back');              secondary.push('biceps','reardelts'); }
  if (focus.includes('upper') && !primary.length) { primary.push('chest','back','shoulders'); }
  if (focus.includes('glutes')) { primary.push('glutes');            secondary.push('hamstrings'); }
  if (focus.includes('lower'))  { primary.push('quads');             secondary.push('glutes','hamstrings'); }
  if (focus.includes('core'))   { primary.push('core');              secondary.push('obliques'); }
  if (focus.includes('full'))   { primary.push(...FULL_BODY_SIGNATURE.primary); secondary.push(...FULL_BODY_SIGNATURE.secondary); }
  if (!primary.length && focus.includes('cardio')) { primary.push('quads','calves'); secondary.push('core'); }
  return { primary:_uniq(primary), secondary:_uniq(secondary) };
}

/**
 * Resolve an exercise to its structured muscle signature.
 * Returns { primary, secondary, tertiary, all, majors, minors, conditioning }.
 */
function resolveMuscles(ex) {
  if (!ex) return { primary:[], secondary:[], tertiary:[], all:[], majors:[], minors:[], conditioning:false };
  const key = ex.name || JSON.stringify(ex);
  if (_muscleCache.has(key)) return _muscleCache.get(key);

  let primary = [], secondary = [];

  // 1. Author-supplied structured override on the exercise itself
  if (ex.muscles && (ex.muscles.primary || ex.muscles.secondary)) {
    primary   = [...(ex.muscles.primary   || [])];
    secondary = [...(ex.muscles.secondary || [])];
  }
  // 2. Curated override table
  else if (EXERCISE_MUSCLE_OVERRIDES[ex.name]) {
    const o = EXERCISE_MUSCLE_OVERRIDES[ex.name];
    primary   = [...(o.primary   || [])];
    secondary = [...(o.secondary || [])];
  }
  // 3. Parse the free-text label: first segment = prime mover
  else if (ex.muscle) {
    const segments = String(ex.muscle).split(/\s*[\/,]\s*/).map(s => s.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
    segments.forEach((seg, i) => {
      let ids = _tokensToIds(seg);
      if (ids[0] === '__full__') {
        primary.push(...FULL_BODY_SIGNATURE.primary);
        secondary.push(...FULL_BODY_SIGNATURE.secondary);
        return;
      }
      if (!ids.length) return;
      (i === 0 ? primary : secondary).push(...ids);
    });
  }

  // 4. Nothing parsed → fall back to the coarse focus tags
  if (!primary.length) {
    const fb = _signatureFromFocus(ex.focus);
    primary   = fb.primary;
    secondary = _uniq([...secondary, ...fb.secondary]);
  }

  primary   = _uniq(primary).filter(id => MUSCLE_GROUPS[id]);
  secondary = _uniq(secondary).filter(id => MUSCLE_GROUPS[id] && !primary.includes(id));

  // 5. Implied assistors → tertiary
  const tertiary = _uniq(
    [...primary, ...secondary].flatMap(id => IMPLIED_ASSISTORS[id] || [])
  ).filter(id => MUSCLE_GROUPS[id] && !primary.includes(id) && !secondary.includes(id));

  const all = _uniq([...primary, ...secondary, ...tertiary]);
  const sig = {
    primary, secondary, tertiary, all,
    majors: all.filter(id => MUSCLE_GROUPS[id].tier === 'major'),
    minors: all.filter(id => MUSCLE_GROUPS[id].tier === 'minor'),
    conditioning: !!(ex.focus && ex.focus.includes('cardio')),
  };
  _muscleCache.set(key, sig);
  return sig;
}

/** Weighted load contribution of one exercise, for history logging. */
const MUSCLE_WEIGHT = { primary: 1, secondary: 0.5, tertiary: 0.2 };

function muscleLoadForExercises(exercises = []) {
  const load = {};
  exercises.forEach(ex => {
    const sig = resolveMuscles(ex);
    sig.primary  .forEach(id => load[id] = (load[id] || 0) + MUSCLE_WEIGHT.primary);
    sig.secondary.forEach(id => load[id] = (load[id] || 0) + MUSCLE_WEIGHT.secondary);
    sig.tertiary .forEach(id => load[id] = (load[id] || 0) + MUSCLE_WEIGHT.tertiary);
  });
  Object.keys(load).forEach(k => load[k] = Math.round(load[k] * 10) / 10);
  return load;
}

/** Human-readable muscle chip label. */
function muscleLabel(id, short = false) {
  const m = MUSCLE_GROUPS[id];
  if (!m) return id;
  return (short ? m.short : m.label);
}
function muscleIcon(id) { return MUSCLE_GROUPS[id]?.icon || '•'; }

// ══════════════════════════════════════════════════════════════
//  MOVEMENT PATTERNS — the second coverage dimension
//  Muscle coverage answers "what got worked". This answers
//  "did the class move in a balanced way" — the thing that
//  actually keeps shoulders and low backs healthy over months.
// ══════════════════════════════════════════════════════════════
const MOVEMENT_PATTERNS = {
  hpush:  { label:'Horizontal Push', short:'H-Push', icon:'➡️', group:'push' },
  vpush:  { label:'Vertical Push',   short:'V-Push', icon:'⬆️', group:'push' },
  hpull:  { label:'Horizontal Pull', short:'H-Pull', icon:'⬅️', group:'pull' },
  vpull:  { label:'Vertical Pull',   short:'V-Pull', icon:'⬇️', group:'pull' },
  squat:  { label:'Squat (Knee)',    short:'Squat',  icon:'🦵', group:'knee' },
  lunge:  { label:'Lunge / Split',   short:'Lunge',  icon:'🚶', group:'knee' },
  hinge:  { label:'Hinge (Hip)',     short:'Hinge',  icon:'🍑', group:'hip' },
  carry:  { label:'Loaded Carry',    short:'Carry',  icon:'🧳', group:'carry' },
  rotate: { label:'Rotation',        short:'Rotate', icon:'🔄', group:'core' },
  brace:  { label:'Anti-Movement',   short:'Brace',  icon:'🧱', group:'core' },
  flex:   { label:'Trunk Flexion',   short:'Flex',   icon:'🎯', group:'core' },
  jump:   { label:'Jump / Plyo',     short:'Plyo',   icon:'⚡', group:'power' },
  gait:   { label:'Locomotion',      short:'Gait',   icon:'🏃', group:'power' },
  iso:    { label:'Isolation',       short:'Iso',    icon:'💪', group:'iso' },
};

// Ordered — first match wins. Tested against "<name> :: <muscle>".
const PATTERN_RULES = [
  // Carries first: "Farmer Carry" would otherwise read as a gait pattern.
  [/\bcarry\b|farmer|suitcase|waiter/i,                                        'carry'],
  // Explicit rotation / anti-rotation work.
  [/woodchop|russian twist|rotational|figure-8|halo|side bend|heel tap|bicycle|oblique/i, 'rotate'],
  [/pallof|anti-rotation|renegade|plank pull-through|bird dog|stir-the-pot|suitcase/i,    'brace'],
  // Jumping / plyometric.
  [/\bjump|jumping|plyo|broad jump|tuck jump|hop\b|skater|slam\b|depth drop|burpee|thrust(er)?\b.*jump/i, 'jump'],
  // Locomotion.
  [/crawl|climber|shuffle|inchworm|high knee|walk\b|walking|step-over|wall walk|jack\b|squat thrust|march/i, 'gait'],
  // Pulling — vertical vs horizontal.
  [/pulldown|pull-up|pullup|chin-up|lat pull|pullover|pull-in|straight-arm/i,   'vpull'],
  [/\brow\b|row\b|face pull|pull-apart|reverse fly|prone fly|snow angel|y-t-w|y-pull|prone cobra|shrug|upright row|high pull|external rotation|wall angel|towel row|scapular/i, 'hpull'],
  // Pressing — vertical vs horizontal.
  [/overhead press|shoulder press|push press|arnold|thruster|pike push|handstand|wall walk|lateral raise|front raise|squat to press|snatch|clean\b|jerk/i, 'vpush'],
  [/push-?up|chest press|bench press|floor press|chest fly|floor fly|\bdip\b|incline press|chest pass/i, 'hpush'],
  // Lower body — split/lunge before squat so "Split Squat" reads as a lunge.
  [/lunge|split squat|step-up|step up|bulgarian|curtsy|step-down|cossack|skater/i, 'lunge'],
  [/squat|wall sit|sit-to-stand|leg press|wall ball/i,                          'squat'],
  [/deadlift|\brdl\b|romanian|good morning|hinge|swing|pull-through|hip thrust|glute bridge|hamstring curl|leg curl|nordic|reverse hyper|back extension|superman|frog pump|kickback|donkey kick|hyperextension/i, 'hinge'],
  // Core.
  [/plank|hollow|dead bug|rollout|roll-out|body saw|copenhagen|l-sit|hold\b/i,  'brace'],
  [/crunch|sit-up|situp|v-up|leg raise|knee raise|knee tuck|jackknife|pike\b|flutter|scissor|toe touch/i, 'flex'],
  // Everything else with a single small prime mover is isolation.
  [/curl|extension|raise|kick|clamshell|abduction|adduction|calf|wrist|fly\b|pulse|squeeze/i, 'iso'],
];

// Explicit single-side work. Checked against the name only.
const UNILATERAL_RULE = /single-arm|single-leg|\bsl\b|one-arm|one-leg|bulgarian|split squat|step-up|step-down|lunge|curtsy|cossack|suitcase|side plank|clamshell|fire hydrant|donkey kick|kickback|copenhagen|pistol|skater|bird dog|concentration|windmill|get-up|side leg raise|hip abduction|hip adduction|lateral step/i;
// ...minus the obvious false positives.
const BILATERAL_OVERRIDE = /lunge with rotation|walking lunge|monster walk|lateral walk/i;

const PATTERN_OVERRIDES = {
  'Burpee':                  'gait',
  'Med Ball Burpee':         'gait',
  'Box Burpee':              'gait',
  'Slam Ball Burpee Slam':   'jump',
  'Dumbbell Swing':          'hinge',
  'Dumbbell Clean':          'hinge',
  'Slam Ball Clean':         'hinge',
  'Dumbbell Snatch':         'hinge',
  'Dumbbell Thruster':       'vpush',
  'Med Ball Thruster':       'vpush',
  'Slam Ball Thruster':      'vpush',
  'Cable Band Thruster':     'vpush',
  'Dumbbell Turkish Get-Up': 'brace',
  'Bear Crawl':              'gait',
  'Lateral Bear Crawl':      'gait',
  'Slider Bear Crawl':       'gait',
  'Skater Jump':             'jump',
  'Slider Skater':           'lunge',
  'Inchworm':                'gait',
  'Slider Inchworm':         'gait',
  'Wall Sit':                'squat',
  'Squat Pulse':             'squat',
  'Bench Hamstring Walkout': 'hinge',
  'Stability Ball Pass':     'flex',
};

const _patternCache = new Map();

/**
 * Resolve an exercise's movement pattern and whether it is single-sided.
 * @returns {{pattern:string, group:string, unilateral:boolean}}
 */
function resolveMovement(ex) {
  if (!ex) return { pattern:'iso', group:'iso', unilateral:false };
  const name = ex.name || '';
  if (_patternCache.has(name)) return _patternCache.get(name);

  let pattern = ex.pattern || PATTERN_OVERRIDES[name];
  if (!pattern) {
    const probe = name + ' :: ' + (ex.muscle || '');
    for (const [re, id] of PATTERN_RULES) {
      if (re.test(probe)) { pattern = id; break; }
    }
  }
  if (!pattern || !MOVEMENT_PATTERNS[pattern]) pattern = _patternFromSignature(ex);

  const unilateral = ex.unilateral !== undefined
    ? !!ex.unilateral
    : (UNILATERAL_RULE.test(name) && !BILATERAL_OVERRIDE.test(name));

  const out = { pattern, group: MOVEMENT_PATTERNS[pattern].group, unilateral };
  _patternCache.set(name, out);
  return out;
}

/** Last-resort pattern guess from the muscle signature. */
function _patternFromSignature(ex) {
  const sig = resolveMuscles(ex);
  const p = sig.primary[0];
  if (p === 'chest')      return 'hpush';
  if (p === 'back')       return 'hpull';
  if (p === 'shoulders')  return 'vpush';
  if (p === 'quads')      return 'squat';
  if (p === 'hamstrings' || p === 'glutes' || p === 'lowerback') return 'hinge';
  if (p === 'core')       return 'brace';
  if (p === 'obliques')   return 'rotate';
  return 'iso';
}

/**
 * Balance targets per focus. `minUnilateral` keeps single-leg/single-arm work
 * in the plan — the single best predictor of injury resilience in a HIIT class.
 */
const BALANCE_CONTRACT = {
  full:   { pairs:[['push','pull'],['knee','hip']], minUnilateral:2, wantCore:true },
  upper:  { pairs:[['push','pull']],                minUnilateral:1, wantCore:false },
  lower:  { pairs:[['knee','hip']],                 minUnilateral:2, wantCore:false },
  core:   { pairs:[],                               minUnilateral:1, wantCore:true  },
  cardio: { pairs:[['knee','hip']],                 minUnilateral:1, wantCore:false },
  push:   { pairs:[],                               minUnilateral:1, wantCore:false },
  pull:   { pairs:[],                               minUnilateral:1, wantCore:false },
  glutes: { pairs:[['knee','hip']],                 minUnilateral:2, wantCore:false },
};
function getBalanceContract(key) { return BALANCE_CONTRACT[key] || BALANCE_CONTRACT.full; }

/** Tally movement groups across a list of exercises. */
function movementTally(exercises = []) {
  const groups = {}, patterns = {};
  let unilateral = 0;
  exercises.forEach(ex => {
    const mv = resolveMovement(ex);
    groups[mv.group]     = (groups[mv.group] || 0) + 1;
    patterns[mv.pattern] = (patterns[mv.pattern] || 0) + 1;
    if (mv.unilateral) unilateral++;
  });
  return { groups, patterns, unilateral, total: exercises.length };
}

function patternLabel(id, short = false) {
  const p = MOVEMENT_PATTERNS[id];
  if (!p) return id;
  return short ? p.short : p.label;
}
function patternIcon(id) { return MOVEMENT_PATTERNS[id]?.icon || '•'; }

// Expose for other scripts / debugging
if (typeof window !== 'undefined') {
  window.MUSCLE_GROUPS = MUSCLE_GROUPS;
  window.resolveMuscles = resolveMuscles;
  window.muscleLoadForExercises = muscleLoadForExercises;
  window.getFocusContract = getFocusContract;
  window.MOVEMENT_PATTERNS = MOVEMENT_PATTERNS;
  window.resolveMovement = resolveMovement;
  window.movementTally = movementTally;
  window.getBalanceContract = getBalanceContract;
}
