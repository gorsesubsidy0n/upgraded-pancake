/* ══════════════════════════════════════════════════════════════════════
   qr.js — a small, self-contained QR code encoder for the share panels.

   Written for this app so the codes work offline and under the page's
   Content-Security-Policy (no CDN, no image service, nothing leaves the
   device). Follows ISO/IEC 18004: byte mode (UTF-8), versions 1–40, all
   four error-correction levels, Reed–Solomon over GF(256), the eight
   masks scored by the standard's penalty rules. Drawn as inline SVG.

   IHQR.encode(text) → { version, ecl, size, modules } or null (too long)
   IHQR.svg(text)    → '<svg …>' or '' (too long)
   ihShowQRBig(id)   → full-screen code for the text of element #id
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Per version (index 1–40), for L, M, Q, H.
  const ECC_PER_BLOCK = [
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NUM_BLOCKS = [
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const ECL_NAMES = 'LMQH';
  const ECL_FORMAT = [1, 0, 3, 2];

  // Modules left for data + error correction once the fixed patterns are drawn.
  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const dataCodewords = (ver, e) =>
    Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * NUM_BLOCKS[e][ver];

  // ── Reed–Solomon over GF(256), polynomial 0x11D ─────────────────────
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function rsGenerator(deg) {
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const n = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { n[j] ^= g[j]; n[j + 1] ^= gmul(g[j], EXP[i]); }
      g = n;
    }
    return g;
  }
  function rsRemainder(data, gen) {
    const deg = gen.length - 1;
    const msg = data.concat(new Array(deg).fill(0));
    for (let i = 0; i < data.length; i++) {
      const c = msg[i];
      if (c) for (let j = 1; j <= deg; j++) msg[i + j] ^= gmul(gen[j], c);
    }
    return msg.slice(data.length);
  }

  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let p = ver * 4 + 10; r.length < n; p -= step) r.splice(1, 0, p);
    return r;
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
  ];

  function utf8(text) {
    if (typeof TextEncoder === 'function') return Array.from(new TextEncoder().encode(text));
    return Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
  }

  function encode(text, minEcl) {
    const bytes = utf8(String(text == null ? '' : text));
    const lo = Math.max(0, Math.min(3, minEcl | 0));
    // Smallest version that fits at the lowest allowed level keeps the
    // modules as large as possible on screen; then take the strongest
    // level that still fits in that version.
    let ver = 1;
    for (; ver <= 40; ver++) {
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver, lo) * 8) break;
    }
    if (ver > 40) return null;
    const ccBits = ver < 10 ? 8 : 16;
    const used = 4 + ccBits + bytes.length * 8;
    let ecl = lo;
    for (let e = 3; e > lo; e--) if (used <= dataCodewords(ver, e) * 8) { ecl = e; break; }

    // Data bits: mode, length, bytes, terminator, byte padding, pad codewords.
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ccBits); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(ver, ecl) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }

    // Split into blocks, add error correction, interleave.
    const nb = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const numShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const gen = rsGenerator(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const len = shortLen - eccLen + (i < numShort ? 0 : 1);
      const d = data.slice(k, k + len); k += len;
      blocks.push({ d, ecc: rsRemainder(d, gen) });
    }
    const words = [];
    for (let i = 0; i <= shortLen - eccLen; i++) blocks.forEach(b => { if (i < b.d.length) words.push(b.d[i]); });
    for (let i = 0; i < eccLen; i++) blocks.forEach(b => words.push(b.ecc[i]));

    // Fixed patterns.
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Uint8Array(size));
    const fn = Array.from({ length: size }, () => new Uint8Array(size));
    const set = (x, y, dark) => { mod[y][x] = dark ? 1 : 0; fn[y][x] = 1; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = alignPositions(ver), n = al.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    const drawFormat = mask => {
      const v = (ECL_FORMAT[ecl] << 3) | mask;
      let rem = v;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const f = ((v << 10) | rem) ^ 0x5412;
      const b = i => ((f >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, b(i));
      set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const v = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const d = ((v >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3);
        set(a, c, d); set(c, a, d);
      }
    }

    // Data, in the standard two-column zigzag from the bottom right.
    const total = words.length * 8;
    for (let right = size - 1, i = 0; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const up = ((right + 1) & 2) === 0;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = up ? size - 1 - v : v;
        if (!fn[y][x] && i < total) { mod[y][x] = (words[i >>> 3] >>> (7 - (i & 7))) & 1; i++; }
      }
    }

    const applyMask = m => {
      const f = MASKS[m];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && f(x, y)) mod[y][x] ^= 1;
    };
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const s = penalty(mod, size);
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { version: ver, ecl: ECL_NAMES[ecl], mask: best, size, modules: mod };
  }

  function penalty(mod, size) {
    let p = 0, dark = 0;
    const FIND_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], FIND_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const line = get => {
      let color = -1, run = 0;
      const padded = [0, 0, 0, 0];
      for (let i = 0; i < size; i++) {
        const c = get(i);
        padded.push(c);
        if (c === color) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else { color = c; run = 1; }
      }
      padded.push(0, 0, 0, 0);
      for (let k = 0; k + 11 <= padded.length; k++) {
        let a = true, b = true;
        for (let j = 0; j < 11 && (a || b); j++) {
          if (padded[k + j] !== FIND_A[j]) a = false;
          if (padded[k + j] !== FIND_B[j]) b = false;
        }
        if (a || b) p += 40;
      }
    };
    for (let y = 0; y < size; y++) line(x => mod[y][x]);
    for (let x = 0; x < size; x++) line(y => mod[y][x]);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (mod[y][x]) dark++;
      if (x < size - 1 && y < size - 1) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
    }
    p += 10 * Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5);
    return p;
  }

  // One path, merged into horizontal runs, with the 4-module quiet zone.
  function svg(text, label) {
    const q = encode(text);
    if (!q) return '';
    const B = 4, n = q.size + B * 2;
    let d = '';
    for (let y = 0; y < q.size; y++) {
      for (let x = 0; x < q.size;) {
        if (!q.modules[y][x]) { x++; continue; }
        let run = 1;
        while (x + run < q.size && q.modules[y][x + run]) run++;
        d += 'M' + (x + B) + ' ' + (y + B) + 'h' + run + 'v1h-' + run + 'z';
        x += run;
      }
    }
    return '<svg class="ih-qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" ' +
      'shape-rendering="crispEdges" role="img" aria-label="' + (label || 'QR code') + '" ' +
      'data-version="' + q.version + '">' +
      '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  }

  // A QR code of a whole class plan is dense, so the panel's small copy
  // opens full screen: on a laptop or TV that is big enough for any phone
  // camera across the room.
  function showBig(sourceId, caption) {
    const src = typeof document !== 'undefined' && document.getElementById(sourceId);
    const text = src ? src.textContent : '';
    const code = text && svg(text, 'QR code to scan');
    if (!code) return;
    let o = document.getElementById('ih-qr-big');
    if (!o) {
      o = document.createElement('div');
      o.id = 'ih-qr-big';
      o.className = 'qr-modal ih-qr-big';
      document.body.appendChild(o);
      o.addEventListener('click', () => { o.style.display = 'none'; });
    }
    o.innerHTML = '<button class="modal-close qr-close" type="button" aria-label="Close">✕</button>' +
      '<div class="ih-qr-big-code">' + code + '</div>' +
      '<div class="ih-qr-big-cap">' + (caption || 'Point a phone camera at the code') + ' · tap to close</div>';
    o.style.display = 'flex';
  }

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The scan code plus its caption, for a share panel. The text also goes
  // into a hidden #sourceId, which the enlarged view is drawn from, so the
  // small and the big code can never disagree.
  function panelHtml(text, sourceId, caption) {
    const q = encode(text);
    const code = q && svg(text, 'QR code: ' + caption);
    if (!code) {
      return '<div class="ih-qr-wrap"><div class="qr-link-hint">This link is too long for a scan ' +
        'code, so send the link instead.</div></div>';
    }
    return '<div class="ih-qr-wrap">' +
      '<span id="' + sourceId + '" hidden>' + esc(text) + '</span>' +
      '<button class="ih-qr-btn" type="button" aria-label="Show the scan code full screen" ' +
        'data-onclick="ihShowQRBig(\'' + sourceId + '\',\'' + caption + '\')">' + code + '</button>' +
      '<div class="ih-qr-cap">📷 ' + caption + ' · ' +
        (q.version > 12 ? '<b>tap the code to make it big enough to scan</b>' : 'tap to enlarge') +
      '</div></div>';
  }

  const api = { encode, svg, panelHtml };
  if (typeof window !== 'undefined') {
    window.IHQR = api;
    window.ihShowQRBig = showBig;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
