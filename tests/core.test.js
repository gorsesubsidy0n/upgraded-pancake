// Core class-building and timer tests: run with `npm test` (Node 20+).
// app.js, programming.js and editor.js are loaded into a stubbed browser.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// A small fake element: records what the app writes so tests can inspect it.
function makeEl(id) {
  const el = {
    id: id || '', style: {}, dataset: {}, children: [], attrs: {},
    innerHTML: '', textContent: '', value: '', className: '', checked: false, disabled: false, onclick: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; }, prepend(c) { this.children.unshift(c); return c; },
    append() {}, remove() {}, insertBefore(c) { return c; }, replaceWith() {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; }, addEventListener() {}, removeEventListener() {},
    querySelector() { return makeEl(); }, querySelectorAll() { return []; }, closest() { return null; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, select() {}, cloneNode() { return makeEl(); },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
  };
  return el;
}

function loadCore(opts) {
  opts = opts || {};
  const store = {}, els = {};
  let now = opts.now || 1_000_000;
  const intervals = new Set();
  const ctx = {
    console, Math, JSON, parseInt, parseFloat, isNaN, isFinite, Uint8Array, Array, String, Object, Number, RegExp, Error, Promise, Map, Set, Symbol,
    Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { href: 'http://x/', hash: '' },
    document: {
      addEventListener() {}, visibilityState: 'visible',
      getElementById: id => (els[id] || (els[id] = makeEl(id))),
      querySelector: () => null, querySelectorAll: () => [], createElement: () => makeEl(),
      documentElement: makeEl(), body: makeEl(),
    },
    navigator: {}, setTimeout: () => 0, clearTimeout() {},
    setInterval: () => { const h = {}; intervals.add(h); return h; }, clearInterval: h => intervals.delete(h),
    addEventListener() {}, open: () => null, print() {}, scrollTo() {},
    confirm: () => (opts.confirm === undefined ? true : opts.confirm),
    structuredClone: v => JSON.parse(JSON.stringify(v)),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['storage.js', 'muscle-map.js', 'exercise-db.js', 'app.js', 'programming.js', 'editor.js']) {
    const extra = f === 'editor.js' ? '\n;this.__state=state;this.__STYLES=STYLES;this.__DB=DB;' : '';
    vm.runInContext(read(f) + extra, ctx, { filename: f });
  }
  const state = ctx.__state;
  state.inventory = ctx.loadInventory();
  ctx.rebuildPropMaps();
  ctx.renderMuscleFocus = () => {};
  const toasts = [];
  ctx.showToast = (m) => toasts.push(String(m));
  return { ctx, state, els, toasts, store, intervals, tick: ms => { now += ms; }, now: () => now };
}

function generate(env, style, minutes, people) {
  const { ctx, state } = env;
  state.style = style;
  state.duration = minutes;
  state.participants = people || 12;
  state.muscle = 'full';
  state.difficulty = 'intermediate';
  state.props = ['dumbbells', 'bench', 'bodyweight', 'kettlebells', 'resistanceBands'];
  state.includeWarmup = true; state.includeCooldown = true; state.warmupDuration = 7;
  ctx.generateWorkout({ force: true, silent: true });
  return state.workout;
}

const STYLES_ALL = ['tabata', 'amrap', 'emom', 'circuit', 'ladder', 'pyramid', 'hundred', 'superset', 'ygig', 'custom'];

test('every style lands within tolerance of 20/30/45/60/90 min', () => {
  const env = loadCore();
  const misses = [];
  for (const style of STYLES_ALL) {
    for (const mins of [20, 30, 45, 60, 90]) {
      for (let rep = 0; rep < 3; rep++) {
        const w = generate(env, style, mins);
        assert.ok(w && w.exercises.length, style + ' ' + mins + ' generated');
        const got = env.ctx.classSeconds(w), target = mins * 60;
        const tol = Math.max(120, target * 0.1);
        if (Math.abs(got - target) > tol) misses.push(style + ' ' + mins + 'min → ' + (got / 60).toFixed(1) + ' min');
        // The timer runs exactly what the plan measures.
        const seq = env.ctx.buildTimerSequence();
        assert.strictEqual(seq.reduce((s, x) => s + x.duration, 0), got);
        assert.ok(seq.every(s => Number.isFinite(s.duration) && s.duration > 0), style + ' has a bad step');
      }
    }
  }
  assert.deepStrictEqual(misses, []);
});

test('ygig stays on time at long lengths and with long work intervals', () => {
  const env = loadCore();
  for (const sec of [20, 45, 90]) {
    env.state.ygigWorkSec = sec;
    for (const mins of [45, 60, 90]) {
      const w = generate(env, 'ygig', mins);
      const got = env.ctx.classSeconds(w), target = mins * 60;
      assert.ok(Math.abs(got - target) <= Math.max(120, target * 0.1), 'ygig ' + sec + 's ' + mins + 'min → ' + got / 60);
    }
  }
  env.state.ygigWorkSec = 45;
});

test('tabata: no change-over rest after the last block', () => {
  const env = loadCore();
  generate(env, 'tabata', 30);
  const seq = env.ctx.buildTimerSequence();
  const main = seq.slice(seq.findIndex(s => s.label === 'MAIN WORKOUT') + 1);
  const lastWork = main.map(s => s.phase).lastIndexOf('work');
  const afterLastWork = main.slice(lastWork + 1).filter(s => s.phase === 'rest' && /NEXT BLOCK|NEXT EXERCISE/.test(s.label));
  // Only the core burner / cool-down may follow the final tabata effort.
  const tabataTail = main.slice(0, main.findIndex(s => s.label === '🎯 CORE BURNER' || s.label === 'COOL-DOWN'));
  assert.notStrictEqual(tabataTail[tabataTail.length - 1].label, 'NEXT BLOCK');
  assert.ok(afterLastWork.length === 0 || tabataTail.length < main.length);
});

test('emom minutes are real 60 second minutes', () => {
  const env = loadCore();
  for (const people of [6, 12]) {
    generate(env, 'emom', 45, people);
    const p = env.ctx.emomPlan(env.state.workout);
    const main = env.ctx.buildMainSeq(env.state.workout);
    assert.strictEqual(main.reduce((s, x) => s + x.duration, 0), p.totalMins * 60);
  }
});

test('ygig never pairs a move with itself and needs two people', () => {
  const env = loadCore();
  const w = generate(env, 'ygig', 45);
  w.exercises.pop(); // odd count
  const p = env.ctx.ygigPlan(w);
  p.pairs.forEach(pair => assert.notStrictEqual(pair.active.name, pair.primary.name));
  env.state.workout = null;
  env.state.participants = 1;
  env.state.style = 'ygig';
  env.ctx.generateWorkout({ force: true });
  assert.strictEqual(env.state.workout, null, 'a solo class must not get You-Go-I-Go');
  assert.ok(env.toasts.some(t => /at least 2 people/.test(t)));
});

test('class length holds with or without warm-up, cool-down and core burner', () => {
  // A 20 minute Tabata with a long warm-up used to come out at 22 min, and a
  // short YGIG with an auto core burner at 34 min for a 30 minute class.
  const env = loadCore();
  const s = env.state, misses = [];
  for (const style of STYLES_ALL) for (const mins of [20, 30, 45, 60, 90]) {
    for (const [wu, cd, muscle] of [[true, true, 'full'], [false, true, 'core'], [false, false, 'upper'], [true, false, 'lower']]) {
      Object.assign(s, { style, duration: mins, participants: 12, muscle, difficulty: 'intermediate',
        props: ['dumbbells', 'bench', 'bodyweight'], includeWarmup: wu, includeCooldown: cd, warmupDuration: 7, workout: null });
      env.ctx.generateWorkout({ force: true, silent: true });
      const got = env.ctx.classSeconds(s.workout), target = mins * 60;
      if (Math.abs(got - target) > Math.max(120, target * 0.1)) misses.push(`${style} ${mins}min wu=${wu} cd=${cd} ${muscle} → ${(got / 60).toFixed(1)}`);
    }
  }
  assert.deepStrictEqual(misses, []);
});

test('tabata can end on a shorter finisher block to land on time', () => {
  const env = loadCore();
  const w = generate(env, 'tabata', 20);
  const p = env.ctx.tabataPlan(w);
  assert.strictEqual(p.rounds.length, p.blocks.length);
  assert.ok(p.rounds.every((r, i) => r === 8 || (i === p.rounds.length - 1 && r >= 4)));
  const work = env.ctx.buildMainSeq(w).filter(x => x.phase === 'work').length;
  assert.strictEqual(work, p.rounds.reduce((a, b) => a + b, 0));
});

// ── timer engine ──────────────────────────────────────────────
function runTo(env, ms) { for (let t = 0; t < ms; t += 200) { env.tick(200); env.ctx.timerTick(); } }

test('pause/resume adds no time and ▶ after finish never logs twice', () => {
  const env = loadCore();
  const { ctx, state } = env;
  generate(env, 'circuit', 20);
  ctx.startTimerEngine('instructor');
  assert.strictEqual(state.timer.workoutRef, state.workout, 'live sequence is tied to this plan');
  const total = ctx.classTimeLeft();
  // Ten pause/resume cycles, each mid-second, must not add any time.
  for (let i = 0; i < 10; i++) { runTo(env, 1300); ctx.toggleTimer(); env.tick(5000); ctx.toggleTimer(); }
  runTo(env, 200);
  const elapsed = 10 * 1300 + 200;
  const remaining = (state.timer.deadline - env.now()) / 1000 + (ctx.classTimeLeft() - state.timer.seconds);
  assert.ok(Math.abs(total - elapsed / 1000 - remaining) < 1.01, 'drift ' + (total - elapsed / 1000 - remaining));
  // Run past the end, then mash ▶: the class is logged exactly once.
  const before = state.workoutHistory.length;
  runTo(env, total * 1000 + 2000);
  assert.strictEqual(state.timer.isRunning, false);
  ctx.toggleTimer(); ctx.toggleTimer();
  assert.strictEqual(state.workoutHistory.length, before + 1);
  assert.strictEqual(state.timer.sequence.length, 0, 'finished class drops its sequence');
  assert.strictEqual(state.timer.workoutRef, null);
});

test('end class early logs once with the minutes actually taught', () => {
  const env = loadCore();
  const { ctx, state } = env;
  generate(env, 'emom', 30);
  ctx.startTimerEngine('participant');
  runTo(env, 5 * 60 * 1000);
  const before = state.workoutHistory.length;
  ctx.endClassAndLog();
  ctx.endClassAndLog();
  assert.strictEqual(state.workoutHistory.length, before + 1);
  const h = state.workoutHistory[0];
  assert.strictEqual(h.endedEarly, true);
  assert.ok(h.taughtMin >= 4 && h.taughtMin <= 6, 'taught ' + h.taughtMin);
});

test('a new or loaded plan clears the old live sequence', () => {
  const env = loadCore();
  const { ctx, state } = env;
  generate(env, 'tabata', 30);
  ctx.startTimerEngine('instructor');
  assert.ok(state.timer.sequence.length > 0);
  generate(env, 'circuit', 30);
  assert.strictEqual(state.timer.sequence.length, 0);
  assert.strictEqual(state.timer.isRunning, false);
  ctx.startTimerEngine('instructor');
  ctx.saveWorkout('Test class');
  const saved = state.savedWorkouts[0];
  ctx.applySavedWorkout(saved);
  assert.strictEqual(state.timer.sequence.length, 0);
  assert.notStrictEqual(state.workout, saved.workout, 'loading works on a copy');
  state.workout.exercises[0].name = 'Changed';
  assert.notStrictEqual(saved.workout.exercises[0].name, 'Changed');
});

test('skip exercise jumps past every interval of the current move', () => {
  const env = loadCore();
  const { ctx, state } = env;
  generate(env, 'tabata', 30);
  ctx.startTimerEngine('instructor');
  const seq = state.timer.sequence;
  const first = seq.findIndex(s => s.phase === 'work' && s._exIdx != null);
  ctx.jumpToStep(first);
  const ex = seq[first]._exIdx;
  ctx.skipExercise();
  const now = state.timer.current;
  assert.ok(now > first);
  for (let i = now; i < seq.length && seq[i].phase !== 'get-ready'; i++) {
    if (seq[i]._exIdx === ex && seq[i].label === seq[first].label) assert.fail('still on the skipped move at ' + i);
    break;
  }
  assert.ok(seq.slice(first + 1, now).every(s => s._exIdx == null || s._exIdx === ex));
  assert.ok(state.timer.isRunning, 'skipping keeps a running class running');
});

test('timer and banners escape plan text from a crafted link', () => {
  const env = loadCore();
  const { ctx, state, els } = env;
  generate(env, 'ladder', 30);
  const bad = '<img src=x onerror=alert(1)>';
  state.workout.exercises[0].name = bad;
  state.workout.exercises[0].reps = bad;
  const children = [];
  els['sidebar-exercise-list'] = Object.assign(ctx.document.getElementById('sidebar-exercise-list'), { appendChild(c) { children.push(c); return c; } });
  ctx.buildSidebar();
  assert.ok(children.length && children.every(c => !/<img/.test(c.innerHTML)));
  ctx.startTimerEngine('participant');
  const work = state.timer.sequence.findIndex(s => s._ladder);
  ctx.jumpToStep(work);
  assert.ok(!/<img/.test(els['p-ladder'].innerHTML));
  ctx.MA = { enabled: false, groups: [{ count: 2, color: 'x"', icon: '<b>', label: bad, names: bad }] };
  ctx.renderMAGroupBanner();
  assert.ok(!/<img|<b>/.test(els['ma-group-banner'].innerHTML.replace(/<b>[^<]*<\/b>/g, '')));
});

test('plan edits keep unknown fields and remove/undo restores the plan', () => {
  const env = loadCore();
  const { ctx, state } = env;
  generate(env, 'circuit', 30);
  const prev = Object.assign(state.workout.exercises[0], { tierOverride: { b: 'Wall Push-Up' }, impact: 'low' });
  const built = ctx.buildPlanEntry({ name: 'My Move', repRange: { i: [8, 10] }, notes: 'Brace' }, prev, 0);
  assert.deepStrictEqual(built.tierOverride, { b: 'Wall Push-Up' });
  assert.strictEqual(built.impact, 'low');
  assert.strictEqual(built.cue, 'Brace');
  const names = state.workout.exercises.map(e => e.name);
  ctx.removeExercise(1);
  assert.strictEqual(state.workout.exercises.length, names.length - 1);
  ctx.undoPlanEdit();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.workout.exercises.map(e => e.name))), JSON.parse(JSON.stringify(names)));
});

test('ygig: removing a move drops its whole pair', () => {
  const env = loadCore();
  const { ctx, state } = env;
  const w = generate(env, 'ygig', 45);
  const names = w.exercises.map(e => e.name);
  ctx.removeExercise(3);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.workout.exercises.map(e => e.name))), JSON.parse(JSON.stringify(names.slice(0, 2).concat(names.slice(4)))));
});

test('time left in class counts down by time, not by interval', () => {
  const env = loadCore();
  const { ctx, state, els } = env;
  generate(env, 'amrap', 30);
  ctx.startTimerEngine('participant');
  const total = ctx.classTimeLeft();
  assert.ok(Math.abs(total - ctx.classSeconds(state.workout)) <= 1);
  runTo(env, 60 * 1000);
  assert.ok(Math.abs(ctx.classTimeLeft() - (total - 60)) <= 1);
  assert.match(els['p-time-left'].textContent, /left in class/);
});

test('library edit renames in place and never touches the open plan', () => {
  const env = loadCore();
  const { ctx, state, els } = env;
  generate(env, 'circuit', 30);
  state.customWarmup = [{ name: 'Old Stretch', duration: 30, note: '', _custom: true }];
  const planWarm = state.workout.warmup.length;
  ctx.editLibraryExercise('warmup', 'Old Stretch');
  const el = id => ctx.document.getElementById(id);
  el('ex-name').value = 'New Stretch'; el('ex-duration').value = '9999'; el('ex-note').value = 'x';
  ctx.saveExercise();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.customWarmup.map(e => e.name))), ['New Stretch']);
  assert.strictEqual(state.customWarmup[0].duration, 600, 'duration clamped');
  assert.strictEqual(state.workout.warmup.length, planWarm);
});

test('ygig never uses a capped or shared-station prop', () => {
  const env = loadCore();
  for (let i = 0; i < 5; i++) {
    const w = generate(env, 'ygig', 45, 12);
    w.exercises.forEach(ex => assert.strictEqual(env.ctx.propCapacity(ex.prop), Infinity, ex.name + ' uses ' + ex.prop));
  }
});
