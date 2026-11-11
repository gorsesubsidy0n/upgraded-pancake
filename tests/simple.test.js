// Simple class design (simple.js): pure helpers and per-instructor prefs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function loadSimple(extra) {
  const store = {};
  const classes = new Set();
  const ctx = Object.assign({
    console, Math, JSON, parseInt, Array, String, Object, Set, setTimeout,
    document: {
      addEventListener() {}, querySelectorAll: () => [], getElementById: () => null,
      body: { classList: {
        toggle(c, on) { const v = on === undefined ? !classes.has(c) : !!on; if (v) classes.add(c); else classes.delete(c); return v; },
        contains: c => classes.has(c),
      } },
    },
    IHStore: {
      getJSON: (k, d) => (k in store ? JSON.parse(store[k]) : d),
      setJSON: (k, v) => { store[k] = JSON.stringify(v); },
    },
  }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(read('simple.js') + '\n;this.__api={ihFavouriteStyles,ihSanitizePrefs,ihMoreSummary,ihDiffKey,ihPrefsKey,ihGetPrefs,ihSetAdvanced,ihRememberClass,IH_CORE_STYLES};', ctx);
  return { api: ctx.__api, store, classes };
}

const { api } = loadSimple();

test('favourite styles: core four plus last-used', () => {
  const fav = s => Array.from(api.ihFavouriteStyles(s));
  assert.deepStrictEqual(fav(), ['random', 'circuit', 'tabata', 'emom']);
  assert.deepStrictEqual(fav('pyramid'), ['random', 'circuit', 'tabata', 'emom', 'pyramid']);
  assert.deepStrictEqual(fav('tabata'), ['random', 'circuit', 'tabata', 'emom']);
  assert.deepStrictEqual(fav('nonsense'), ['random', 'circuit', 'tabata', 'emom']);
});

test('difficulty key normalises labels', () => {
  assert.strictEqual(api.ihDiffKey('b'), 'b');
  assert.strictEqual(api.ihDiffKey('Advanced'), 'a');
  assert.strictEqual(api.ihDiffKey('x'), null);
  assert.strictEqual(api.ihDiffKey(null), null);
});

test('sanitize prefs clamps and drops invalid fields', () => {
  const out = api.ihSanitizePrefs({
    advanced: true,
    last: {
      participants: 99, duration: 2, warmupDuration: 6, difficulty: 'zzz', style: 'hack',
      includeWarmup: false, includeCooldown: 'yes',
      props: ['dumbbells', 'dumbbells', 'unknown', 7], muscle: 'legs',
    },
  }, ['dumbbells', 'mat'], m => m === 'legs');
  assert.strictEqual(out.advanced, true);
  assert.strictEqual(out.last.participants, 16);
  assert.strictEqual(out.last.duration, 5);
  assert.ok(!('warmupDuration' in out.last));
  assert.ok(!('difficulty' in out.last));
  assert.ok(!('style' in out.last));
  assert.strictEqual(out.last.includeWarmup, false);
  assert.ok(!('includeCooldown' in out.last));
  assert.deepStrictEqual(Array.from(out.last.props), ['dumbbells']);
  assert.strictEqual(out.last.muscle, 'legs');
});

test('sanitize prefs keeps valid values and rejects bad input', () => {
  const ok = api.ihSanitizePrefs({ last: { warmupDuration: 10, difficulty: 'i', style: 'emom', muscle: 'arms' } }, null, () => false);
  assert.strictEqual(ok.last.warmupDuration, 10);
  assert.strictEqual(ok.last.difficulty, 'i');
  assert.strictEqual(ok.last.style, 'emom');
  assert.ok(!('muscle' in ok.last));
  assert.strictEqual(ok.advanced, false);
  for (const bad of [null, 'x', 42, []]) {
    const o = api.ihSanitizePrefs(bad);
    assert.strictEqual(o.advanced, false);
    assert.strictEqual(Object.keys(o.last).length, 0);
  }
});

test('more-options summary', () => {
  assert.strictEqual(api.ihMoreSummary({ difficulty: 'b', warmupDuration: 5, props: ['mat'] }), 'Beginner · 5-min warm-up · cool-down · 1 prop');
  assert.strictEqual(api.ihMoreSummary({ includeWarmup: false, includeCooldown: false, props: ['a', 'b'] }), 'Intermediate · no warm-up · no cool-down · 2 props');
  assert.strictEqual(api.ihMoreSummary(), 'Intermediate · 7-min warm-up · cool-down · 0 props');
});

test('prefs are stored per instructor and advanced mode persists', () => {
  const { api: a, store, classes } = loadSimple({ currentInstructorId: () => 'jo' });
  assert.strictEqual(a.ihPrefsKey(), 'hiit_profile_jo_prefs');
  a.ihSetAdvanced(true);
  assert.ok(classes.has('ih-advanced'));
  assert.strictEqual(JSON.parse(store.hiit_profile_jo_prefs).advanced, true);
  a.ihRememberClass({ participants: 6, difficulty: 'a', duration: 30, style: 'tabata', props: ['mat'], includeWarmup: true, includeCooldown: true, warmupDuration: 7, muscle: 'custom' });
  const p = a.ihGetPrefs();
  assert.strictEqual(p.advanced, true);
  assert.strictEqual(p.last.style, 'tabata');
  assert.strictEqual(p.last.participants, 6);
  assert.strictEqual(p.last.muscle, 'custom');

  const { api: shared } = loadSimple();
  assert.strictEqual(shared.ihPrefsKey(), 'hiit_profile_shared_prefs');
});

test('simple mode markup is wired up', () => {
  const html = read('index.html');
  for (const id of ['ih-advanced-chk', 'ih-more-toggle', 'ih-more-summary', 'ih-quick-btn', 'ih-more-styles-btn', 'plan-more-btn', 'plan-more']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.ok(/<script src="simple\.js"><\/script>\s*<script src="boot\.js">/.test(html), 'simple.js loads before boot.js');
  const css = read('style.css');
  assert.ok(css.includes('body:not(.ih-advanced):not(.ih-more-open) .ih-more'));
});
