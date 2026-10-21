// ═══════════════════════════════════════════════════════════════
//  ACCESS CODES
//  Two codes: one for instructors (the full builder), one for
//  athletes (their own tracking page and nothing else).
//
//  ─── PLEASE READ ───────────────────────────────────────────
//  This is a doorway, not a vault.
//
//  The app is a set of files with no server behind it, so the code
//  check has to run inside the visitor's own browser. Anyone who
//  knows to open developer tools can read past it. It will keep the
//  public, the curious and search engines out of your class plans.
//  It will not stop someone who is genuinely trying.
//
//  So: don't keep anything in this app you'd be upset to have read.
//  ───────────────────────────────────────────────────────────
//
//  The codes are not written here — only a salted, stretched check
//  value for each (format v3, below), so nobody can read the actual
//  code out of the source and try it somewhere else.
//
//  TO CHANGE A CODE
//  1. Open the app as an instructor
//  2. Tap 🔒 Access Codes on the home screen
//  3. Type the new code — the app gives you a line to copy
//  4. Paste it over the matching line below, save, and re-publish
//     (commit + push, if you're on GitHub Pages)
//
//  Changing a code signs everyone out automatically, on every phone.
// ═══════════════════════════════════════════════════════════════

const AUTH = {
  salt: 'inspire-habits',

  // ── PASTE NEW CODE LINES BELOW THIS LINE ──
  instructor: 'v3$100000$a3ea1f6906b5aba89b28f99e45c3670c$ae1ea61356ab0d407031fb6379441eec9976acaf775ab8f4f6e66834673296bc',
  athlete:    'v3$100000$a0408c9db1aca88a39d5a8e3e344705c$ca3d2b8546fca15ea67c7e8b6517f0795725972dc7ca0f9eba613805607a18c7',
  // ── PASTE NEW CODE LINES ABOVE THIS LINE ──
};

// ── DO NOT EDIT THE NEXT LINE ─────────────────────────────────
// Fingerprints of the codes this app was published with. They exist only
// so the app can warn you while the codes are still public knowledge.
//
// Written on one line, with short key names, entirely on purpose: the
// lines above are `instructor:` and `athlete:`, and if these said the
// same thing then replacing a code line — or a find-and-replace on the
// old hash — would quietly rewrite these too. The warning would then
// switch itself off at the exact moment it was telling the truth.
const AUTH_SHIPPED = Object.freeze({ i: 'e2a80b930b539702b03a32b99acd68f340fbffbc81a46b4a8155dd0b251f9e34', a: 'c0b1a2b3208aef1fa772c83a201cc83e75878e9301d005979ba507c066b8b3cc' });

const AUTH_KEY = 'ih_auth';

// A pasted line that lost a character leaves a hash nothing can ever
// match, which shows up as "my new code doesn't work". A line that lost
// its value entirely would be worse: an empty hash could match an empty
// stored value and let everyone in. Check the shape once, up front.
const IH_HEX64 = /^[0-9a-f]{64}$/;
// v2 line format: v2$<rounds>$<16-byte salt hex>$<PBKDF2 hex>.
const IH_V2 = /^v2\$(\d{4,7})\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
// v3 (what the Access Codes panel generates now):
//   v3$<rounds>$<16-byte salt hex>$<check hex>
//   key   = PBKDF2-SHA256(code, salt, rounds)       — never written anywhere public
//   check = SHA-256("ih-v3|" + hex(key))
// The saved sign-in holds the key itself. The check value in this file can't
// be run backwards to the key, so — unlike v2 and the old format, where
// everything a sign-in record needs is in this file — a v3 sign-in can only
// be made by someone who typed the real code. Codes are compared without
// case, spaces or dashes, so "ABCD-efgh" and "abcdefgh" are the same code
// (phones love to capitalise the first letter).
// The old 64-hex and v2 formats keep working so existing deployments don't
// lock out.
const IH_V3 = /^v3\$(\d{4,7})\$([0-9a-f]{32})\$([0-9a-f]{64})$/;

function ihLineValid(line) {
  return IH_HEX64.test(line || '') || IH_V2.test(line || '') || IH_V3.test(line || '');
}

function ihNormV3(code) {
  return String(code == null ? '' : code).trim().toLowerCase().replace(/[\s\-]+/g, '');
}

function ihV3Check(keyHex) {
  return ihSha256Hex('ih-v3|' + keyHex);
}

function ihCodesValid() {
  return ihLineValid(AUTH.instructor)
      && ihLineValid(AUTH.athlete)
      && AUTH.instructor !== AUTH.athlete;
}

// ─── HASHING ──────────────────────────────────────────────────
// A self-contained SHA-256 rather than crypto.subtle, which only exists
// on https:// and localhost. The README tells instructors they can just
// double-click index.html, and on a file:// URL crypto.subtle is absent —
// so a code generated there would hash differently from the same code
// typed on the published site, and lock the instructor out of their own
// app. One implementation means one answer everywhere.
const IH_K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
];

function ihUtf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(++i) & 0x3ff));
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

function ihSha256Raw(input) {
  const bytes = Array.prototype.slice.call(input);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 64-bit big-endian length. Messages here are tiny, so the high word is 0.
  bytes.push(0, 0, 0, 0,
    (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
             0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let pos = 0; pos < bytes.length; pos += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[pos+i*4] << 24) | (bytes[pos+i*4+1] << 16) |
             (bytes[pos+i*4+2] << 8) | bytes[pos+i*4+3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + IH_K[i] + w[i]) >>> 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0;
    h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
  }
  const out = new Array(32);
  for (let i = 0; i < 8; i++) {
    out[i*4] = h[i] >>> 24; out[i*4+1] = (h[i] >>> 16) & 255;
    out[i*4+2] = (h[i] >>> 8) & 255; out[i*4+3] = h[i] & 255;
  }
  return out;
}

function ihHex(bytes) {
  return Array.prototype.map.call(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function ihSha256Hex(str) {
  return ihHex(ihSha256Raw(ihUtf8Bytes(str)));
}

// ─── PBKDF2-HMAC-SHA256 ───────────────────────────────────────
// Same reasoning as the hash above: crypto.subtle is missing on file://,
// so the stretching is done by hand. 100,000 rounds is below what a
// server would use, but this is a doorway (see the notice at the top) and
// each round costs the *visitor's* phone time too — about a third of a
// second on a laptop, a second or so on an older phone. The sign-in form
// runs it in small slices (ihPbkdf2Async) so the page never freezes.
const IH_PBKDF2_ROUNDS = 100000;

function ihHmac(keyBytes, msgBytes) {
  let key = keyBytes.length > 64 ? ihSha256Raw(keyBytes) : keyBytes.slice();
  while (key.length < 64) key.push(0);
  const ipad = key.map(b => b ^ 0x36), opad = key.map(b => b ^ 0x5c);
  return ihSha256Raw(opad.concat(ihSha256Raw(ipad.concat(msgBytes))));
}

// One SHA-256 block on typed arrays. The generic function above builds
// plain arrays, which is fine for a one-off hash but ~30x too slow to run
// 30,000 times on a phone.
function ihCompress(st, w) {
  for (let i = 16; i < 64; i++) {
    const x = w[i - 15], y = w[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], h = st[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + IH_K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0;
    d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  st[0] += a; st[1] += b; st[2] += c; st[3] += d;
  st[4] += e; st[5] += f; st[6] += g; st[7] += h;
}

const IH_H0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

function ihWords(bytes) {
  const w = new Uint32Array(64);
  for (let i = 0; i < 16; i++) {
    w[i] = (bytes[i*4] << 24) | (bytes[i*4+1] << 16) | (bytes[i*4+2] << 8) | bytes[i*4+3];
  }
  return w;
}

// The work is split into start / step / finish so the same arithmetic can
// run in one go (ihPbkdf2) or a slice at a time (ihPbkdf2Async).
function ihPbkdf2Start(passwordStr, saltBytes) {
  let key = ihUtf8Bytes(passwordStr);
  if (key.length > 64) key = ihSha256Raw(key);
  while (key.length < 64) key.push(0);
  const inner0 = Uint32Array.from(IH_H0), outer0 = Uint32Array.from(IH_H0);
  ihCompress(inner0, ihWords(key.map(b => b ^ 0x36)));
  ihCompress(outer0, ihWords(key.map(b => b ^ 0x5c)));

  const s = {
    inner0, outer0, done: 1,
    u: new Uint32Array(8), acc: new Uint32Array(8),
    st: new Uint32Array(8), w: new Uint32Array(64),
  };
  // U1 has a variable-length message, so take the simple path once.
  const first = ihHmac(ihUtf8Bytes(passwordStr), saltBytes.concat([0, 0, 0, 1]));
  for (let i = 0; i < 8; i++) {
    s.u[i] = (first[i*4] << 24) | (first[i*4+1] << 16) | (first[i*4+2] << 8) | first[i*4+3];
  }
  s.acc.set(s.u);
  return s;
}

function ihPbkdf2Step(s, rounds, n) {
  const { inner0, outer0, u, acc, st, w } = s;
  const end = Math.min(rounds, s.done + n);
  for (let r = s.done; r < end; r++) {
    // HMAC of a 32-byte message: one block inside, one block outside.
    st.set(inner0); w.fill(0); w.set(u); w[8] = 0x80000000; w[15] = 768;
    ihCompress(st, w);
    u.set(st);
    st.set(outer0); w.fill(0); w.set(u); w[8] = 0x80000000; w[15] = 768;
    ihCompress(st, w);
    u.set(st);
    for (let k = 0; k < 8; k++) acc[k] ^= u[k];
  }
  s.done = end;
  return s.done >= rounds;
}

function ihPbkdf2Out(s) {
  const out = [];
  for (let i = 0; i < 8; i++) out.push(s.acc[i] >>> 24, (s.acc[i] >>> 16) & 255, (s.acc[i] >>> 8) & 255, s.acc[i] & 255);
  return out;
}

function ihPbkdf2(passwordStr, saltBytes, rounds) {
  const s = ihPbkdf2Start(passwordStr, saltBytes);
  ihPbkdf2Step(s, rounds, rounds);
  return ihPbkdf2Out(s);
}

// Same result, but hands the page back between slices so a spinner keeps
// turning and taps still register on a slow phone.
const IH_PBKDF2_SLICE = 8000;
function ihPbkdf2Async(passwordStr, saltBytes, rounds) {
  return new Promise((resolve, reject) => {
    let s;
    try { s = ihPbkdf2Start(passwordStr, saltBytes); } catch (e) { reject(e); return; }
    const tick = () => {
      try {
        if (ihPbkdf2Step(s, rounds, IH_PBKDF2_SLICE)) resolve(ihPbkdf2Out(s));
        else setTimeout(tick, 0);
      } catch (e) { reject(e); }
    };
    tick();
  });
}
function ihHash(code) {
  return ihSha256Hex(AUTH.salt + ':' + String(code == null ? '' : code).trim());
}

function ihHexToBytes(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
  return out;
}

// Compare without bailing at the first differing character.
function ihConstEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// null = no match. For a v3 line a match returns the key (hex), which is
// what the saved sign-in holds; older formats return '' on a match.
function ihCodeKey(code, line) {
  const c = String(code == null ? '' : code).trim();
  const m3 = IH_V3.exec(line || '');
  if (m3) {
    const key = ihHex(ihPbkdf2(ihNormV3(c), ihHexToBytes(m3[2]), parseInt(m3[1], 10)));
    return ihConstEq(ihV3Check(key), m3[3]) ? key : null;
  }
  const m = IH_V2.exec(line || '');
  if (m) {
    return ihConstEq(ihHex(ihPbkdf2(c, ihHexToBytes(m[2]), parseInt(m[1], 10))), m[3]) ? '' : null;
  }
  return IH_HEX64.test(line || '') && ihConstEq(ihHash(c), line) ? '' : null;
}

function ihCodeKeyAsync(code, line) {
  const c = String(code == null ? '' : code).trim();
  const m3 = IH_V3.exec(line || '');
  if (m3) {
    return ihPbkdf2Async(ihNormV3(c), ihHexToBytes(m3[2]), parseInt(m3[1], 10))
      .then(k => { const key = ihHex(k); return ihConstEq(ihV3Check(key), m3[3]) ? key : null; });
  }
  const m = IH_V2.exec(line || '');
  if (m) {
    return ihPbkdf2Async(c, ihHexToBytes(m[2]), parseInt(m[1], 10))
      .then(key => ihConstEq(ihHex(key), m[3]) ? '' : null);
  }
  return Promise.resolve(IH_HEX64.test(line || '') && ihConstEq(ihHash(c), line) ? '' : null);
}

function ihCodeMatches(code, line) {
  return ihCodeKey(code, line) !== null;
}

function ihCodeMatchesAsync(code, line) {
  return ihCodeKeyAsync(code, line).then(k => k !== null);
}

function ihRandomBytes(n) {
  const out = [];
  try {
    const buf = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    return Array.prototype.slice.call(buf);
  } catch (e) {
    for (let i = 0; i < n; i++) out.push(Math.floor(Math.random() * 256));
    return out;
  }
}

function ihMakeLine(code) {
  const salt = ihRandomBytes(16);
  const key = ihHex(ihPbkdf2(ihNormV3(code), salt, IH_PBKDF2_ROUNDS));
  return 'v3$' + IH_PBKDF2_ROUNDS + '$' + ihHex(salt) + '$' + ihV3Check(key);
}

// ─── ROLE ─────────────────────────────────────────────────────
// The stored value is the hash of whatever code was typed. Working out
// the role is then just a comparison, and re-issuing a code in auth.js
// invalidates every saved sign-in for free.
let ihRoleCache = null;

// A sign-in normally lives in localStorage. On a shared or borrowed device
// the person can tick "forget me", and it goes to sessionStorage instead,
// which the browser drops when the window closes.
function ihSessionStore() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (e) { return null; }
}

function ihStoredHash() {
  try {
    const v = localStorage.getItem(AUTH_KEY);
    if (v) return v;
  } catch (e) {}
  try { const ss = ihSessionStore(); return (ss && ss.getItem(AUTH_KEY)) || ''; } catch (e) { return ''; }
}

function ihSaveSession(role, shared, key) {
  const rec = ihMakeSession(role, key);
  const ss = ihSessionStore();
  if (shared && ss) {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
    try { ss.setItem(AUTH_KEY, rec); return; } catch (e) {}
  }
  try { localStorage.setItem(AUTH_KEY, rec); } catch (e) {
    // Private mode can refuse localStorage; the tab can still remember.
    try { if (ss) ss.setItem(AUTH_KEY, rec); } catch (e2) {}
  }
}

// What is stored is an expiring session record rather than the code's
// hash, so sign-ins expire and changing a code invalidates every record
// (the MAC is keyed with the line).
//
// Be clear about what an s2 record is NOT: everything that goes into its MAC
// is in this file, so anyone who reads auth.js can mint one for either
// role, and while a code is still in the old 64-hex format the line itself
// is accepted as a saved sign-in (that is how pre-v2 sign-ins keep
// working). That is why v3 exists: an s3 record carries the key only the
// real code produces, and once the instructor line is v3 an s2 instructor
// record is refused. Athletes can still hold an s2 record, because the
// class QR link signs them in without a code (see ihTryLinkToken).
//
// None of this stops someone editing the running JavaScript in their own
// browser — nothing in a page with no server can. It stops the easy ways.
const IH_SESSION_DAYS = { instructor: 30, athlete: 90 };

function ihSessionMac(role, issued) {
  return ihSha256Hex('ih-session|' + role + '|' + issued + '|' + AUTH[role]).slice(0, 32);
}

function ihSessionMac3(role, issued, key) {
  return ihSha256Hex('ih-s3|' + role + '|' + issued + '|' + key + '|' + AUTH[role]).slice(0, 32);
}

function ihMakeSession(role, key) {
  const t = Date.now();
  if (key && /^[0-9a-f]{64}$/.test(key)) {
    return 's3.' + role + '.' + t + '.' + key + '.' + ihSessionMac3(role, t, key);
  }
  return 's2.' + role + '.' + t + '.' + ihSessionMac(role, t);
}

function ihSessionAgeOk(role, issued) {
  // A few minutes of clock drift (phone resyncing its time) must not sign
  // anyone out.
  const age = Date.now() - issued;
  return !(age < -300000 || age > IH_SESSION_DAYS[role] * 86400000);
}

function ihRoleFromSession(s) {
  const m3 = /^s3\.(instructor|athlete)\.(\d+)\.([0-9a-f]{64})\.([0-9a-f]{32})$/.exec(s || '');
  if (m3) {
    const role = m3[1], issued = parseInt(m3[2], 10), key = m3[3];
    const line = IH_V3.exec(AUTH[role] || '');
    if (!line || !ihSessionAgeOk(role, issued)) return null;
    if (!ihConstEq(ihV3Check(key), line[3])) return null;
    return ihConstEq(m3[4], ihSessionMac3(role, issued, key)) ? role : null;
  }
  const m = /^s2\.(instructor|athlete)\.(\d+)\.([0-9a-f]{32})$/.exec(s || '');
  if (!m) return null;
  const role = m[1], issued = parseInt(m[2], 10);
  if (role === 'instructor' && IH_V3.test(AUTH.instructor || '')) return null;
  if (!ihSessionAgeOk(role, issued)) return null;
  return ihConstEq(m[3], ihSessionMac(role, issued)) ? role : null;
}

function ihSessionKey(s) {
  const m = /^s3\.(?:instructor|athlete)\.\d+\.([0-9a-f]{64})\./.exec(s || '');
  return m ? m[1] : '';
}

// Someone who keeps using the app stays signed in: a record more than a
// day old is renewed on load, so only a device left unused for the whole
// period has to sign in again.
function ihSessionNeedsRenewal(s) {
  const m = /^s[23]\.(?:instructor|athlete)\.(\d+)\./.exec(s || '');
  return !!m && Date.now() - parseInt(m[1], 10) > 86400000;
}

function ihRoleFor(stored) {
  if (!stored || !ihCodesValid()) return null;
  const fromSession = ihRoleFromSession(stored);
  if (fromSession) return fromSession;
  // Sign-ins saved by older versions are the raw 64-hex hash. Honour them
  // once so nobody is kicked out by the upgrade; ihRole() re-saves them as
  // a session record. v2 code lines can never equal a raw hash.
  if (IH_HEX64.test(stored)) {
    if (stored === AUTH.instructor) return 'instructor';
    if (stored === AUTH.athlete) return 'athlete';
  }
  return null;
}

function ihRole() {
  if (ihRoleCache) return ihRoleCache;
  const stored = ihStoredHash();
  ihRoleCache = ihRoleFor(stored);
  if (ihRoleCache && (IH_HEX64.test(stored) || ihSessionNeedsRenewal(stored))) {
    let inLocal = false;
    try { inLocal = localStorage.getItem(AUTH_KEY) === stored; } catch (e) {}
    ihSaveSession(ihRoleCache, !inLocal, ihSessionKey(stored));
  }
  return ihRoleCache;
}

function ihIsInstructor() { return ihRole() === 'instructor'; }

function ihUsingShippedCodes() {
  return AUTH.instructor === AUTH_SHIPPED.i
      || AUTH.athlete === AUTH_SHIPPED.a;
}

// Naming the code that's actually still public matters once one of the two
// has been changed — "change both" sends you looking for a problem you
// already fixed, and makes the warning easy to start ignoring.
function ihShippedCodeWarning() {
  const i = AUTH.instructor === AUTH_SHIPPED.i;
  const a = AUTH.athlete === AUTH_SHIPPED.a;
  const which = (i && a) ? 'Both codes are' : i ? 'The instructor code is' : 'The athlete code is';
  const fix   = (i && a) ? 'change both' : 'change it';
  return which + ' still the one this app shipped with. Anyone who has seen ' +
    'the instructions knows ' + ((i && a) ? 'them' : 'it') + ' — ' + fix +
    ' before you rely on this.';
}

// Guessing is throttled per browser: 5 misses, then waits that double
// from 15 seconds up to 2 minutes. An hour after the last wait ends the
// count starts again, so an instructor who fumbles a few times one week
// isn't punished the next. Anyone can clear their own storage, so this only
// slows casual guessing — it is not a substitute for a strong code.
const IH_FAIL_KEY = 'ih_auth_fail';
const IH_FAIL_FREE = 5;
const IH_FAIL_MAX_WAIT = 120000;
const IH_FAIL_RESET_AFTER = 3600000;

function ihFailState() {
  let f;
  try { f = JSON.parse(localStorage.getItem(IH_FAIL_KEY) || 'null'); } catch (e) { f = null; }
  if (!f || typeof f !== 'object') return { n: 0, until: 0, t: 0 };
  f = { n: Number(f.n) || 0, until: Number(f.until) || 0, t: Number(f.t) || 0 };
  const now = Date.now();
  // Old records have no t; fall back to the end of their wait.
  if (now - Math.max(f.until, f.t) > IH_FAIL_RESET_AFTER) return { n: 0, until: 0, t: 0 };
  // A record from an older version (waits up to 15 minutes) or a clock
  // that jumped back never holds anyone for more than the cap.
  if (f.until - now > IH_FAIL_MAX_WAIT) f.until = now + IH_FAIL_MAX_WAIT;
  return f;
}

function ihLockRemainingMs() {
  return Math.max(0, Math.min(IH_FAIL_MAX_WAIT, ihFailState().until - Date.now()));
}

function ihNoteFailure() {
  const f = ihFailState();
  const now = Date.now();
  f.n = (f.n || 0) + 1;
  f.t = now;
  if (f.n >= IH_FAIL_FREE) {
    f.until = now + Math.min(IH_FAIL_MAX_WAIT, 15000 * Math.pow(2, f.n - IH_FAIL_FREE));
  }
  try { localStorage.setItem(IH_FAIL_KEY, JSON.stringify(f)); } catch (e) {}
}

function ihSignedIn(role, shared, key) {
  try { localStorage.removeItem(IH_FAIL_KEY); } catch (e) {}
  ihSaveSession(role, shared, key);
  ihRoleCache = role;
  return role;
}

function ihSignIn(code, shared) {
  if (!ihCodesValid() || ihLockRemainingMs() > 0) return null;
  let role = null, key = ihCodeKey(code, AUTH.instructor);
  if (key !== null) role = 'instructor';
  else if ((key = ihCodeKey(code, AUTH.athlete)) !== null) role = 'athlete';
  if (!role) { ihNoteFailure(); return null; }
  return ihSignedIn(role, shared, key);
}

// The sign-in form uses this one: same answer, but the stretching runs in
// slices so "Checking…" keeps moving. Only one check runs at a time.
let ihSignInBusy = false;
function ihSignInAsync(code, shared) {
  if (ihSignInBusy || !ihCodesValid() || ihLockRemainingMs() > 0) return Promise.resolve(null);
  ihSignInBusy = true;
  return ihCodeKeyAsync(code, AUTH.instructor)
    .then(k => k !== null ? { role: 'instructor', key: k }
      : ihCodeKeyAsync(code, AUTH.athlete).then(a => a !== null ? { role: 'athlete', key: a } : null))
    .then(hit => {
      ihSignInBusy = false;
      if (!hit) { ihNoteFailure(); return null; }
      return ihSignedIn(hit.role, shared, hit.key);
    }, e => { ihSignInBusy = false; throw e; });
}

function ihSignOut() {
  try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  try { const ss = ihSessionStore(); if (ss) ss.removeItem(AUTH_KEY); } catch (e) {}
  ihRoleCache = null;
  location.reload();
}

// ─── AUTO-UNLOCK FROM A CLASS LINK ────────────────────────────
// Typing a code while a class waits is friction nobody needs, so the QR
// code carries a token that unlocks the athlete side on arrival.
//
// The token is a prefix of the athlete hash. That is enough to show the
// link came from this build, and it gives away nothing: a hash cannot be
// run backwards to the code. Re-issuing the athlete code changes the
// hash, so every old link stops unlocking at the same moment.
//
// This is exactly as strong as the athlete code itself — which is to say,
// a doorway. Anyone the link reaches can open the athlete side.
function ihLinkToken() {
  const line = AUTH.athlete || '';
  const m = IH_V3.exec(line) || IH_V2.exec(line);
  return (m ? m[3] : line).slice(0, 16);
}

function ihTryLinkToken() {
  const m = /[#&?]k=([A-Za-z0-9]+)/.exec(location.href || '');
  if (!m) return null;
  const want = ihLinkToken();
  if (!want || m[1] !== want) return null;
  // Store the full hash, so the athlete stays signed in afterwards and a
  // later class link — or the bare site — still knows who they are.
  ihSaveSession('athlete', false);
  ihRoleCache = 'athlete';
  return 'athlete';
}

// Runs before the gate decides anything, so a scanned phone never sees
// the lock screen at all.
if (!ihRole()) ihTryLinkToken();

// ─── THE GATE ─────────────────────────────────────────────────
// The page ships with class="ih-locked" already on <html>, so the app is
// hidden before a single line of script runs. This file's job is to take
// that class *off* once someone has proved who they are.
//
// It is deliberately this way round. If this file ever fails to load or
// throws — a bad paste into AUTH is the likely cause — nothing removes
// the class, so the app stays shut. The old arrangement added the class
// here instead, which meant a syntax error silently unlocked everything.
if (ihRole()) {
  document.documentElement.classList.remove('ih-locked');
} else {
  document.documentElement.classList.add('ih-locked');
}

// An athlete who opens the bare site — no class code in the link — has
// nothing to look at, so send them somewhere that says so kindly rather
// than dropping them into the builder.
function ihAthleteWithoutClass() {
  return ihRole() === 'athlete' && !/[#&?]c=/.test(location.href);
}

// The studio name every sign-in must carry. The password is still the code
// generated in the Access Codes panel.
const IH_STUDIO_NAME = 'IFW';
function ihStudioOk(name) {
  return String(name == null ? '' : name).trim().toUpperCase() === IH_STUDIO_NAME;
}

// Barbell with a heart in the middle. Drawn with currentColor so the
// sign-in screen can set it white on the coloured background.
const IH_LOGO_SVG =
  '<svg class="ih-brand-logo" viewBox="0 0 120 52" role="img" aria-label="Inspire Habits" ' +
    'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="9" width="11" height="28" rx="5.5"/><rect x="15" y="14" width="8" height="18" rx="4"/>' +
    '<rect x="107" y="9" width="11" height="28" rx="5.5"/><rect x="97" y="14" width="8" height="18" rx="4"/>' +
    '<path d="M23 23H43M77 23H97"/>' +
    '<path d="M60 40 45 25C40 20 43 10 52 10C56 10 58 13 60 16C62 13 64 10 68 10C77 10 80 20 75 25Z"/>' +
    '<rect x="62" y="27" width="11" height="11" rx="2.5" transform="rotate(45 67.5 32.5)"/>' +
  '</svg>';

function ihLockScreen() {
  const shipped = ihUsingShippedCodes();
  const broken = !ihCodesValid();
  // Without this, a mangled paste rejects every code with "that code
  // isn't right" — which sends you hunting for the wrong problem.
  if (broken) {
    return '<div class="ih-lock-card">' +
      '<div class="ih-lock-icon">⚠</div>' +
      '<h1>Access codes are damaged</h1>' +
      '<p class="ih-lock-sub">No code can work until this is fixed, so the ' +
        'app is staying shut.</p>' +
      '<div class="ih-lock-warn">One of the two lines between the PASTE ' +
        'markers in <code>auth.js</code> is not a valid code line, or both ' +
        'lines are the same. A line from the Access Codes panel starts with ' +
        '<code>v3$</code> and has four parts split by <code>$</code> ' +
        '(older lines start with <code>v2$</code>, or are 64 characters of ' +
        '<code>0-9</code> and <code>a-f</code>). Keep the quotes and the comma at the end.' +
        '<br><br>Re-copy the line from the Access Codes panel, paste it over ' +
        'the whole old line, and re-publish. No copy of it? See ' +
        '“Forgot a code” in README.md.</div>' +
    '</div>';
  }
  return '<div class="ih-lock-card ih-brandcard">' +
    IH_LOGO_SVG +
    '<div class="ih-brand-word">Inspire Habits</div>' +
    '<p class="ih-lock-sub">Please enter your studio name and password.</p>' +
    '<form id="ih-lock-form" autocomplete="off">' +
      '<input type="text" id="ih-lock-studio" placeholder="Studio name" value="' + IH_STUDIO_NAME + '" ' +
        'aria-label="Studio name" autocomplete="username" autocapitalize="characters" autocorrect="off" spellcheck="false" />' +
      '<input type="password" id="ih-lock-input" placeholder="Password" aria-label="Password" ' +
        'autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" />' +
      (ihSessionStore()
        ? '<label class="ih-lock-shared"><input type="checkbox" id="ih-lock-shared" /> ' +
          'Shared or borrowed device — forget me when this window closes</label>'
        : '') +
      '<button type="submit" id="ih-lock-go">Sign in</button>' +
    '</form>' +
    '<div class="ih-lock-err" id="ih-lock-err" role="alert" aria-live="polite"></div>' +
    '<div class="ih-lock-hint">Athletes: the password is the class code on the screen ' +
      'at the front, or ask your instructor. Scanning the class QR code signs you in ' +
      'without typing.</div>' +
    (shipped ? '<div class="ih-lock-warn">⚠ ' + ihShippedCodeWarning() + '</div>' : '') +
  '</div>';
}

// The live view keeps the last class link an athlete opened, so if the
// tab is closed mid-class they can get back in one tap. It is only
// offered while it could still be today's class, and only if it looks
// exactly like a class link.
const IH_LAST_CLASS_KEY = 'ih_last_class_hash';
const IH_LAST_CLASS_MAX_AGE = 12 * 3600000;
const IH_CLASS_HASH_RE = /^#c=[A-Za-z0-9_\-]+(&[a-z]=[A-Za-z0-9_\-.%]+)*$/;

function ihLastClassHash() {
  let rec;
  try { rec = JSON.parse(localStorage.getItem(IH_LAST_CLASS_KEY) || 'null'); } catch (e) { return ''; }
  if (!rec || typeof rec !== 'object' || typeof rec.hash !== 'string') return '';
  const at = Number(rec.at), age = Date.now() - at;
  if (!isFinite(at) || age < -300000 || age > IH_LAST_CLASS_MAX_AGE) return '';
  return IH_CLASS_HASH_RE.test(rec.hash) && rec.hash.length < 200000 ? rec.hash : '';
}

function ihReopenLastClass() {
  const hash = ihLastClassHash();
  if (!hash) return;
  location.hash = hash;
  location.reload();
}

function ihNoClassScreen() {
  const last = ihLastClassHash();
  return '<div class="ih-lock-card">' +
    '<div class="ih-lock-icon">📱</div>' +
    '<h1>Nothing to track yet</h1>' +
    '<p class="ih-lock-sub">You\'re signed in as an athlete. Open the class link ' +
      'your instructor sends when class starts and your workout appears here.</p>' +
    (last ? '<button type="button" id="ih-lock-reopen" class="ih-lock-reopen">↩ Reopen last class</button>' : '') +
    '<button type="button" id="ih-lock-out" class="ih-lock-secondary">Sign out</button>' +
  '</div>';
}

function ihMountGate() {
  if (document.getElementById('ih-lock')) return;
  const locked = !ihRole();
  const stranded = ihAthleteWithoutClass();
  if (!locked && !stranded) return;

  const el = document.createElement('div');
  el.id = 'ih-lock';
  if (locked && ihCodesValid()) el.className = 'ih-brand';
  el.innerHTML = locked ? ihLockScreen() : ihNoClassScreen();
  document.body.appendChild(el);
  document.documentElement.classList.add('ih-locked');

  const out = document.getElementById('ih-lock-out');
  if (out) out.addEventListener('click', ihSignOut);
  const reopen = document.getElementById('ih-lock-reopen');
  if (reopen) reopen.addEventListener('click', ihReopenLastClass);

  const form = document.getElementById('ih-lock-form');
  if (!form) return;
  const input = document.getElementById('ih-lock-input');
  const err = document.getElementById('ih-lock-err');
  const studio = document.getElementById('ih-lock-studio');
  setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (ihSignInBusy) return;
    const wait = ihLockRemainingMs();
    if (wait > 0) {
      err.textContent = 'Too many tries. Wait ' + Math.ceil(wait / 1000) + ' seconds and try again.';
      return;
    }
    if (studio && !ihStudioOk(studio.value)) {
      err.textContent = 'That studio name or password didn\'t work. Check them and try again.';
      studio.select();
      el.querySelector('.ih-lock-card').classList.remove('shake');
      void el.offsetWidth;
      el.querySelector('.ih-lock-card').classList.add('shake');
      return;
    }
    ihFinishSignIn(el, input, err);
  });
}

function ihSetChecking(on) {
  const go = document.getElementById('ih-lock-go');
  const err = document.getElementById('ih-lock-err');
  if (go) {
    go.disabled = on;
    go.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  if (err && on) {
    err.textContent = '';
    const spin = document.createElement('span');
    spin.className = 'ih-spinner';
    spin.setAttribute('aria-hidden', 'true');
    err.append(spin, document.createTextNode(' Checking…'));
  }
}

function ihFinishSignIn(el, input, err) {
  const sharedBox = document.getElementById('ih-lock-shared');
  const shared = !!(sharedBox && sharedBox.checked);
  ihSetChecking(true);
  ihSignInAsync(input.value, shared).then(role => {
    ihSetChecking(false);
    if (!role) {
      const wait = ihLockRemainingMs();
      err.textContent = wait > 0
        ? 'Too many tries. Wait ' + Math.ceil(wait / 1000) + ' seconds and try again.'
        : 'That studio name or password didn\'t work. Check them and try again.';
      input.select();
      el.querySelector('.ih-lock-card').classList.remove('shake');
      void el.offsetWidth;
      el.querySelector('.ih-lock-card').classList.add('shake');
      return;
    }
    // Private browsing can refuse every kind of storage. Reloading then
    // would land straight back on this screen, forever. Let them in on the
    // spot instead, and say plainly that it won't be remembered.
    if (!ihStoredHash()) {
      el.remove();
      document.documentElement.classList.remove('ih-locked');
      if (typeof showToast === 'function') {
        showToast('Signed in. This browser won\'t remember it — private mode.');
      }
      return;
    }
    // A fresh load is the honest way in: every screen then sets itself
    // up already knowing the role, instead of being retro-fitted.
    location.reload();
  }, e => {
    ihSetChecking(false);
    err.textContent = 'Something went wrong checking that. Please try again.';
    if (typeof console !== 'undefined') console.error(e);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ihMountGate);
} else {
  ihMountGate();
}

// ─── CHANGING THE CODES (instructors only) ────────────────────
// There is no server, so a new code has to be baked into auth.js and
// re-published — otherwise it would only ever apply to this one phone
// and every athlete would still be on the old one. This panel does the
// hashing and hands over a line to paste.
function ihLiveCodeRow(label, hash, shippedHash) {
  const valid = ihLineValid(hash);
  const fmt = IH_V3.exec(hash || '') || IH_V2.exec(hash || '');
  const v3 = IH_V3.test(hash || '');
  const state = !valid ? '<b class="ih-code-bad">damaged</b>'
    : hash === shippedHash ? '<b class="ih-code-bad">still the shipped one</b>'
    : v3 ? '<b class="ih-code-ok">changed · strongest (v3)</b>'
    : fmt ? '<b class="ih-code-warn">changed · v2 — regenerate as v3</b>'
    : '<b class="ih-code-warn">changed · old format — regenerate</b>';
  const id = valid ? (fmt ? fmt[3] : hash).slice(0, 8) : '—';
  return '<div class="ih-code-live-row"><span>' + label + '</span>' +
    '<span>' + state + ' <code>' + id + '…</code></span></div>';
}

function showAccessCodes() {
  if (!ihIsInstructor()) return;
  const modal = document.getElementById('qr-modal');
  const body = document.getElementById('qr-modal-body');
  if (!modal || !body) return;

  body.innerHTML =
    '<h2 class="qr-title">🔒 Access Codes</h2>' +
    '<p class="qr-sub">Two codes get people in: one for instructors, one for ' +
      'athletes. Type a new code below to get the line to paste into ' +
      '<code>auth.js</code>.</p>' +
    (ihUsingShippedCodes()
      ? '<div class="ih-lock-warn">⚠ ' + ihShippedCodeWarning() + '</div>'
      : '') +
    (!IH_V3.test(AUTH.instructor || '') || !IH_V3.test(AUTH.athlete || '')
      ? '<div class="ih-lock-warn ih-code-upgrade">⬆ <b>Upgrade to the v3 format.</b> ' +
          'At least one line in <code>auth.js</code> is in an older format, whose ' +
          'saved sign-ins can be faked by anyone who reads the source. You don\'t ' +
          'have to change the code itself: pick the role, type the <i>same</i> code ' +
          'below, and paste the new <code>v3$…</code> line over the old one. ' +
          '(Everyone signs in once more afterwards.)</div>'
      : '') +
    // If a change doesn't seem to "take", it is nearly always the browser
    // still running a cached copy of the old auth.js. Showing what is
    // actually loaded turns that into something you can see.
    '<div class="ih-code-live">' +
      '<div class="ih-code-live-title">Currently loaded from <code>auth.js</code></div>' +
      ihLiveCodeRow('Instructor', AUTH.instructor, AUTH_SHIPPED.i) +
      ihLiveCodeRow('Athlete', AUTH.athlete, AUTH_SHIPPED.a) +
      '<div class="ih-code-live-hint">Changed a code and still see the old one ' +
        'here? Wait for the <b>Update ready — Reload</b> bar at the bottom of the ' +
        'screen and tap it (it can take a minute after you publish). If it ' +
        'never appears, hard-refresh with <b>Ctrl-Shift-R</b> ' +
        '(<b>Cmd-Shift-R</b> on a Mac).</div>' +
    '</div>' +
    '<div class="ih-codes-row">' +
      '<label for="ih-new-role">Which code</label>' +
      '<select id="ih-new-role" class="ih-code-select">' +
        '<option value="instructor">Instructor — full builder</option>' +
        '<option value="athlete">Athlete — class tracking only</option>' +
      '</select>' +
    '</div>' +
    '<div class="ih-codes-row">' +
      '<label for="ih-new-code">New code</label>' +
      '<input type="text" id="ih-new-code" placeholder="e.g. inspire-spring-26" ' +
        'autocomplete="off" autocapitalize="off" spellcheck="false" />' +
    '</div>' +
    '<button class="qr-btn" id="ih-make-code">Generate the line</button>' +
    '<div id="ih-code-result"></div>' +
    '<hr class="ih-code-rule" />' +
    '<button class="qr-btn secondary" id="ih-sign-out">Sign out of this device</button>';

  modal.style.display = 'flex';

  document.getElementById('ih-sign-out').addEventListener('click', ihSignOut);
  document.getElementById('ih-make-code').addEventListener('click', () => {
    const role = document.getElementById('ih-new-role').value;
    const code = document.getElementById('ih-new-code').value.trim();
    const out = document.getElementById('ih-code-result');
    if (ihNormV3(code).length < 8) {
      out.innerHTML = '<div class="ih-lock-err">Use at least 8 letters or numbers — a few ' +
        'random words joined with dashes is easy to type and hard to guess. ' +
        '(Codes ignore capitals, spaces and dashes.)</div>';
      return;
    }
    out.innerHTML = '<div class="ih-code-steps"><span class="ih-spinner" aria-hidden="true"></span> Working it out…</div>';
    ihCheckNewCode(role, code).then(problem => {
      if (problem) {
        out.innerHTML = '';
        const d = document.createElement('div');
        d.className = 'ih-lock-err';
        d.textContent = problem;
        out.appendChild(d);
        return;
      }
      setTimeout(() => ihShowLine(role, code, out), 30);
    });
  });
}

// A new code must not be one that already means something else: the same
// code for both roles would make every athlete an instructor (the
// instructor line is checked first), and the shipped codes are public.
function ihCheckNewCode(role, code) {
  const other = role === 'instructor' ? 'athlete' : 'instructor';
  const h = ihHash(code);
  if (h === AUTH_SHIPPED.i || h === AUTH_SHIPPED.a) {
    return Promise.resolve('That is one of the codes this app shipped with, which anyone ' +
      'who has seen the instructions knows. Choose a different one.');
  }
  return ihCodeMatchesAsync(code, AUTH[other]).then(same => same
    ? 'That is the current ' + other + ' code. The two codes must be different, ' +
      'or ' + (role === 'athlete' ? 'every athlete would get the instructor builder.' : 'athletes would get the instructor builder.')
    : '', () => '');
}

function ihShowLine(role, code, out) {
    const hash = ihMakeLine(code);
    const pad = role === 'instructor' ? '' : '   ';
    out.innerHTML =
      '<div class="ih-code-out" id="ih-code-line">' +
        role + ':' + pad + " '" + hash + "'," +
      '</div>' +
      '<button class="qr-btn secondary" id="ih-copy-code">📋 Copy the line</button>' +
      '<ol class="ih-code-steps">' +
        '<li>Open <code>auth.js</code></li>' +
        '<li>Paste this over the existing <code>' + role + ':</code> line</li>' +
        '<li>Save, then re-publish — commit and push if you\'re on GitHub Pages</li>' +
      '</ol>' +
      '<div class="ih-code-steps"><b>Everyone gets signed out</b> when you do this, ' +
        'including you, so keep the new code somewhere safe first.</div>';

    document.getElementById('ih-copy-code').addEventListener('click', () => {
      const line = document.getElementById('ih-code-line').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(line);
      const b = document.getElementById('ih-copy-code');
      b.textContent = '✓ Copied';
      setTimeout(() => { b.textContent = '📋 Copy the line'; }, 1600);
    });
}
