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
//  The codes are not written here — only salted SHA-256 hashes of
//  them, so nobody can read the actual code out of the source and
//  try it somewhere else.
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
  instructor: 'da2f6d3d9ffabc0b0058ec120c998e0b797425b038a98accd00798a65c9cd694',
  athlete:    '7c39e370175cfc5e9c7cddfea274684faeb6621106c6a7806e0f036f76661562',
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

function ihCodesValid() {
  return IH_HEX64.test(AUTH.instructor || '')
      && IH_HEX64.test(AUTH.athlete || '')
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

function ihSha256Hex(str) {
  const bytes = ihUtf8Bytes(str);
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
  return h.map(x => x.toString(16).padStart(8, '0')).join('');
}

function ihHash(code) {
  return ihSha256Hex(AUTH.salt + ':' + String(code == null ? '' : code).trim());
}

// ─── ROLE ─────────────────────────────────────────────────────
// The stored value is the hash of whatever code was typed. Working out
// the role is then just a comparison, and re-issuing a code in auth.js
// invalidates every saved sign-in for free.
let ihRoleCache = null;

function ihStoredHash() {
  try { return localStorage.getItem(AUTH_KEY) || ''; } catch (e) { return ''; }
}

function ihRoleFor(hash) {
  if (!hash || !ihCodesValid()) return null;
  if (hash === AUTH.instructor) return 'instructor';
  if (hash === AUTH.athlete) return 'athlete';
  return null;
}

function ihRole() {
  if (ihRoleCache) return ihRoleCache;
  ihRoleCache = ihRoleFor(ihStoredHash());
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

function ihSignIn(code) {
  const hash = ihHash(code);
  const role = ihRoleFor(hash);
  if (!role) return null;
  try { localStorage.setItem(AUTH_KEY, hash); } catch (e) {}
  ihRoleCache = role;
  return role;
}

function ihSignOut() {
  try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
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
function ihLinkToken() { return (AUTH.athlete || '').slice(0, 16); }

function ihTryLinkToken() {
  const m = /[#&?]k=([A-Za-z0-9]+)/.exec(location.href || '');
  if (!m) return null;
  const want = ihLinkToken();
  if (!want || m[1] !== want) return null;
  // Store the full hash, so the athlete stays signed in afterwards and a
  // later class link — or the bare site — still knows who they are.
  try { localStorage.setItem(AUTH_KEY, AUTH.athlete); } catch (e) {}
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
        'markers in <code>auth.js</code> is not a valid code line. Each must ' +
        'be 64 characters of <code>0-9</code> and <code>a-f</code>, and the ' +
        'two must differ.<br><br>Re-copy the line from the Access Codes ' +
        'panel, paste it over the whole old line, and re-publish.</div>' +
    '</div>';
  }
  return '<div class="ih-lock-card">' +
    '<div class="ih-lock-icon">⚡</div>' +
    '<h1>Inspire Habits</h1>' +
    '<p class="ih-lock-sub">Enter your access code to continue.</p>' +
    '<form id="ih-lock-form" autocomplete="off">' +
      '<input type="password" id="ih-lock-input" placeholder="Access code" ' +
        'autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" />' +
      '<button type="submit" id="ih-lock-go">Unlock</button>' +
    '</form>' +
    '<div class="ih-lock-err" id="ih-lock-err" role="alert"></div>' +
    '<div class="ih-lock-hint">Athletes: this is the class code on the screen ' +
      'at the front, or ask your instructor.</div>' +
    (shipped ? '<div class="ih-lock-warn">⚠ ' + ihShippedCodeWarning() + '</div>' : '') +
  '</div>';
}

function ihNoClassScreen() {
  return '<div class="ih-lock-card">' +
    '<div class="ih-lock-icon">📱</div>' +
    '<h1>Nothing to track yet</h1>' +
    '<p class="ih-lock-sub">You\'re signed in as an athlete. Open the class link ' +
      'your instructor sends when class starts and your workout appears here.</p>' +
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
  el.innerHTML = locked ? ihLockScreen() : ihNoClassScreen();
  document.body.appendChild(el);
  document.documentElement.classList.add('ih-locked');

  const out = document.getElementById('ih-lock-out');
  if (out) out.addEventListener('click', ihSignOut);

  const form = document.getElementById('ih-lock-form');
  if (!form) return;
  const input = document.getElementById('ih-lock-input');
  const err = document.getElementById('ih-lock-err');
  setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const role = ihSignIn(input.value);
    if (!role) {
      err.textContent = 'That code didn\'t work. Check it and try again.';
      input.select();
      el.querySelector('.ih-lock-card').classList.remove('shake');
      void el.offsetWidth;
      el.querySelector('.ih-lock-card').classList.add('shake');
      return;
    }
    // Private browsing can refuse localStorage. Reloading then would land
    // straight back on this screen, forever. Let them in on the spot
    // instead, and say plainly that it won't be remembered.
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
  const valid = IH_HEX64.test(hash || '');
  const state = !valid ? '<b class="ih-code-bad">damaged</b>'
    : hash === shippedHash ? '<b class="ih-code-bad">still the shipped one</b>'
    : '<b class="ih-code-ok">changed</b>';
  const id = valid ? hash.slice(0, 8) : '—';
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
    // If a change doesn't seem to "take", it is nearly always the browser
    // still running a cached copy of the old auth.js. Showing what is
    // actually loaded turns that into something you can see.
    '<div class="ih-code-live">' +
      '<div class="ih-code-live-title">Currently loaded from <code>auth.js</code></div>' +
      ihLiveCodeRow('Instructor', AUTH.instructor, AUTH_SHIPPED.i) +
      ihLiveCodeRow('Athlete', AUTH.athlete, AUTH_SHIPPED.a) +
      '<div class="ih-code-live-hint">Changed a code and still see “shipped” ' +
        'here? The browser is showing you a cached copy. Hard-refresh with ' +
        '<b>Ctrl-Shift-R</b> (<b>Cmd-Shift-R</b> on a Mac). On GitHub Pages ' +
        'also give the deploy a minute to finish.</div>' +
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
    if (code.length < 4) {
      out.innerHTML = '<div class="ih-lock-err">Use at least 4 characters.</div>';
      return;
    }
    const hash = ihHash(code);
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
  });
}
