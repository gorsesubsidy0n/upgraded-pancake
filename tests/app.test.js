// Dependency-free tests: run with `npm test` (Node 20+).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SOURCES = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));

test('every script parses', () => {
  SOURCES.forEach(f => assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f));
});

// ── auth.js ──────────────────────────────────────────────────
function stubEl() {
  const el = new Proxy(function () {}, { get: (t, k) => (k === 'style' || k === 'classList' ? stubEl() : k === Symbol.toPrimitive ? () => '' : stubEl()), set: () => true, apply: () => stubEl() });
  return el;
}
function loadAuth() {
  const store = {};
  const ctx = {
    console, Math, Date, JSON, parseInt, Uint8Array, Uint32Array, Array, String, Object, Number, RegExp, Error, Promise,
    window: { crypto: crypto.webcrypto },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { href: 'http://x/', hash: '', reload() {} },
    document: { documentElement: stubEl(), body: stubEl(), addEventListener() {}, getElementById() { return null; }, createElement: () => stubEl(), querySelector: () => null },
    setTimeout, clearTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(read('auth.js') + '\n;this.__api={ihPbkdf2,ihCodeMatches,ihMakeLine,ihSha256Hex,ihSignIn,AUTH,ihFailState,ihStudioOk,IH_STUDIO_NAME};', ctx);
  return { api: ctx.__api, store };
}

test('PBKDF2 matches node:crypto', () => {
  const { api } = loadAuth();
  const bytes = Array.from(crypto.randomBytes(16));
  for (const pw of ['a', 'correct horse battery staple', 'x'.repeat(70), 'ünïcödé ✓']) {
    const want = crypto.pbkdf2Sync(Buffer.from(pw, 'utf8'), Buffer.from(bytes), 3000, 32, 'sha256').toString('hex');
    const got = Buffer.from(api.ihPbkdf2(pw, bytes, 3000)).toString('hex');
    assert.strictEqual(got, want, pw);
  }
});

test('SHA-256 matches node:crypto', () => {
  const { api } = loadAuth();
  assert.strictEqual(api.ihSha256Hex('abc'), crypto.createHash('sha256').update('abc').digest('hex'));
});

test('v3 lines verify, wrong codes fail', () => {
  const { api } = loadAuth();
  const line = api.ihMakeLine('my-secret-1');
  assert.match(line, /^v3\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.strictEqual(api.ihCodeMatches('my-secret-1', line), true);
  assert.strictEqual(api.ihCodeMatches('my-secret-2', line), false);
});

test('failed sign-ins are counted', () => {
  const { api } = loadAuth();
  assert.strictEqual(api.ihSignIn('definitely-wrong'), null);
  assert.strictEqual(api.ihFailState().n, 1);
});

test('studio name must be IFW, ignoring case and spaces', () => {
  const { api } = loadAuth();
  assert.strictEqual(api.IH_STUDIO_NAME, 'IFW');
  ['IFW', 'ifw', '  Ifw '].forEach(n => assert.strictEqual(api.ihStudioOk(n), true, n));
  ['', 'IF', 'IFWX', 'XYZ', null, undefined].forEach(n => assert.strictEqual(api.ihStudioOk(n), false, String(n)));
});

// ── actions.js: every data-on* expression in the app must compile ──
test('all data-on* handler expressions parse', () => {
  const errors = [];
  const noop = () => {};
  const win = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/i.test(k) ? noop : undefined)), set: (t, k, v) => { t[k] = v; return true; } });
  const ctx = { window: win, document: { addEventListener: noop, getElementById: () => ({ value: '' }) }, console: { error: m => errors.push(String(m)) }, Map, Error, parseFloat };
  vm.createContext(ctx);
  vm.runInContext(read('actions.js'), ctx);
  const re = /data-on(?:click|change|input|keydown)=(["'])((?:\\.|(?!\1).)*)\1/g;
  let n = 0;
  for (const f of fs.readdirSync(ROOT).filter(x => /\.(html|js)$/.test(x) && x !== 'actions.js')) {
    let m; const src = read(f);
    while ((m = re.exec(src))) {
      let expr = m[2].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\\'/g, "'");
      expr = expr.replace(/'\s*\+\s*[^+]*?\s*\+\s*'/g, 'X').replace(/\$\{[^}]*\}/g, '1');
      n++; errors.length = 0;
      try { win.IHActions._compile(expr)({ el: { checked: true }, ev: { target: {}, preventDefault: noop, stopPropagation: noop } }); } catch (e) { errors.push(e.message); }
      const fatal = errors.filter(e => /cannot run/.test(e));
      assert.deepStrictEqual(fatal, [], f + ': ' + expr);
    }
  }
  assert.ok(n > 100, 'expected to find the migrated handlers, found ' + n);
});

test('no inline event handlers or inline scripts remain in index.html', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /\son(click|change|input|keydown|submit|load|error)\s*=/i);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i);
});

test('service worker caches every script index.html loads', () => {
  const html = read('index.html'), sw = read('sw.js');
  for (const m of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(sw.includes("'" + m[1] + "'"), m[1] + ' missing from sw.js SHELL');
});

// The CSP blocks inline handlers, so markup built in JS must use data-on* too.
test('no inline on*= handlers in JS-generated markup', () => {
  for (const f of SOURCES.filter(x => x !== 'actions.js')) {
    const bad = read(f).match(/[\s'"]on(click|change|input|keydown)=/g);
    assert.strictEqual(bad, null, f + ' builds an inline handler the CSP will block');
  }
});

// ── app.js + muscle-map.js in a stubbed browser ──────────────
function loadApp() {
  const store = {};
  const ctx = {
    console, Math, Date, JSON, parseInt, parseFloat, isNaN, Uint8Array, Array, String, Object, Number, RegExp, Error, Promise, Map, Set,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { href: 'http://x/', hash: '' },
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => stubEl(), documentElement: stubEl(), body: stubEl() },
    navigator: {}, setTimeout, clearTimeout, setInterval() {}, addEventListener() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['storage.js', 'muscle-map.js', 'exercise-db.js', 'app.js']) {
    const extra = f === 'app.js'
      ? '\n;this.__api={state,propStatus,propCapacity,propUsable,propUserCapped,normalizeProp,loadInventory,rebuildPropMaps,muscleFocus,muscleRegion,MUSCLE_FOCUS,MUSCLE_REGIONS,DB,USER_CAP_SLOTS};' : '';
    vm.runInContext(read(f) + extra, ctx, { filename: f });
  }
  const api = ctx.__api;
  api.state.inventory = api.loadInventory();
  api.rebuildPropMaps();
  return { api, ctx };
}

test('cable bands and sliders cap at 3 people for the whole class', () => {
  const { api } = loadApp();
  for (const id of ['resistanceBands', 'sliders']) {
    api.state.participants = 3;
    assert.strictEqual(api.propStatus(id), 'ok', id + ' with 3');
    api.state.participants = 12;
    assert.strictEqual(api.propStatus(id), 'limited', id + ' with 12 must rotate, not be dropped');
    assert.strictEqual(api.propCapacity(id), 3, id);
    assert.ok(api.propUsable(id));
  }
  api.state.participants = 12;
  assert.strictEqual(api.propStatus('dumbbells'), 'ok', 'uncapped gear is unaffected');
});

test('maxUsers survives a save, clears with 0, and old inventories get the default', () => {
  const { api } = loadApp();
  assert.strictEqual(api.normalizeProp('sliders', { qty: 8 }).maxUsers, 3, 'old saved inventory');
  assert.strictEqual(api.normalizeProp('sliders', { qty: 8, maxUsers: 0 }).maxUsers, 0, '0 means no cap');
  assert.strictEqual(api.normalizeProp('sliders', { qty: 8, maxUsers: '5' }).maxUsers, 5);
  api.state.inventory.sliders = api.normalizeProp('sliders', { qty: 8, maxUsers: 0 });
  api.state.participants = 6;
  assert.strictEqual(api.propStatus('sliders'), 'ok');
});

test('a smaller qty than the cap still limits (cap never raises supply)', () => {
  const { api } = loadApp();
  api.state.inventory.resistanceBands = api.normalizeProp('resistanceBands', { qty: 2, share: 'station', maxUsers: 3 });
  api.state.participants = 10;
  assert.strictEqual(api.propCapacity('resistanceBands'), 2);
});

test('muscle themes: old keys still resolve, new ones have contracts', () => {
  const { api, ctx } = loadApp();
  for (const k of ['full', 'upper', 'lower', 'core', 'cardio', 'push', 'pull', 'glutes', 'chestback', 'shouldersarms', 'quads', 'hips']) {
    assert.ok(api.MUSCLE_FOCUS[k], k);
    const c = ctx.getFocusContract(k);
    assert.ok(c.requiredMajors.length > 0, k + ' needs a major');
    assert.ok(ctx.getBalanceContract(k).pairs, k);
  }
  for (const [region, r] of Object.entries(api.MUSCLE_REGIONS)) r.emphasis.forEach(k => assert.strictEqual(api.muscleRegion(k), region, k));
  assert.strictEqual(api.muscleRegion('glutes'), 'lower');
  assert.strictEqual(api.muscleRegion('nonsense'), 'full');
});

test('custom muscle key: round-trips, splits majors and minors, ignores junk', () => {
  const { api, ctx } = loadApp();
  const key = ctx.makeCustomFocusKey(['biceps', 'glutes', 'chest', 'bogus', 'chest']);
  assert.strictEqual(key, 'custom:chest,glutes,biceps');
  assert.deepStrictEqual(Array.from(ctx.customFocusIds(key)), ['chest', 'glutes', 'biceps']);
  const c = ctx.getFocusContract(key);
  assert.deepStrictEqual(Array.from(c.requiredMajors), ['chest', 'glutes']);
  assert.deepStrictEqual(Array.from(c.minorPool), ['biceps']);
  assert.strictEqual(api.muscleFocus(key).keys.length, 0, 'tags must not let a whole region in');
  assert.match(api.muscleFocus(key).label, /^Custom/);
  assert.strictEqual(ctx.makeCustomFocusKey(['bogus']), '');
  assert.strictEqual(ctx.customFocusIds('custom'), null);
  assert.strictEqual(api.muscleRegion(key), 'custom');
  assert.strictEqual(api.muscleRegion('custom'), 'custom');
  assert.strictEqual(ctx.getFocusContract('custom').requiredMajors.length, 7, 'empty custom falls back to full body');
  const pairs = ctx.getBalanceContract('custom:chest,back').pairs;
  assert.strictEqual(pairs.length, 1);
});

test('every custom muscle has exercises that target it', () => {
  const { api, ctx } = loadApp();
  const all = Object.values(api.DB).flat();
  Object.keys(ctx.MUSCLE_GROUPS).forEach(id => {
    const hits = all.filter(ex => ctx.resolveMuscles(ex).primary.includes(id));
    assert.ok(hits.length >= 2, id + ' has only ' + hits.length + ' primary exercises');
  });
});

// ── remote.js (instructor phone hand-off) ────────────────────
function loadRemote() {
  const win = { addEventListener() {} };
  const sandbox = {
    window: win, console, Math, JSON, parseInt, encodeURIComponent, decodeURIComponent,
    escape, unescape, btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: { addEventListener() {} }, location: { hash: '' },
  };
  vm.createContext(sandbox);
  vm.runInContext(read('remote.js'), sandbox, { filename: 'remote.js' });
  return win;
}

test('phone link codec round-trips text, unicode and large plans', () => {
  const r = loadRemote();
  const big = JSON.stringify({ v: 1, w: { exercises: Array.from({ length: 400 }, (_, i) => ({ n: 'Squat ' + i, c: 'Drive through the heels — keep chest up', t: [i, i * 2] })) } });
  ['', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Pull-up → chin over bar · 30s “work” 💪 Škoda', big].forEach(s => {
    const packed = r.ihLzPack(s);
    assert.match(packed, /^[A-Za-z0-9_-]*$/, 'url safe');
    assert.strictEqual(r.ihLzUnpack(packed), s);
  });
  assert.ok(r.ihLzPack(big).length < big.length, 'compresses');
});

test('phone link seekTo lands on the right interval', () => {
  const r = loadRemote();
  const seq = [{ duration: 30 }, { duration: 10 }, { duration: 30 }];
  assert.deepStrictEqual({ ...r.ihSeekTo(seq, 0) }, { idx: 0, left: 30 });
  assert.deepStrictEqual({ ...r.ihSeekTo(seq, 29) }, { idx: 0, left: 1 });
  assert.deepStrictEqual({ ...r.ihSeekTo(seq, 30) }, { idx: 1, left: 10 });
  assert.deepStrictEqual({ ...r.ihSeekTo(seq, 69) }, { idx: 2, left: 1 });
  assert.deepStrictEqual({ ...r.ihSeekTo(seq, 40) }, { idx: 2, left: 30 });
  assert.strictEqual(r.ihSeekTo(seq, 70), null);
});
