// Platform tests: actions.js sandbox, auth.js gate, storage.js restore,
// serve.js path checks. Dependency-free: run with `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), http = require('http');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── actions.js ──────────────────────────────────────────────
function loadActions() {
  const hits = [];
  const spy = name => function () { hits.push(name); };
  const ctx = { console: { error() {} }, Map, Set, Error, Function, parseFloat };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  // Worst case: every dangerous thing is a plain (non-native) function, so
  // only the parser's own rules stand in the way.
  ctx.localStorage = { clear: spy('localStorage.clear'), setItem: spy('localStorage.setItem') };
  ctx.open = spy('open');
  ctx.alert = spy('alert');
  ctx.fetch = spy('fetch');
  ctx.location = { assign: spy('location.assign'), reload: spy('location.reload') };
  const doc = { addEventListener() {}, defaultView: ctx, cookie: '', write: spy('document.write') };
  const el = { nodeType: 1, ownerDocument: doc, focus: spy('el.focus'), getAttribute: () => 'x',
    closest: () => el, setAttribute: spy('el.setAttribute'), parentNode: doc };
  doc.getElementById = () => el;
  doc.querySelector = () => el;
  doc.body = el;
  ctx.document = doc;
  vm.createContext(ctx);
  vm.runInContext(read('actions.js'), ctx);
  vm.runInContext('function appFn(){ __calls.push(Array.prototype.slice.call(arguments)); }', Object.assign(ctx, { __calls: [] }));
  ctx.sneaky = Math.max; // a native function under an app-looking name
  ctx.boundOpen = function () {}.bind(null);
  const run = (src, extra) => {
    const ev = { target: el, key: 'Enter', preventDefault: spy('ev.preventDefault'), stopPropagation() {} };
    try { ctx.IHActions._compile(src)(Object.assign({ el, ev }, extra)); return null; }
    catch (e) { return e.message; }
  };
  return { ctx, run, hits, el };
}

test('actions: crafted attributes cannot reach storage, navigation or built-ins', () => {
  const { run, hits } = loadActions();
  const attacks = [
    "document.defaultView.localStorage.clear()",
    "document.defaultView.open('https://evil.example')",
    "this.ownerDocument.defaultView.open('x')",
    "event.target.ownerDocument.defaultView.localStorage.clear()",
    "this.parentNode.defaultView.localStorage.clear()",
    "document.body.parentNode.defaultView.open('x')",
    "open('x')", "window.open('x')", "self.open('x')", "globalThis.open('x')",
    "localStorage.clear()", "alert(1)", "fetch('/x')", "location.reload()",
    "eval('1')", "Function('return 1')()", "setTimeout('1')",
    "appFn.constructor('return localStorage')().clear()",
    "this.constructor.constructor('x')()", "this.__proto__.focus()",
    "appFn.call(null, 1)", "appFn.apply(null)", "appFn.bind(null)()",
    "document.write('<b>')", "this.setAttribute('data-onclick','open()')",
    "document.getElementById('x').ownerDocument.defaultView.open()",
    "sneaky(1,2)", "boundOpen()", "event.preventDefault.call(null)",
    "document.focus()", "(document).defaultView.open()",
  ];
  for (const a of attacks) {
    hits.length = 0;
    run(a);
    assert.deepStrictEqual(hits, [], a);
  }
});

test('actions: ordinary handlers still work', () => {
  const { ctx, run, hits } = loadActions();
  assert.strictEqual(run("appFn(1,'two',true,null)"), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.__calls.pop())), [1, 'two', true, null]);
  assert.strictEqual(run("if (event.key === 'Enter') appFn(document.getElementById('x').getAttribute('id'))"), null);
  assert.deepStrictEqual(Array.from(ctx.__calls.pop()), ['x']);
  hits.length = 0;
  assert.strictEqual(run('event.preventDefault(); this.focus()'), null);
  assert.deepStrictEqual(hits, ['ev.preventDefault', 'el.focus']);
});

// ── auth.js ─────────────────────────────────────────────────
function stubEl() {
  return new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stubEl()), set: () => true, apply: () => stubEl() });
}
function mapStorage(store) {
  return { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
}
function loadAuth(pre, opts) {
  const store = Object.assign({}, pre || {}), session = {};
  const ctx = {
    console, Math, Date, JSON, parseInt, Uint8Array, Uint32Array, Array, String, Object, Number, RegExp, Error, Promise, isFinite,
    window: { crypto: crypto.webcrypto },
    localStorage: mapStorage(store),
    location: { href: (opts && opts.href) || 'http://x/', hash: '', reload() {} },
    document: { documentElement: stubEl(), body: stubEl(), addEventListener() {}, getElementById() { return null; }, createElement: () => stubEl(), querySelector: () => null },
    setTimeout, clearTimeout,
  };
  if (!opts || opts.session !== false) ctx.sessionStorage = mapStorage(session);
  vm.createContext(ctx);
  vm.runInContext(read('auth.js') + '\n;this.__api={ihPbkdf2,ihPbkdf2Async,ihCodeMatches,ihCodeMatchesAsync,ihMakeLine,' +
    'ihSignIn,ihSignInAsync,AUTH,ihFailState,ihLockRemainingMs,ihRole,ihRoleFromSession,ihMakeSession,' +
    'ihLastClassHash,ihNoClassScreen,ihCheckNewCode,ihLockScreen,resetRole:()=>{ihRoleCache=null;}};', ctx);
  return { api: ctx.__api, store, session };
}

test('auth: async PBKDF2 and code check agree with the sync ones', async () => {
  const { api } = loadAuth();
  const salt = Array.from(crypto.randomBytes(16));
  for (const rounds of [1, 7999, 8000, 8001, 20000]) {
    const a = Buffer.from(api.ihPbkdf2('pw-ü', salt, rounds)).toString('hex');
    const b = Buffer.from(await api.ihPbkdf2Async('pw-ü', salt, rounds)).toString('hex');
    assert.strictEqual(b, a, String(rounds));
  }
  const line = 'v2$4000$' + Buffer.from(salt).toString('hex') + '$' + Buffer.from(api.ihPbkdf2('abc-def-1', salt, 4000)).toString('hex');
  assert.strictEqual(await api.ihCodeMatchesAsync('  abc-def-1 ', line), true);
  assert.strictEqual(await api.ihCodeMatchesAsync('abc-def-2', line), false);
  // Legacy 64-hex lines: the shipped line verifies exactly as the sync path does.
  assert.strictEqual(await api.ihCodeMatchesAsync('wrong', api.AUTH.athlete), api.ihCodeMatches('wrong', api.AUTH.athlete));
});

test('auth: throttle is capped at 2 minutes and decays after an hour', () => {
  const now = Date.now();
  let { api } = loadAuth({ ih_auth_fail: JSON.stringify({ n: 12, until: now + 15 * 60000 }) });
  assert.ok(api.ihLockRemainingMs() <= 120000 && api.ihLockRemainingMs() > 100000, 'old 15-min wait clamped');
  ({ api } = loadAuth({ ih_auth_fail: JSON.stringify({ n: 12, until: now - 2 * 3600000 }) }));
  assert.strictEqual(api.ihFailState().n, 0, 'expired long ago: counter reset');
  assert.strictEqual(api.ihLockRemainingMs(), 0);
  ({ api } = loadAuth({ ih_auth_fail: JSON.stringify({ n: 3, until: 0, t: now - 30 * 60000 }) }));
  assert.strictEqual(api.ihFailState().n, 3, 'recent misses still count');
  ({ api } = loadAuth({ ih_auth_fail: '{not json' }));
  assert.strictEqual(api.ihFailState().n, 0, 'corrupt record ignored');
  ({ api } = loadAuth());
  for (let i = 0; i < 4; i++) assert.strictEqual(api.ihSignIn('wrong-' + i), null);
  assert.strictEqual(api.ihLockRemainingMs(), 0, 'first misses are free');
  api.ihSignIn('wrong-x');
  assert.ok(api.ihLockRemainingMs() > 0 && api.ihLockRemainingMs() <= 15000);
});

test('auth: legacy saved sign-in still unlocks and is upgraded; junk does not', () => {
  const legacy = crypto.randomBytes(32).toString('hex');
  const { api, store } = loadAuth({ ih_auth: legacy });
  api.AUTH.instructor = legacy;
  api.resetRole();
  assert.strictEqual(api.ihRole(), 'instructor');
  assert.match(store.ih_auth, /^s2\.instructor\.\d+\.[0-9a-f]{32}$/);
  assert.strictEqual(loadAuth({ ih_auth: crypto.randomBytes(32).toString('hex') }).api.ihRole(), null);
  assert.strictEqual(loadAuth({ ih_auth: 's2.instructor.' + Date.now() + '.' + '0'.repeat(32) }).api.ihRole(), null);
});

test('auth: v3 codes ignore case/spaces/dashes and save an s3 sign-in', async () => {
  const { api, store } = loadAuth();
  api.AUTH.instructor = api.ihMakeLine('test-coach-code-9');
  api.AUTH.athlete = api.ihMakeLine('test-athlete-7');
  assert.match(api.AUTH.instructor, /^v3\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.strictEqual(api.ihCodeMatches('TEST COACH CODE 9', api.AUTH.instructor), true);
  assert.strictEqual(api.ihCodeMatches('testcoachcode9', api.AUTH.instructor), true);
  assert.strictEqual(api.ihCodeMatches('test-coach-code-8', api.AUTH.instructor), false);
  assert.strictEqual(await api.ihCodeMatchesAsync(' Test-Athlete-7 ', api.AUTH.athlete), true);
  assert.strictEqual(await api.ihSignInAsync('Test-Coach-Code-9'), 'instructor');
  const rec = store.ih_auth;
  assert.match(rec, /^s3\.instructor\.\d+\.[0-9a-f]{64}\.[0-9a-f]{32}$/);
  assert.strictEqual(api.ihRoleFromSession(rec), 'instructor');
  // The key in the record must be the one only the real code produces.
  const parts = rec.split('.');
  const badKey = parts.slice(0, 3).concat('0'.repeat(64), parts[4]).join('.');
  assert.strictEqual(api.ihRoleFromSession(badKey), null, 'forged key rejected');
  const badMac = parts.slice(0, 4).concat('0'.repeat(32)).join('.');
  assert.strictEqual(api.ihRoleFromSession(badMac), null, 'tampered MAC rejected');
  const asAthlete = ['s3', 'athlete'].concat(parts.slice(2)).join('.');
  assert.strictEqual(api.ihRoleFromSession(asAthlete), null, 'instructor key cannot be an athlete record');
  // Records anyone can mint from the source are refused for instructors.
  assert.strictEqual(api.ihRoleFromSession(api.ihMakeSession('instructor')), null, 's2 instructor refused');
  assert.strictEqual(api.ihRoleFromSession(api.ihMakeSession('athlete')), 'athlete', 's2 athlete (QR link) allowed');
  // Pasting the published line as a saved sign-in does nothing.
  const p = loadAuth({ ih_auth: api.AUTH.instructor });
  p.api.AUTH.instructor = api.AUTH.instructor; p.api.AUTH.athlete = api.AUTH.athlete; p.api.resetRole();
  assert.strictEqual(p.api.ihRole(), null);
  // A saved s3 record survives a reload and keeps its key when renewed.
  const r = loadAuth({ ih_auth: rec });
  r.api.AUTH.instructor = api.AUTH.instructor; r.api.AUTH.athlete = api.AUTH.athlete; r.api.resetRole();
  assert.strictEqual(r.api.ihRole(), 'instructor');
});

test('auth: shipped lines are both v3 and distinct', () => {
  const { api } = loadAuth();
  assert.match(api.AUTH.instructor, /^v3\$/);
  assert.match(api.AUTH.athlete, /^v3\$/);
  assert.notStrictEqual(api.AUTH.instructor, api.AUTH.athlete);
});

test('auth: sessions tolerate small clock drift and renew when old', () => {
  const { api } = loadAuth();
  const mk = t => vmSession(api, 'athlete', t);
  assert.strictEqual(api.ihRoleFromSession(mk(Date.now() + 60000)), 'athlete', 'a minute in the future is fine');
  assert.strictEqual(api.ihRoleFromSession(mk(Date.now() + 3600000)), null, 'an hour in the future is not');
  const old = mk(Date.now() - 3 * 86400000);
  const { api: api2, store } = loadAuth({ ih_auth: old });
  assert.strictEqual(api2.ihRole(), 'athlete');
  assert.notStrictEqual(store.ih_auth, old, 'renewed on load');
});
function vmSession(api, role, t) {
  const realNow = Date.now;
  Date.now = () => t;
  try { return api.ihMakeSession(role); } finally { Date.now = realNow; }
}

test('auth: async sign-in, shared-device option and same-code guard', async () => {
  const { api, store, session } = loadAuth();
  api.AUTH.instructor = 'v2$1000$' + '11'.repeat(16) + '$' + Buffer.from(api.ihPbkdf2('coach-code-1', Array(16).fill(0x11), 1000)).toString('hex');
  api.AUTH.athlete = 'v2$1000$' + '22'.repeat(16) + '$' + Buffer.from(api.ihPbkdf2('athlete-code-1', Array(16).fill(0x22), 1000)).toString('hex');
  assert.strictEqual(await api.ihSignInAsync('nope'), null);
  assert.strictEqual(api.ihFailState().n, 1);
  assert.strictEqual(await api.ihSignInAsync('athlete-code-1', true), 'athlete');
  assert.strictEqual(store.ih_auth, undefined, 'shared device: nothing in localStorage');
  assert.match(session.ih_auth, /^s2\.athlete\./);
  assert.strictEqual(api.ihFailState().n, 0, 'success clears the counter');
  assert.strictEqual(await api.ihSignInAsync('coach-code-1'), 'instructor');
  assert.match(store.ih_auth, /^s2\.instructor\./);
  assert.match(await api.ihCheckNewCode('athlete', 'coach-code-1'), /instructor code/);
  assert.match(await api.ihCheckNewCode('instructor', 'athlete-code-1'), /athlete code/);
  assert.strictEqual(await api.ihCheckNewCode('instructor', 'coach-code-1'), '', 'same role, same code: allowed (upgrade)');
  assert.strictEqual(await api.ihCheckNewCode('athlete', 'brand-new-code'), '');
  // Private mode without sessionStorage still signs in.
  const p = loadAuth(null, { session: false });
  p.api.AUTH.athlete = api.AUTH.athlete; p.api.AUTH.instructor = api.AUTH.instructor;
  assert.strictEqual(await p.api.ihSignInAsync('athlete-code-1', true), 'athlete');
});

test('auth: damaged-line message describes both formats', () => {
  const { api } = loadAuth();
  api.AUTH.athlete = 'v2$broken';
  const html = api.ihLockScreen();
  assert.match(html, /v3\$/);
  assert.match(html, /v2\$/);
  assert.match(html, /64 characters/);
});

test('auth: "Reopen last class" only for a recent, well-formed class link', () => {
  const now = Date.now();
  const rec = (hash, at) => ({ ih_last_class_hash: JSON.stringify({ hash, at }) });
  const ok = '#c=AbC_12-3&k=0123abcd&n=Sam%20B';
  assert.strictEqual(loadAuth(rec(ok, now - 3600000)).api.ihLastClassHash(), ok);
  assert.match(loadAuth(rec(ok, now)).api.ihNoClassScreen(), /ih-lock-reopen/);
  assert.strictEqual(loadAuth(rec(ok, now - 13 * 3600000)).api.ihLastClassHash(), '', 'too old');
  for (const bad of ['javascript:alert(1)', '#c=x&k=<img>', '#c=x"onmouseover=1', '#x=1', '#c=', 'https://evil/#c=1']) {
    assert.strictEqual(loadAuth(rec(bad, now)).api.ihLastClassHash(), '', bad);
  }
  assert.strictEqual(loadAuth({ ih_last_class_hash: 'garbage{' }).api.ihLastClassHash(), '');
  assert.doesNotMatch(loadAuth().api.ihNoClassScreen(), /ih-lock-reopen/);
});

// ── storage.js ──────────────────────────────────────────────
function fakeIDB(initial) {
  const data = new Map(Object.entries(initial || {}));
  const later = f => setTimeout(f, 0);
  const os = {
    put(v, k) { data.set(k, v); }, delete(k) { data.delete(k); }, clear() { data.clear(); },
    openCursor() {
      const req = {};
      const keys = Array.from(data.keys());
      let i = 0;
      const step = () => {
        req.result = i < keys.length ? { key: keys[i], value: data.get(keys[i]), continue() { i++; later(step); } } : null;
        req.onsuccess && req.onsuccess();
      };
      later(step);
      return req;
    },
  };
  const db = { transaction: () => ({ objectStore: () => os }) };
  return { data, indexedDB: { open() { const req = { result: db }; later(() => req.onsuccess && req.onsuccess()); return req; } } };
}
function loadStorage(ls, idb) {
  const ctx = { console, JSON, Object, Array, Set, Map, String, Promise, setTimeout, clearTimeout,
    navigator: { userAgent: 'node' }, location: { protocol: 'http:' } };
  ctx.window = ctx;
  ctx.localStorage = mapStorage(ls);
  if (idb) ctx.indexedDB = idb.indexedDB;
  vm.createContext(ctx);
  vm.runInContext(read('storage.js') + '\n;this.__S=IHStore;', ctx);
  return ctx.__S;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('storage: restore never overwrites data saved after the prompt, and merges lists', async () => {
  const ls = { hiit_plans: '[]', hiit_notes: '{}', hiit_cfg: '{}' };
  const idb = fakeIDB({ hiit_plans: '[{"id":1},{"id":2}]', hiit_notes: '{"a":1}', hiit_cfg: '{"x":1}' });
  const S = loadStorage(ls, idb);
  const res = await new Promise(r => S.checkMirror(r));
  assert.strictEqual(res.count, 3);
  // While the restore bar is up, the instructor saves new work.
  S.set('hiit_plans', '[{"id":9}]');
  S.set('hiit_notes', '{"b":2}');
  await wait(700);
  assert.strictEqual(idb.data.get('hiit_plans'), '[{"id":1},{"id":2}]', 'backup kept while undecided');
  const out = S.restoreLost(res.lost);
  assert.deepStrictEqual(JSON.parse(ls.hiit_plans).map(p => p.id), [9, 1, 2], 'merged, newest first');
  assert.strictEqual(ls.hiit_notes, '{"b":2}', 'non-list newer data wins');
  assert.strictEqual(ls.hiit_cfg, '{"x":1}', 'still-lost key restored');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), { restored: 1, merged: 1, kept: 1 });
  await wait(20);
  assert.strictEqual(idb.data.get('hiit_notes'), '{"b":2}', 'queued write reached the mirror after the decision');
  assert.strictEqual(idb.data.get('hiit_plans'), ls.hiit_plans);
});

test('storage: corrupt JSON falls back instead of throwing', () => {
  const S = loadStorage({ hiit_x: '{oops' });
  assert.deepStrictEqual(S.getJSON('hiit_x', []), []);
  assert.strictEqual(S._mergeById('[{"id":1}]', 'nope'), null);
});

// ── serve.js ────────────────────────────────────────────────
test('serve: hidden files and Windows path tricks are refused', () => {
  const { blockedPath } = require(path.join(ROOT, 'serve.js'));
  for (const p of ['/.git/config', '/.GIT/config', '/Tests/app.test.js', '/TESTS/x', '/node_modules/x',
    '/serve.config.json', '/SERVE.CONFIG.JSON', '/serve.config.json.', '/serve.config.json ', '/serve.config.json::$DATA',
    '/GIT~1/config', '/.git./config', '/.env', '/package.json', 'a\\..\\.git\\HEAD']) {
    assert.strictEqual(blockedPath(p), true, p);
  }
  for (const p of ['/index.html', '/app.js', '/icon-192.png', '/manifest.json']) assert.strictEqual(blockedPath(p), false, p);
});

test('serve: handler serves app files with validators and refuses hidden ones', async () => {
  const { handler } = require(path.join(ROOT, 'serve.js'));
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const get = (p, headers, method) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, headers, method: method || 'GET' }, res => {
      let body = ''; res.on('data', d => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
  try {
    const idx = await get('/');
    assert.strictEqual(idx.status, 200);
    assert.match(idx.headers['content-type'], /text\/html/);
    assert.ok(idx.headers.etag);
    assert.strictEqual((await get('/', { 'If-None-Match': idx.headers.etag })).status, 304);
    assert.match((await get('/manifest.json')).headers['content-type'], /json/);
    assert.strictEqual((await get('/index.html', {}, 'HEAD')).body, '');
    for (const p of ['/.GIT/config', '/%2e%2e/%2e%2e/etc/passwd', '/..%5c..%5cWindows%5cwin.ini', '/Tests/app.test.js',
      '/serve.config.json', '/serve.config.json%20', '/serve.config.json.', '/tests%2fplatform.test.js', '/nope.js']) {
      const r = await get(p);
      assert.ok(r.status === 404 || r.status === 403 || r.status === 400, p + ' → ' + r.status);
    }
  } finally {
    server.close();
  }
});
