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
