// Scan-code (QR) encoder tests for qr.js. Dependency-free: run with `npm test`.
// The golden hashes below are of matrices that were checked module for
// module against the Python `qrcode` reference encoder (same version, level
// and mask) and decoded back to the exact text by ZXing.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const QR = require(path.join(ROOT, 'qr.js'));

// Deterministic URL-safe filler, so the long cases need no fixture files.
function filler(n) {
  let s = '', x = 7;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    s += 'abcdefghijklmnopqrstuvwxyz0123456789-_'[x % 38];
  }
  return s;
}
const hashOf = q => crypto.createHash('sha256')
  .update(q.modules.map(r => Array.from(r).join('')).join('\n')).digest('hex');

const GOLDEN = [
  ['https://example.github.io/inspire-habits/', 0, 3, 'M', 4, '16f32e6be15c5a4c8b40beea1a17cfd6dd50780ea69dd9c1ec3f78ccb1567bf0'],
  ['Ünïcödé ✓ café 🏋️', 0, 2, 'L', 2, 'c7f0ff65e77303cfbbd667ab574b6e9091c967f22aa10d46fa9d1f201c84797d'],
  ['x'.repeat(100), 2, 8, 'Q', 0, 'd727cbf84d36ca1db423db6eb862b24c68dda1572c44bd7bdc6ac3dd98316a68'],
  ['https://example.github.io/inspire-habits/#c=' + filler(1200) + '&k=0123abcd', 0, 25, 'L', 2, '75c9711398f66e99bdeac69d97179b6179f71bd54d04df8c06b63688953577cd'],
  [filler(2953), 0, 40, 'L', 2, '68eb303f4aa3a7fda7c37d6e0d744a463722fec4c955f6586c8e6f535669dd2b'],
  [filler(500), 3, 24, 'H', 6, 'ed8a31cdfa1c1aa7bb842e64384d0186927081127b9340468c93122dd0888e04'],
];

test('matrices match the reference encoder', () => {
  for (const [text, minEcl, version, ecl, mask, hash] of GOLDEN) {
    const q = QR.encode(text, minEcl);
    const what = text.length + ' chars';
    assert.ok(q, what + ' should encode');
    assert.deepStrictEqual([q.version, q.ecl, q.mask], [version, ecl, mask], what);
    assert.strictEqual(q.size, 17 + 4 * version, what);
    assert.strictEqual(hashOf(q), hash, what);
  }
});

test('capacity: 2953 bytes is the most a code holds', () => {
  assert.strictEqual(QR.encode(filler(2953)).version, 40);
  assert.strictEqual(QR.encode(filler(2954)), null);
  assert.strictEqual(QR.svg(filler(2954)), '');
  assert.match(QR.panelHtml(filler(2954), 'x', 'Scan'), /send the link instead/);
});

test('finder patterns and timing lines are in place', () => {
  const q = QR.encode('https://example.github.io/inspire-habits/#c=' + filler(700));
  const m = (x, y) => q.modules[y][x];
  for (const [ox, oy] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]]) {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
        assert.strictEqual(m(ox + i, oy + j), ring === 2 ? 0 : 1, 'finder at ' + ox + ',' + oy);
      }
    }
  }
  for (let i = 8; i < q.size - 8; i++) {
    assert.strictEqual(m(i, 6), i % 2 ? 0 : 1);
    assert.strictEqual(m(6, i), i % 2 ? 0 : 1);
  }
  assert.strictEqual(m(8, q.size - 8), 1, 'dark module');
});

test('svg is well formed, black on white, with a quiet zone', () => {
  const text = 'https://example.github.io/inspire-habits/';
  const q = QR.encode(text), out = QR.svg(text, 'Test');
  const n = q.size + 8;
  assert.match(out, new RegExp('^<svg class="ih-qr-svg" [^>]*viewBox="0 0 ' + n + ' ' + n + '"'));
  assert.match(out, /<rect width="\d+" height="\d+" fill="#fff"\/><path fill="#000" d="M4 4h7v1h-7z/);
  assert.match(out, /<\/svg>$/);
  // Painted area equals the dark-module count.
  let painted = 0, dark = 0;
  for (const m of out.matchAll(/h(\d+)v1/g)) painted += +m[1];
  for (const r of q.modules) for (const v of r) dark += v;
  assert.strictEqual(painted, dark);
});

test('panel button handler runs through actions.js', () => {
  const html = QR.panelHtml('https://example.github.io/inspire-habits/#c=abc', 'qr-url', 'Athletes scan this with their phone camera');
  const expr = html.match(/data-onclick="([^"]*)"/)[1];
  const calls = [], errors = [];
  const noop = () => {};
  const win = { ihShowQRBig: (...a) => calls.push(a) };
  const ctx = { window: win, document: { addEventListener: noop }, console: { error: m => errors.push(String(m)) }, Map, Error, parseFloat };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'actions.js'), 'utf8'), ctx);
  win.IHActions._compile(expr)({ el: {}, ev: { target: {}, preventDefault: noop, stopPropagation: noop } });
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(calls, [['qr-url', 'Athletes scan this with their phone camera']]);
  assert.match(html, /tap to enlarge/);
  // The enlarged view is drawn from this hidden copy of the text.
  assert.match(html, /<span id="qr-url" hidden>https:\/\/example\.github\.io\/inspire-habits\/#c=abc<\/span>/);
  assert.match(QR.panelHtml('a"<b>&', 'x', 'c'), /<span id="x" hidden>a&quot;&lt;b&gt;&amp;<\/span>/);
});

// ── QR Builder styling and payloads ──────────────────────────────────────
const URL1 = 'https://example.github.io/inspire-habits/';
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('every shape, eye and frame combination renders an SVG', () => {
  for (const body of QR.BODY_SHAPES) for (const eyeFrame of QR.EYE_FRAMES)
    for (const eyeCenter of QR.EYE_CENTERS) for (const frame of QR.FRAMES) {
      const r = QR.render(URL1, { body, eyeFrame, eyeCenter, frame, caption: 'Join', bannerText: 'Scan' });
      const what = [body, eyeFrame, eyeCenter, frame].join('/');
      assert.ok(r, what);
      assert.match(r.svg, /^<svg class="ih-qr-svg" [^>]*viewBox="0 0 [\d.]+ [\d.]+"/, what);
      assert.match(r.svg, /<\/svg>$/, what);
      assert.doesNotMatch(r.svg, /NaN|undefined/, what);
    }
  assert.strictEqual(QR.render(filler(2954), {}), null);
});

test('unknown options and colours fall back safely', () => {
  const r = QR.render(URL1, { body: 'x"><script>', fg: 'red;"', bg: 'javascript:', logo: 'data:text/html,<b>' });
  assert.doesNotMatch(r.svg, /<script|javascript:|text\/html|red;/);
  assert.match(r.svg, /fill="#ffffff"/);
  assert.strictEqual(r.readback, null);
});

test('text in banners and captions is escaped', () => {
  const r = QR.render(URL1, { frame: 'banner', bannerText: '<b>&"', caption: '<i>"x"</i>' });
  assert.doesNotMatch(r.svg, /<b>|<i>/);
  assert.match(r.svg, /&lt;B&gt;&amp;&quot;/);
});

test('a logo forces the strongest error correction and is graded', () => {
  const plain = QR.render(URL1, {});
  assert.strictEqual(plain.ecl, 'M');
  for (const size of Object.keys(QR.LOGO_SIZES)) {
    const r = QR.render(URL1, { logo: LOGO, logoSize: size });
    assert.strictEqual(r.ecl, 'H', size);
    assert.ok(r.readback && r.readback.budget === 30, size);
    assert.ok(['good', 'risky', 'likely to fail'].includes(r.readback.verdict), size);
    assert.ok(r.svg.includes(LOGO), size);
  }
  const small = QR.render(URL1, { logo: LOGO, logoSize: 'small' }).readback.pct;
  const large = QR.render(URL1, { logo: LOGO, logoSize: 'large' }).readback.pct;
  assert.ok(small < large);
});

test('low-contrast colours are warned about', () => {
  assert.deepStrictEqual(QR.colorWarnings({ fg: '#000000', bg: '#ffffff', eyeColor: '#000000' }), []);
  assert.ok(QR.colorWarnings({ fg: '#dddddd', bg: '#ffffff', eyeColor: '#dddddd' }).length > 0);
  assert.ok(QR.colorWarnings({ fg: '#ffffff', bg: '#000000', eyeColor: '#ffffff' }).length > 0, 'inverted');
  assert.ok(QR.contrast('#000000', '#ffffff') > 20);
});

test('class share codes stay classic until a style is saved', () => {
  assert.strictEqual(QR.shareSvg(URL1, 'L'), QR.svg(URL1, 'L'));
  assert.strictEqual(QR.shareSvg(URL1, 'L', null), QR.svg(URL1, 'L'));
});

test('a saved share style is read from the page-wide IHStore', () => {
  // storage.js declares IHStore with const, so it is a global binding, not window.IHStore.
  const style = { body: 'dots', eyeFrame: 'square', eyeCenter: 'square', fg: '#7a1f3d', eyeColor: '#000000', bg: '#ffffff' };
  const ctx = vm.createContext({ window: {}, IHStore: { getJSON: k => (k === QR.SHARE_KEY ? style : null) } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'qr.js'), 'utf8'), ctx);
  assert.match(ctx.window.IHQR.shareSvg(URL1, 'L'), /fill="#7a1f3d"/);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'qr-builder.js'), 'utf8'), /window\.IHStore\.\w+\(/);
});

test('class share codes keep their shapes scannable', () => {
  const style = { body: 'dots', eyeFrame: 'circle', eyeCenter: 'leaf', fg: '#7a1f3d', eyeColor: '#d63d00', bg: '#ffffff' };
  const small = QR.shareSvg(URL1, 'L', style);
  assert.match(small, /fill="#7a1f3d"/);
  assert.doesNotMatch(small, /shape-rendering="crispEdges"/, 'dots kept at a small version');
  const longText = URL1 + '#c=' + filler(600);
  assert.ok(QR.encode(longText).version > QR.SAFE_BODY_MAX_VERSION);
  assert.match(QR.shareSvg(longText, 'L', style), /shape-rendering="crispEdges"/, 'square modules when dense');
  const pale = QR.shareSvg(URL1, 'L', Object.assign({}, style, { fg: '#eeeeee', eyeColor: '#eeeeee' }));
  assert.match(pale, /fill="#000000"/);
  assert.match(pale, /fill="#ffffff"/);
  assert.doesNotMatch(pale, /#eeeeee/);
});

test('payloads build the standard formats', () => {
  const P = QR.payload;
  assert.strictEqual(P.url('contoso.com/a').text, 'https://contoso.com/a');
  assert.strictEqual(P.url('http://x.io').text, 'http://x.io');
  assert.throws(() => P.url(''), /Enter a web address/);
  assert.throws(() => P.url('a b.com'), /space/);
  assert.throws(() => P.url('notaurl'), /doesn't look like/);
  assert.strictEqual(P.wifi({ ssid: 'My;Net', password: 'p:a,s"s\\word', auth: 'WPA' }).text,
    'WIFI:T:WPA;S:My\\;Net;P:p\\:a\\,s\\"s\\\\word;;');
  assert.strictEqual(P.wifi({ ssid: 'Gym', auth: 'WPA2', password: 'longenough', hidden: true }).text,
    'WIFI:T:WPA;S:Gym;P:longenough;H:true;;');
  const open = P.wifi({ ssid: 'Gym', auth: 'nopass', password: 'ignored' });
  assert.strictEqual(open.text, 'WIFI:T:nopass;S:Gym;;');
  assert.strictEqual(open.notes.length, 1);
  assert.strictEqual(P.wifi({ ssid: 'Gym', auth: 'WPA', password: 'short' }).notes.length, 1);
  assert.throws(() => P.wifi({ ssid: 'Gym', auth: 'WPA2-Enterprise', password: 'x' }), /enterprise/);
  assert.throws(() => P.wifi({ ssid: 'Gym', auth: 'WPA' }), /password/);
  assert.throws(() => P.wifi({ ssid: ' ' }), /network name/);
  assert.strictEqual(P.email({ email: 'a@b.co', subject: 'Hi there', body: 'x&y' }).text,
    'mailto:a@b.co?subject=Hi%20there&body=x%26y');
  assert.throws(() => P.email({ email: 'nope' }), /valid email/);
  assert.strictEqual(P.phone({ phone: '+1 555 0100' }).text, 'tel:+1 555 0100');
  assert.throws(() => P.phone({ phone: '1\n2' }), /line breaks/);
  assert.strictEqual(P.sms({ phone: '555', body: 'See you' }).text, 'SMSTO:555:See you');
  assert.strictEqual(P.text({ text: 'Hello' }).text, 'Hello');
  assert.throws(() => P.text({ text: '  ' }), /Enter some text/);
});

test('the builder is wired into the page, cache and access rules', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /data-onclick="ihShowQRBuilder\(\)"/);
  assert.ok(html.indexOf('src="qr.js"') < html.indexOf('src="qr-builder.js"'));
  assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'qr-builder\.js'/);
  const src = fs.readFileSync(path.join(ROOT, 'qr-builder.js'), 'utf8');
  assert.match(src, /ihIsInstructor\(\)/, 'instructors only');
  assert.doesNotMatch(src, /\bon(click|change|input|load)="/, 'no inline handlers under the CSP');
});
