// Live-class tests: athlete link codec and clock maths (participant.js),
// the instructor phone link sanitiser (remote.js), and voice cues / injury
// flags (features.js). Dependency-free: run with `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function memStore() {
  const s = {};
  return {
    raw: s,
    get: k => (k in s ? s[k] : null),
    set: (k, v) => { s[k] = String(v); },
    remove: k => { delete s[k]; },
    getJSON: (k, d) => { try { return k in s ? JSON.parse(s[k]) : d; } catch (e) { return d; } },
    setJSON: (k, v) => { s[k] = JSON.stringify(v); },
    getSession: () => null, setSession() {},
  };
}

function browserCtx(extra) {
  const noop = () => {};
  const ctx = Object.assign({
    console,
    btoa: s => Buffer.from(String(s), 'binary').toString('base64'),
    atob: s => Buffer.from(String(s), 'base64').toString('binary'),
    IHStore: memStore(),
    location: { href: 'http://x/', hash: '', pathname: '/', search: '' },
    document: {
      addEventListener: noop, removeEventListener: noop, getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute: noop, style: {} }),
      documentElement: { lang: 'en' }, body: { classList: { contains: () => false } },
    },
    navigator: {},
    addEventListener: noop,
    setTimeout, clearTimeout,
  }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}

// ── participant.js ───────────────────────────────────────────
function loadParticipant(extra) {
  const ctx = browserCtx(Object.assign({
    state: { workout: null, timer: {}, muscle: 'full' },
    buildTimerSequence: () => [],
  }, extra));
  vm.runInContext(read('participant.js'), ctx);
  return { ctx, api: ctx.__ihLiveTest };
}

const step = (phase, name, duration) => ({ phase, name, duration });

test('class plan round-trips, including more than 36 distinct moves', () => {
  const { api } = loadParticipant();
  const small = [step('get-ready', 'Get Ready!', 10), step('work', 'Squat', 40), step('rest', '', 20), step('work', 'Push-up', 40)];
  const back = api.unpackPlan(api.packPlan(small));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(back.map(s => [s.phase, s.name, s.duration]))), small.map(s => [s.phase, s.name, s.duration]));

  const big = [];
  for (let i = 0; i < 50; i++) big.push(step('work', 'Move ' + i, 30), step('rest', '', 15));
  const packed = api.packPlan(big);
  assert.ok(packed.startsWith('W'), 'wide plan when names exceed one base36 digit');
  const out = api.unpackPlan(packed);
  assert.strictEqual(out.length, 100);
  assert.strictEqual(out[98].name, 'Move 49');
  assert.strictEqual(out[99].start, 49 * 45 + 30);

  // The wide plan rides in field 16 so older phones are not fed garbage.
  const payload = api.encodePayload({ mode: 't', sid: 'abc', title: 'T', meta: 'm', plan: packed, t0: 123 });
  const d = api.decodePayload(payload);
  assert.strictEqual(d.plan.length, 100);
  assert.strictEqual(d.t0, 123);
});

test('decodePayload clamps hostile counts and sanitises the class id', () => {
  const { api } = loadParticipant();
  const fields = ['4', 'c', 'a<b>"c', 'T', 'm', '1000000000', 'Squat^10^reps', '999999', '99999', '-5', 'Plank^30^s',
    '9999999999', '5,10,0,-3,100000', '', '17', '999999999'];
  const raw = Buffer.from(fields.join('|'), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const d = api.decodePayload(raw);
  assert.strictEqual(d.rounds, 50);
  assert.strictEqual(d.sid, 'abc');
  assert.strictEqual(d.burner.rounds, 50);
  assert.strictEqual(d.burner.work, 3600);
  assert.strictEqual(d.burner.rest, 0);
  assert.strictEqual(d.cap, 86400);
  assert.deepStrictEqual(Array.from(d.rungs), [5, 10, 999]);
  assert.strictEqual(d.paused, 86400);
});

test('an old v4 link without the new fields still decodes', () => {
  const { api } = loadParticipant();
  const plan = api.packPlan([step('work', 'Squat', 40), step('rest', '', 20)]);
  const fields = ['4', 't', 'sid1', 'Title', 'meta', '1', '', '0', '0', '0', '', '0', '', plan, '1700000000000'];
  const raw = Buffer.from(fields.join('|'), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const d = api.decodePayload(raw);
  assert.strictEqual(d.plan.length, 2);
  assert.strictEqual(d.t0, 1700000000000);
  assert.strictEqual(d.paused, 0);
  assert.deepStrictEqual(Object.keys(d.info), []);
});

test('paused seconds and move info survive the round trip', () => {
  const { api } = loadParticipant();
  const plan = api.packPlan([step('work', 'Squat', 40)]);
  const raw = api.encodePayload({ mode: 't', sid: 's', title: 'T', meta: 'm', plan, t0: 0, paused: 95,
    info: { Squat: { prop: 'Kettlebell', cue: 'Chest up', easier: 'Box squat', harder: 'Jump squat' } } });
  const d = api.decodePayload(raw);
  assert.strictEqual(d.paused, 95);
  assert.strictEqual(d.info.Squat.cue, 'Chest up');
  assert.strictEqual(d.info.Squat.easier, 'Box squat');
});

test('a timer left over from another class never leaks into the link', () => {
  const seq = [step('work', 'Squat', 40), step('rest', '', 20)];
  const w = { style: 'tabata', styleCfg: { name: 'Tabata' }, exercises: [{ name: 'Squat' }] };
  const stale = { sequence: [step('work', 'Old', 40)], current: 0, seconds: 10, isRunning: true, deadline: Date.now() + 10000, _started: true };
  const { api, ctx } = loadParticipant({ state: { workout: w, timer: stale, muscle: 'full' }, buildTimerSequence: () => seq });
  assert.strictEqual(api.liveTimer(), null);
  assert.strictEqual(api.classStartEpoch(), 0);
  const p = api.classPayloadFromWorkout(w);
  assert.strictEqual(p.t0, 0);
  assert.strictEqual(api.unpackPlan(p.plan)[0].name, 'Squat');

  // Once app.js stamps the timer as this class's, its clock is used.
  ctx.state.timer = { sequence: seq, current: 1, seconds: 5, isRunning: true, deadline: Date.now() + 5000, _started: true, workoutRef: w };
  const t0 = api.classStartEpoch();
  assert.ok(Math.abs(Date.now() - t0 - 55000) < 1500, 'start rewinds through 55 s of class');

  // Paused: the link carries where it stopped instead of a start time.
  ctx.state.timer.isRunning = false;
  assert.strictEqual(api.classPausedAt(), 55);
});

test('athlete clock: pending, paused and re-sync during rest', () => {
  const { api } = loadParticipant();
  const plan = api.unpackPlan(api.packPlan([
    step('get-ready', 'Get Ready', 10), step('work', 'Squat', 40), step('rest', 'Squat', 20),
    step('work', 'Squat', 40), step('rest', '', 20), step('work', 'Lunge', 40)]));
  const now = Date.now();

  api.athlete({ plan, t0: now + 4000, info: {} }, {});
  const pend = api.planPosition();
  assert.ok(pend.pending, 'a start time slightly in the future counts down');
  assert.ok(pend.left >= 3 && pend.left <= 5);

  api.athlete({ plan, t0: 0, info: {} }, { pausedAt: 75 });
  const frozen = api.planPosition();
  assert.ok(frozen.paused);
  assert.strictEqual(frozen.idx, 3);

  // 55 s in: resting after set 1 of Squat. The re-sync list must offer the
  // move phases around here, not jump to the end of the class.
  api.athlete({ plan, t0: now - 55000, info: {} }, {});
  const pos = api.planPosition();
  assert.strictEqual(pos.step.phase, 'rest');
  const html = api.resyncList(pos);
  ['1', '3', '5'].forEach(i => assert.match(html, new RegExp('data-resync-idx="' + i + '"')));
  assert.match(html, /1\/2/);
  assert.match(html, /data-nudge="-10"/);
});

// ── remote.js ────────────────────────────────────────────────
function loadRemote() {
  const ctx = browserCtx({ state: { workout: null, timer: {} } });
  vm.runInContext(read('remote.js'), ctx);
  return ctx;
}

test('phone link: markup is stripped and numbers are forced to numbers', () => {
  const ctx = loadRemote();
  const data = {
    v: 1, muscle: 'custom:chest,glutes',
    w: {
      style: 'tabata', styleCfg: { name: '<img src=x onerror=alert(1)>', icon: 5 },
      exercises: [{ name: 'Squat<b id=pwn>', reps: '<script>', duration: '1e9' }, 'not-an-object', { noName: 1 }],
      coreBurner: { work: '<b>20</b>', rest: 15, rounds: 1e9, exercises: [{ name: 'Plank' }] },
      __proto__: { polluted: true },
      participants: 'lots',
    },
    ma: { enabled: true, groups: [{ id: 'g1', names: 'Alice, Bob' }], assignments: { Alice: 'g1' } },
  };
  const out = ctx.ihSanitizePhoneLink(JSON.parse(JSON.stringify(data)));
  assert.ok(out);
  assert.strictEqual(out.w.exercises.length, 1);
  assert.doesNotMatch(JSON.stringify(out), /[<>]/);
  assert.strictEqual(out.w.exercises[0].duration, 3600);
  assert.strictEqual(typeof out.w.coreBurner.work, 'number');
  assert.strictEqual(out.w.coreBurner.rounds, 50);
  assert.strictEqual(out.w.participants, 0);
  assert.strictEqual(out.w.styleCfg.icon, '5');
  assert.strictEqual(out.muscle, 'custom:chest,glutes');
  assert.strictEqual(out.ma.groups[0].names, '');
  assert.strictEqual(out.ma.assignments, undefined);
  assert.strictEqual(({}).polluted, undefined);
});

test('phone link: a class without a style or moves is rejected', () => {
  const ctx = loadRemote();
  assert.strictEqual(ctx.ihSanitizePhoneLink({ w: { styleCfg: {}, exercises: [{ name: 'A' }] } }), null);
  assert.strictEqual(ctx.ihSanitizePhoneLink({ w: { style: 'x', styleCfg: {}, exercises: [] } }), null);
  assert.strictEqual(ctx.ihSanitizePhoneLink({ w: { style: '<b>', styleCfg: {}, exercises: [{ name: 'A' }] } }), null);
  assert.strictEqual(ctx.ihSanitizePhoneLink(null), null);
});

test('phone link codec round-trips and refuses runaway expansion', () => {
  const ctx = loadRemote();
  const s = JSON.stringify({ hello: 'wörld ✓', list: Array.from({ length: 200 }, (_, i) => 'Move ' + i) });
  assert.strictEqual(ctx.ihLzUnpack(ctx.ihLzPack(s)), s);
  const bomb = ctx.ihLzPack('a'.repeat(5000000));
  assert.throws(() => ctx.ihLzUnpack(bomb));
});

// ── features.js ──────────────────────────────────────────────
function loadFeatures(extra) {
  const spoken = [];
  const ctx = browserCtx(Object.assign({ state: { workout: null } }, extra));
  ctx.speechSynthesis = { speaking: false, pending: false, paused: false, cancel() {}, resume() {}, speak: u => spoken.push(u.text) };
  ctx.SpeechSynthesisUtterance = function (t) { this.text = t; };
  vm.runInContext(read('features.js') + '\n;this.__f={IHFlags,ihVoiceTick,ihAudioNeedsUnlock,ihAudioUnlock};', ctx);
  return { ctx, f: ctx.__f, spoken };
}

test('low-impact flag: real impact moves only', () => {
  const { f } = loadFeatures();
  const p = { flags: ['impact'] };
  ['Jump Squat', 'Burpee', 'Jumping Jack', 'Plank Jack', 'Skater Hop', 'High Knees', 'Tuck Jump', 'Box Jump']
    .forEach(n => assert.deepStrictEqual(Array.from(f.IHFlags.conflicts(p, n)), ['impact'], n));
  ['Ball Slam', 'Box Squat', 'Kettlebell Jack Knife', 'Tuck Crunch', 'Wood Chop', 'Plank']
    .forEach(n => assert.deepStrictEqual(Array.from(f.IHFlags.conflicts(p, n)), [], n));
  const knee = { flags: ['knee'] };
  assert.deepStrictEqual(Array.from(f.IHFlags.conflicts(knee, 'Box Step-up')), ['knee']);
  assert.deepStrictEqual(Array.from(f.IHFlags.conflicts(knee, 'Boxing Jabs')), []);
});

test('low-impact flag defers to exIsHighImpact when content provides it', () => {
  const { f } = loadFeatures({ exIsHighImpact: ex => ex.name === 'Ball Slam' });
  const p = { flags: ['impact'] };
  assert.deepStrictEqual(Array.from(f.IHFlags.conflicts(p, 'Ball Slam')), ['impact']);
  assert.deepStrictEqual(Array.from(f.IHFlags.conflicts(p, 'Burpee')), []);
});

test('voice: 3-2-1 before work, halfway on long work, once per second', () => {
  const { ctx, f, spoken } = loadFeatures();
  const rest = { phase: 'rest', duration: 20 }, work = { phase: 'work', name: 'Squat', duration: 40 };
  assert.strictEqual(f.ihVoiceTick(3, rest, work, 2), false, 'silent while voice is off');
  ctx.IHStore.set('hiit_voice', 'on');
  assert.strictEqual(f.ihVoiceTick(5, rest, work, 2), false);
  assert.strictEqual(f.ihVoiceTick(3, rest, work, 2), true);
  assert.strictEqual(f.ihVoiceTick(2, rest, work, 2), true);
  assert.strictEqual(f.ihVoiceTick(1.6, rest, work, 2), true, 'same second again is not repeated');
  assert.strictEqual(f.ihVoiceTick(1, rest, work, 2), true);
  assert.deepStrictEqual(spoken, ['3', '2', '1']);
  assert.strictEqual(f.ihVoiceTick(20, work, rest, 3), true);
  assert.strictEqual(spoken[spoken.length - 1], 'Halfway');
  assert.strictEqual(f.ihVoiceTick(10, { phase: 'work', duration: 20 }, rest, 5), false, 'no halfway on short work');
  assert.strictEqual(f.ihVoiceTick(2, { phase: 'rest', duration: 3 }, work, 6), false, 'no count on a tiny rest');
});

test('sound unlock is needed after a reload and cleared by a tap', () => {
  const { ctx, f } = loadFeatures();
  assert.strictEqual(f.ihAudioNeedsUnlock(), false, 'nothing to unlock when sound and voice are off');
  ctx.IHStore.set('hiit_voice', 'on');
  assert.strictEqual(f.ihAudioNeedsUnlock(), true);
  f.ihAudioUnlock();
  assert.strictEqual(f.ihAudioNeedsUnlock(), false);
});
