// Content + mixed-ability tests: run with `npm test` (Node 20+).
// Loads exercise-db.js, muscle-map.js and mixed_ability.js into a stubbed
// browser context (no app.js), the same way tests/app.test.js does.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function load() {
  const ctx = {
    console, Math, Date, JSON, parseInt, Number, String, Array, Object, RegExp, Map, Set, Error,
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
    state: { props: [], participants: 8, workout: null },
    IHStore: { getJSON: (k, d) => d, setJSON() {} },
    showToast() {}, escapeHtml: esc,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['muscle-map.js', 'exercise-db.js', 'mixed_ability.js']) vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext('this.__api={DB,MA,exFind,exImpact,exIsHighImpact,getModForTier,getTierDisplay,maTierCandidates,' +
    'liveZoneHtml,tierPickerHtml,rankFocusCandidates,focusMatchStrength,FOCUS_CONTRACT,MUSCLE_GROUPS,customFocusIds,' +
    'getFocusContract,EMPHASIS_FOCUS_KEYS,WARMUP_POOL,COOLDOWN_POOL};', ctx);
  return { api: ctx.__api, ctx };
}

const { api, ctx } = load();
const ALL = [];
Object.entries(api.DB).forEach(([group, list]) => list.forEach(ex => ALL.push({ ...ex, prop: group })));
const GROUPS = Object.keys(api.DB);

// ── exercise-db.js data quality ──────────────────────────────
test('library is non-trivial and names are unique', () => {
  assert.ok(ALL.length > 300, 'expected the full library, got ' + ALL.length);
  const seen = new Map();
  ALL.forEach(ex => {
    const k = ex.name.toLowerCase();
    assert.ok(!seen.has(k), `duplicate "${ex.name}" in ${seen.get(k)} and ${ex.prop}`);
    seen.set(k, ex.prop);
  });
});

test('every exercise has the required fields', () => {
  ALL.forEach(ex => {
    const id = ex.prop + ' / ' + ex.name;
    assert.ok(typeof ex.muscle === 'string' && ex.muscle.trim(), id + ': muscle');
    assert.ok(Array.isArray(ex.focus) && ex.focus.length, id + ': focus');
    assert.ok(Array.isArray(ex.difficulty) && ex.difficulty.length, id + ': difficulty');
    ex.difficulty.forEach(d => {
      assert.ok(['b', 'i', 'a'].includes(d), id + ': bad difficulty ' + d);
      const r = ex.repRange && ex.repRange[d];
      assert.ok(Array.isArray(r) && r.length === 2 && r[0] <= r[1], id + ': repRange.' + d);
    });
    assert.ok(typeof ex.easier === 'string' && ex.easier.trim(), id + ': easier');
    assert.ok(typeof ex.harder === 'string' && ex.harder.trim(), id + ': harder');
    assert.notStrictEqual(ex.easier, ex.name, id + ': easier is the same move');
    assert.notStrictEqual(ex.harder, ex.name, id + ': harder is the same move');
    assert.notStrictEqual(ex.easier, ex.harder, id + ': easier === harder');
    if (ex.cue !== undefined) assert.ok(String(ex.cue).trim().length > 10, id + ': empty cue');
    if (ex.prop === 'resistanceBands') {
      assert.ok(['handle', 'ankle', 'anchor'].includes(ex.rbAttachment), id + ': rbAttachment');
      assert.match(ex.name, /^Cable Band /, id);
    }
    if (ex.prop === 'bands') assert.match(ex.name, /^Mini Band /, id);
  });
});

test('impact is tagged and nothing beginner-tagged is high-impact', () => {
  ALL.forEach(ex => {
    assert.ok(ex.impact === 'high' || ex.impact === 'low', ex.name + ': impact');
    if (ex.difficulty.includes('b')) assert.strictEqual(ex.impact, 'low', ex.name + ' is beginner-tagged but high-impact');
  });
  ['Burpee', 'Jump Squat', 'Jumping Jack', 'High Knee', 'Skater Jump', 'Broad Jump'].forEach(n =>
    assert.strictEqual(api.exIsHighImpact(n), true, n));
  ['Squat Thrust', 'Marching', 'High Knee March', 'Jumping Jack (Step-Out)', 'Bodyweight Squat', 'Mountain Climber'].forEach(n =>
    assert.strictEqual(api.exIsHighImpact(n), false, n));
  assert.strictEqual(api.exIsHighImpact({ name: 'My Custom Tuck Jump' }), true, 'regex fallback for custom moves');
});

test('every easier variant is beginner-safe', () => {
  ALL.forEach(ex => {
    const hit = api.exFind(ex.easier);
    if (hit) {
      assert.ok(hit.ex.difficulty.includes('b'), `${ex.name} → easier "${ex.easier}" is not beginner-tagged`);
      assert.strictEqual(hit.ex.impact, 'low', `${ex.name} → easier "${ex.easier}" is high-impact`);
    } else {
      assert.strictEqual(api.exIsHighImpact(ex.easier), false, `${ex.name} → easier "${ex.easier}" reads as high-impact`);
    }
  });
});

test('warm-up / cool-down pools are well formed', () => {
  [...api.WARMUP_POOL, ...api.COOLDOWN_POOL].forEach(w => {
    assert.ok(w.name && w.note && w.duration >= 15 && w.duration <= 60, JSON.stringify(w));
  });
});

// ── mixed_ability.js: who gets which move ────────────────────
test('beginners never get a high-impact, non-beginner or unavailable move', () => {
  const propSets = [[], ...GROUPS.map(g => [g]), GROUPS];
  propSets.forEach(props => {
    ctx.state.props = props;
    ALL.forEach(ex => {
      if (props.length && !props.includes(ex.prop) && ex.prop !== 'bodyweight') return;
      const m = api.getModForTier(ex, 'b');
      const where = `[${props.join(',')}] ${ex.name} → ${m.move}`;
      assert.ok(m.move, where);
      assert.strictEqual(api.exIsHighImpact(m.move), false, 'high-impact ' + where);
      const hit = api.exFind(m.move);
      if (hit) {
        assert.ok(hit.ex.difficulty.includes('b'), 'not beginner-tagged ' + where);
        assert.ok(hit.group === 'bodyweight' || hit.group === ex.prop || props.includes(hit.group), 'missing equipment ' + where);
      }
    });
  });
  ctx.state.props = [];
});

test('substitutes follow the equipment in the class', () => {
  const dlr = { ...api.exFind('Dumbbell Lateral Raise').ex, prop: 'dumbbells' };
  ctx.state.props = ['dumbbells'];
  const without = api.getModForTier(dlr, 'b');
  assert.doesNotMatch(without.move, /Cable Band/, 'no cable bands in this class');
  assert.ok(without.note, 'same-move fallback explains the scaling');
  ctx.state.props = ['dumbbells', 'resistanceBands'];
  assert.strictEqual(api.getModForTier(dlr, 'b').move, 'Cable Band Lateral Raise');
  ctx.state.props = [];
});

test('advanced gets the progression; intermediate gets the class move', () => {
  const burpee = { ...api.exFind('Burpee').ex, prop: 'bodyweight' };
  assert.strictEqual(api.getModForTier(burpee, 'i').move, 'Burpee');
  assert.strictEqual(api.getModForTier(burpee, 'a').move, 'Burpee + Push-Up');
  const b = api.getModForTier(burpee, 'b');
  assert.strictEqual(b.move, 'Squat Thrust');
  assert.strictEqual(b.changed, true);
  assert.ok(b.label && b.value, 'label/value kept for older callers');
});

test('instructor per-level overrides win', () => {
  const ex = { ...api.exFind('Push-Up').ex, prop: 'bodyweight',
    tierOverride: { beginner: 'Wall Push-Up', intermediate: 'Push-Up (Tempo)', advanced: 'Clap Push-Up' } };
  assert.strictEqual(api.getModForTier(ex, 'b').move, 'Wall Push-Up');
  assert.strictEqual(api.getModForTier(ex, 'i').move, 'Push-Up (Tempo)');
  assert.strictEqual(api.getModForTier(ex, 'a').move, 'Clap Push-Up');
  assert.strictEqual(api.getModForTier(ex, 'b').source, 'override');
  const risky = { ...ex, tierOverride: { beginner: 'Jump Squat' } };
  assert.match(api.getModForTier(risky, 'b').note, /High-impact/, 'unsafe pick is flagged');
});

test('per-level picker lists safe, equipped moves and escapes names', () => {
  ctx.state.props = ['dumbbells'];
  const ex = { ...api.exFind('Dumbbell Goblet Squat').ex, prop: 'dumbbells', name: 'Dumbbell Goblet Squat' };
  const cands = api.maTierCandidates(ex, 'b', 20);
  assert.ok(cands.length >= 3, 'some beginner options');
  cands.forEach(c => {
    assert.ok(['dumbbells', 'bodyweight'].includes(c.group), c.name + ' needs ' + c.group);
    assert.strictEqual(api.exIsHighImpact(c.name), false, c.name);
  });
  const html = api.tierPickerHtml({ ...ex, name: 'X"><img src=x>' }, 0, 'b');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-onchange="setTierOverride\(0,'b',this\.value\)"/);
  ctx.state.props = [];
});

test('timed styles give beginners a shorter work slice', () => {
  ctx.state.workout = { style: 'tabata' };
  const ex = { ...api.exFind('Bodyweight Squat').ex, prop: 'bodyweight', unit: 'work', seconds: 20 };
  assert.deepStrictEqual({ ...api.getTierDisplay(ex, 'b') }, { reps: '15s', unit: 'work', note: 'then rest 5s' });
  assert.strictEqual(api.getTierDisplay(ex, 'i').reps, '20s');
  assert.strictEqual(api.getTierDisplay(ex, 'b', 45).reps, '35s', 'live step duration wins');
  ctx.state.workout = { style: 'standard' };
  const reps = { ...ex, unit: 'reps', seconds: 40 };
  assert.match(api.getTierDisplay(reps, 'b').reps, /^\d+–\d+$/);
  ctx.state.workout = null;
});

test('live zone shows the group\'s own move big and escapes everything', () => {
  const ex = { ...api.exFind('Burpee').ex, prop: 'bodyweight', name: 'Burpee' };
  const html = api.liveZoneHtml(ex, 'b', { group: { count: 2, names: '<b>Sam</b>' } });
  assert.match(html, /class="live-zone-exercise">Squat Thrust</);
  assert.match(html, /Class move: Burpee/);
  assert.match(html, /&lt;b&gt;Sam&lt;\/b&gt;/);
  const evil = api.liveZoneHtml({ ...ex, name: '<img src=x onerror=alert(1)>' }, 'i', {});
  assert.doesNotMatch(evil, /<img/);
});

// ── muscle-map.js: themes ────────────────────────────────────
test('every focus / theme key resolves to real muscle groups', () => {
  Object.entries(api.FOCUS_CONTRACT).forEach(([k, c]) => {
    assert.ok(c.requiredMajors.length, k + ' has no required majors');
    [...c.requiredMajors, ...c.minorPool].forEach(id => assert.ok(api.MUSCLE_GROUPS[id], k + ': unknown muscle ' + id));
  });
  assert.deepStrictEqual([...api.customFocusIds('custom:glutes,bogus,chest')].sort(), ['chest', 'glutes']);
  assert.strictEqual(api.customFocusIds('custom:bogus'), null);
});

test('emphasis themes rank primary-muscle moves first', () => {
  ['chestback', 'shouldersarms', 'quads', 'hips'].forEach(k => {
    ['b', 'i', 'a'].forEach(d => {
      const pool = ALL.filter(ex => ex.difficulty.includes(d) && api.focusMatchStrength(ex, k) > 0);
      const ranked = api.rankFocusCandidates(pool, k, 10);
      assert.ok(ranked.length >= 15, `${k}/${d}: only ${ranked.length} candidates left`);
      assert.ok(ranked.every(ex => api.focusMatchStrength(ex, k) >= 2), `${k}/${d}: secondary-only moves kept`);
    });
  });
  const plank = { ...api.exFind('Plank Shoulder Tap').ex };
  const press = { ...api.exFind('Dumbbell Shoulder Press').ex };
  assert.ok(api.focusMatchStrength(press, 'shouldersarms') > api.focusMatchStrength(plank, 'shouldersarms'));
  const few = api.rankFocusCandidates([plank, press], 'shouldersarms', 5);
  assert.strictEqual(few[0].name, 'Dumbbell Shoulder Press', 'primary first');
  assert.strictEqual(few.length, 2, 'weak moves kept when the strong set is too small');
  const full = [plank, press];
  assert.strictEqual(api.rankFocusCandidates(full, 'full', 5), full, 'non-emphasis themes untouched');
});
