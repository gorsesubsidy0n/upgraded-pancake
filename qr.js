/* ══════════════════════════════════════════════════════════════════════
   qr.js — a small, self-contained QR code encoder for the share panels.

   Written for this app so the codes work offline and under the page's
   Content-Security-Policy (no CDN, no image service, nothing leaves the
   device). Follows ISO/IEC 18004: byte mode (UTF-8), versions 1–40, all
   four error-correction levels, Reed–Solomon over GF(256), the eight
   masks scored by the standard's penalty rules. Drawn as inline SVG.

   IHQR.encode(text) → { version, ecl, size, modules } or null (too long)
   IHQR.svg(text)    → '<svg …>' or '' (too long) — classic black on white
   IHQR.render(text, opts) → { svg, version, ecl, warnings, readback } —
                       shaped modules/eyes, colours, logo, frame, caption
                       (the QR Builder, qr-builder.js)
   IHQR.payload.*    → Wi-Fi / email / phone / SMS / URL / text payloads
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
    const code = text && shareSvg(text, 'QR code to scan');
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
    const code = q && shareSvg(text, 'QR code: ' + caption);
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

  // ── Styled codes (QR Builder) ─────────────────────────────────────────
  // Same encoder, drawn with shaped modules, shaped finder "eyes", colours,
  // an optional centre logo, frame and caption. Every option list below is
  // also what the builder offers, so an unknown value falls back to the
  // first (plainest) entry rather than producing a broken code.
  const BODY_SHAPES = ['square', 'rounded', 'dots', 'diamond', 'small-squares', 'fluid',
    'vertical-bars', 'horizontal-bars'];
  // Diamond eyes were dropped: scanners failed to find them in testing.
  const EYE_FRAMES = ['square', 'rounded', 'extra-rounded', 'circle', 'leaf'];
  const EYE_CENTERS = ['square', 'rounded', 'extra-rounded', 'circle', 'leaf'];
  const FRAMES = ['none', 'box', 'rounded-box', 'banner'];
  const LOGO_SIZES = { small: 0.15, medium: 0.22, large: 0.28 };
  // How much of the code each error-correction level can lose and still read.
  const EC_CAPACITY = { L: 7, M: 15, Q: 25, H: 30 };
  // Above this version modules are small enough that shaped (non-square)
  // modules start costing scans from across a room, so share codes go square.
  const SAFE_BODY_MAX_VERSION = 10;
  const SHARE_KEY = 'hiit_qr_style';
  const HEX = /^#[0-9a-f]{6}$/i;
  const LOGO_DATA = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;
  const r2 = v => Math.round(v * 100) / 100;
  const pick = (v, list) => (list.indexOf(v) >= 0 ? v : list[0]);
  const hex = (v, dflt) => (HEX.test(v || '') ? v.toLowerCase() : dflt);

  // Clockwise rounded rectangle; c = [top-left, top-right, bottom-right, bottom-left] radii.
  function rr(x, y, w, h, c) {
    const [tl, tr, br, bl] = c.map(v => Math.max(0, Math.min(v, w / 2, h / 2)));
    const arc = (r, ex, ey) => (r ? 'A' + r2(r) + ' ' + r2(r) + ' 0 0 1 ' + r2(ex) + ' ' + r2(ey) : '');
    return 'M' + r2(x + tl) + ' ' + r2(y) +
      'H' + r2(x + w - tr) + arc(tr, x + w, y + tr) +
      'V' + r2(y + h - br) + arc(br, x + w - br, y + h) +
      'H' + r2(x + bl) + arc(bl, x, y + h - bl) +
      'V' + r2(y + tl) + arc(tl, x + tl, y) + 'Z';
  }
  function circ(cx, cy, r) {
    return 'M' + r2(cx - r) + ' ' + r2(cy) + 'a' + r2(r) + ' ' + r2(r) + ' 0 1 1 ' + r2(2 * r) +
      ' 0a' + r2(r) + ' ' + r2(r) + ' 0 1 1 ' + r2(-2 * r) + ' 0Z';
  }
  function diamond(cx, cy, h) {
    return 'M' + r2(cx) + ' ' + r2(cy - h) + 'L' + r2(cx + h) + ' ' + r2(cy) + 'L' + r2(cx) + ' ' +
      r2(cy + h) + 'L' + r2(cx - h) + ' ' + r2(cy) + 'Z';
  }
  // One finder part (7×7 frame, 5×5 hole or 3×3 centre) in the chosen shape.
  function eyeShape(kind, x, y, w, leaf) {
    if (kind === 'circle') return circ(x + w / 2, y + w / 2, w / 2);
    if (kind === 'leaf') return rr(x, y, w, w, leaf.map(on => (on ? 0.32 * w : 0)));
    const r = kind === 'rounded' ? 0.25 * w : kind === 'extra-rounded' ? 0.42 * w : 0;
    return rr(x, y, w, w, [r, r, r, r]);
  }

  // WCAG relative luminance and contrast ratio for #rrggbb colours.
  function lum(h) {
    const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function colorWarnings(o) {
    const bg = hex(o.bg, '#ffffff'), fg = hex(o.fg, '#000000'), eye = hex(o.eyeColor, fg);
    const out = [];
    [['code', fg], ['eye', eye]].forEach(([label, c]) => {
      if (label === 'eye' && c === fg) return;
      if (lum(c) > lum(bg)) {
        out.push(label[0].toUpperCase() + label.slice(1) + ' color is lighter than the background ' +
          '(inverted) - many scanners fail on inverted codes');
      } else if (contrast(c, bg) < 4) {
        out.push('Low contrast for the ' + label + ' (' + contrast(c, bg).toFixed(1) +
          ':1) - aim for 4:1 or higher');
      }
    });
    return out;
  }

  // Greedy word wrap using an average-character-width estimate.
  function wrap(text, maxChars) {
    const lines = [];
    let line = '';
    String(text).split(/\s+/).filter(Boolean).forEach(w => {
      if (!line) line = w;
      else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
      else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines;
  }

  function render(text, opts) {
    const o = opts || {};
    const warnings = [];
    const logo = typeof o.logo === 'string' && LOGO_DATA.test(o.logo) ? o.logo : '';
    // A logo hides modules, so it always gets the strongest error correction.
    const q = encode(text, logo ? 3 : Math.max(0, Math.min(3, o.minEcl | 0)));
    if (!q) return null;
    const body = pick(o.body, BODY_SHAPES);
    const eyeFrame = pick(o.eyeFrame, EYE_FRAMES);
    const eyeCenter = pick(o.eyeCenter, EYE_CENTERS);
    const frame = pick(o.frame, FRAMES);
    const bg = hex(o.bg, '#ffffff'), fg = hex(o.fg, '#000000');
    const eyeColor = hex(o.eyeColor, fg), frameColor = hex(o.frameColor, fg);
    colorWarnings({ bg, fg, eyeColor }).forEach(w => warnings.push(w));

    const n = q.size, B = 4, u = 10, W = (n + 2 * B) * u;
    const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

    let plate = null, readback = null;
    if (logo) {
      const ls = (LOGO_SIZES[o.logoSize] || LOGO_SIZES.medium) * n * u;
      const ps = ls + 2 * u, p0 = (W - ps) / 2;
      plate = { x: p0, s: ps, ls };
    }
    const covered = (x, y) => {
      if (!plate) return false;
      const cx = (B + x + 0.5) * u, cy = (B + y + 0.5) * u;
      return cx > plate.x && cx < plate.x + plate.s && cy > plate.x && cy < plate.x + plate.s;
    };
    const dark = (x, y) => x >= 0 && y >= 0 && x < n && y < n && q.modules[y][x] &&
      !inFinder(x, y) && !covered(x, y);

    if (plate) {
      let hidden = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && covered(x, y)) hidden++;
      const pct = hidden * 100 / (n * n - 147), budget = EC_CAPACITY[q.ecl];
      readback = {
        pct: Math.round(pct * 10) / 10, budget,
        verdict: pct <= 0.5 * budget ? 'good' : pct <= 0.8 * budget ? 'risky' : 'likely to fail'
      };
      if (readback.verdict !== 'good') {
        warnings.push('The logo covers ' + readback.pct + '% of the code (' + budget +
          '% is the most it can lose) - ' + (readback.verdict === 'risky'
          ? 'try a smaller logo' : 'use a smaller logo or it may not scan'));
      }
    }

    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!dark(x, y)) continue;
        const x0 = (B + x) * u, y0 = (B + y) * u, cx = x0 + u / 2, cy = y0 + u / 2;
        if (body === 'square') {
          let run = 1;
          while (dark(x + run, y)) run++;
          d += 'M' + x0 + ' ' + y0 + 'h' + run * u + 'v' + u + 'h-' + run * u + 'z';
          x += run - 1;
        } else if (body === 'rounded') {
          const i = 0.04 * u;
          d += rr(x0 + i, y0 + i, u - 2 * i, u - 2 * i, [0.3 * u, 0.3 * u, 0.3 * u, 0.3 * u]);
        } else if (body === 'dots') {
          d += circ(cx, cy, u / 2 - 0.06 * u);
        } else if (body === 'diamond') {
          d += diamond(cx, cy, 0.56 * u);
        } else if (body === 'small-squares') {
          const i = 0.12 * u;
          d += rr(x0 + i, y0 + i, u - 2 * i, u - 2 * i, [0, 0, 0, 0]);
        } else if (body === 'fluid') {
          d += circ(cx, cy, u / 2);
          if (dark(x + 1, y)) d += rr(cx, y0, u, u, [0, 0, 0, 0]);
          if (dark(x, y + 1)) d += rr(x0, cy, u, u, [0, 0, 0, 0]);
        } else {
          const r = u / 2 - 0.1 * u, vert = body === 'vertical-bars';
          d += circ(cx, cy, r);
          if (vert && dark(x, y + 1)) d += rr(cx - r, cy, 2 * r, u, [0, 0, 0, 0]);
          if (!vert && dark(x + 1, y)) d += rr(cx, cy - r, u, 2 * r, [0, 0, 0, 0]);
        }
      }
    }

    let eyesFrame = '', eyesCenter = '';
    [[0, 0, [true, false, true, false]], [n - 7, 0, [false, true, false, true]],
      [0, n - 7, [false, true, false, true]]].forEach(([ox, oy, leaf]) => {
      const X = (B + ox) * u, Y = (B + oy) * u;
      eyesFrame += eyeShape(eyeFrame, X, Y, 7 * u, leaf) + eyeShape(eyeFrame, X + u, Y + u, 5 * u, leaf);
      eyesCenter += eyeShape(eyeCenter, X + 2 * u, Y + 2 * u, 3 * u, leaf);
    });

    // Frame and banner around the code (the quiet zone stays inside it).
    let t = 0, pad = 0, bh = 0;
    if (frame !== 'none') {
      t = Math.max(0.6 * u, W / 45);
      pad = 2 * t;
      if (frame === 'banner') bh = 0.16 * W;
    }
    const OW = W + 2 * (pad + t), OH = frame === 'none' ? W : OW + bh;
    const codeAt = t + pad;

    let capLines = [], capFs = 0;
    const caption = String(o.caption || '').trim();
    if (caption) {
      capFs = W / 18;
      const fit = fs => wrap(caption, Math.max(4, Math.floor(OW * 0.92 / (0.55 * fs))));
      capLines = fit(capFs);
      while (capLines.length > 2 && capFs > W / 36) {
        capFs = Math.max(W / 36, capFs * 0.9);
        capLines = fit(capFs);
      }
      if (capLines.length > 1) warnings.push('The caption wraps onto ' + capLines.length + ' lines');
    }
    const lineH = 1.25 * capFs;
    const TH = OH + (capLines.length ? 1.8 * capFs + lineH * (capLines.length - 1) : 0);
    const font = 'font-family="Arial, Helvetica, sans-serif"';

    let out = '<svg class="ih-qr-svg" xmlns="http://www.w3.org/2000/svg" ' +
      'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + r2(OW) + ' ' + r2(TH) + '"' +
      (o.px ? ' width="' + Math.round(o.px) + '" height="' + Math.round(o.px * TH / OW) + '"' : '') +
      ' role="img" aria-label="' + esc(o.label || 'QR code') + '" data-version="' + q.version + '">' +
      '<rect width="' + r2(OW) + '" height="' + r2(TH) + '" fill="' + bg + '"/>';
    if (frame !== 'none') {
      const r = frame === 'rounded-box' ? W / 12 : frame === 'banner' ? W / 24 : 0;
      const innerBottom = frame === 'banner' ? W + 2 * pad + t : OH - t;
      out += '<path fill="' + frameColor + '" d="' + rr(0, 0, OW, OH, [r, r, r, r]) + '"/>' +
        '<path fill="' + bg + '" d="' + rr(t, t, OW - 2 * t, innerBottom - t,
          [Math.max(0, r - t), Math.max(0, r - t), Math.max(0, r - t), Math.max(0, r - t)]) + '"/>';
      if (frame === 'banner') {
        const label = (String(o.bannerText || '').trim() || 'SCAN ME').toUpperCase();
        let fs = 0.5 * bh, fitAttr = '';
        const max = 0.85 * OW;
        if (label.length * 0.62 * fs > max) {
          fs = Math.max(0.3 * bh, max / (label.length * 0.62));
          if (label.length * 0.62 * fs > max) {
            fitAttr = ' textLength="' + r2(max) + '" lengthAdjust="spacingAndGlyphs"';
            warnings.push('The banner text is long, so it has been squeezed to fit');
          }
        }
        out += '<text x="' + r2(OW / 2) + '" y="' + r2(innerBottom + (OH - innerBottom) / 2) + '" ' + font +
          ' font-weight="700" font-size="' + r2(fs) + '" fill="' + bg + '" text-anchor="middle" ' +
          'dominant-baseline="central"' + fitAttr + '>' + esc(label) + '</text>';
      }
    }
    out += '<g transform="translate(' + r2(codeAt) + ' ' + r2(codeAt) + ')">' +
      '<path fill="' + fg + '"' + (body === 'square' ? ' shape-rendering="crispEdges"' : '') +
        ' d="' + d + '"/>' +
      '<path fill="' + eyeColor + '" fill-rule="evenodd" d="' + eyesFrame + '"/>' +
      '<path fill="' + eyeColor + '" d="' + eyesCenter + '"/>';
    if (plate) {
      const off = plate.x + (plate.s - plate.ls) / 2;
      out += '<path fill="' + bg + '" d="' + rr(plate.x, plate.x, plate.s, plate.s, [u, u, u, u]) + '"/>' +
        '<image x="' + r2(off) + '" y="' + r2(off) + '" width="' + r2(plate.ls) + '" height="' +
        r2(plate.ls) + '" preserveAspectRatio="xMidYMid meet" href="' + logo + '" xlink:href="' +
        logo + '"/>';
    }
    out += '</g>';
    capLines.forEach((line, i) => {
      out += '<text x="' + r2(OW / 2) + '" y="' + r2(OH + 1.25 * capFs + i * lineH) + '" ' + font +
        ' font-size="' + r2(capFs) + '" fill="' + fg + '" text-anchor="middle">' + esc(line) + '</text>';
    });
    out += '</svg>';
    return { svg: out, version: q.version, ecl: q.ecl, warnings, readback };
  }

  function styledSvg(text, opts) {
    const r = render(text, opts);
    return r ? r.svg : '';
  }

  // The style the instructor saved for class share codes. Only shape and
  // colour carry over - logos, frames and captions are for the builder's
  // own downloads - and anything that could cost a scan is undone here.
  function shareStyle() {
    try {
      // storage.js declares IHStore with const, so it is not on window.
      const S = typeof IHStore !== 'undefined' ? IHStore
        : (typeof window !== 'undefined' ? window.IHStore : null);
      const s = S && S.getJSON(SHARE_KEY, null);
      return s && typeof s === 'object' ? s : null;
    } catch (e) { return null; }
  }
  function shareSvg(text, label, style) {
    const s = style === undefined ? shareStyle() : style;
    if (!s) return svg(text, label);
    const q = encode(text);
    if (!q) return '';
    const o = { body: s.body, eyeFrame: s.eyeFrame, eyeCenter: s.eyeCenter,
      fg: s.fg, eyeColor: s.eyeColor, bg: s.bg, label };
    if (q.version > SAFE_BODY_MAX_VERSION) o.body = 'square';
    if (colorWarnings(o).length) { o.fg = '#000000'; o.eyeColor = '#000000'; o.bg = '#ffffff'; }
    return styledSvg(text, o) || svg(text, label);
  }

  // Payloads for the builder's code types. Each returns { text, notes } or
  // throws an Error whose message can be shown as is.
  const wifiEsc = s => String(s || '').replace(/([\\;,:"])/g, '\\$1');
  const WIFI_AUTH = { WPA: 'WPA', WPA2: 'WPA', WPA3: 'WPA', 'WPA/WPA2': 'WPA', 'WPA2/WPA3': 'WPA',
    'WPA-PSK': 'WPA', 'WPA2-PSK': 'WPA', 'WPA3-PSK': 'WPA', 'WPA-PERSONAL': 'WPA', 'WPA2-PERSONAL': 'WPA',
    'WPA3-PERSONAL': 'WPA', SAE: 'WPA', WEP: 'WEP', NOPASS: 'nopass', NONE: 'nopass', OPEN: 'nopass' };
  const ENTERPRISE = ['EAP', 'ENTERPRISE', '802.1X', '8021X', 'RADIUS', 'PEAP', 'TTLS', 'LEAP'];
  const oneLine = (v, what) => {
    const s = String(v || '').trim();
    if (/[\r\n]/.test(s)) throw new Error('The ' + what + ' can\'t contain line breaks.');
    return s;
  };
  const payload = {
    url(raw) {
      let s = String(raw || '').trim();
      if (!s) throw new Error('Enter a web address.');
      if (/\s/.test(s)) throw new Error('The web address contains a space, so the code would open a broken link.');
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      let host = '';
      try { host = new URL(s).hostname; } catch (e) { throw new Error('"' + raw + '" isn\'t a valid web address.'); }
      if (host.indexOf('.') < 0 && host !== 'localhost') {
        throw new Error('"' + raw + '" doesn\'t look like a web address (expected something like contoso.com).');
      }
      return { text: s, notes: [] };
    },
    wifi(f) {
      const ssid = String(f.ssid || '');
      if (!ssid.trim()) throw new Error('Enter the Wi-Fi network name.');
      const raw = String(f.auth || 'WPA').trim(), key = raw.replace(/\s+/g, '').toUpperCase();
      let auth = WIFI_AUTH[key];
      if (!auth) {
        if (ENTERPRISE.some(t => key.indexOf(t) >= 0)) {
          throw new Error('"' + raw + '" is an enterprise (work/school login) Wi-Fi type. Wi-Fi codes only ' +
            'support personal networks: WPA, WEP or open.');
        }
        throw new Error('"' + raw + '" isn\'t a Wi-Fi security type QR codes support. Use WPA, WEP or open.');
      }
      const pw = String(f.password || ''), notes = [], hid = f.hidden ? 'H:true;' : '';
      if (auth === 'nopass') {
        if (pw.trim()) notes.push('This is an open network, so the password was left out of the code.');
        return { text: 'WIFI:T:nopass;S:' + wifiEsc(ssid) + ';' + hid + ';', notes };
      }
      if (!pw) throw new Error('Enter the Wi-Fi password (or choose an open network).');
      if (auth === 'WPA' && !((pw.length >= 8 && pw.length <= 63) || /^[0-9a-f]{64}$/i.test(pw))) {
        notes.push('WPA passwords are normally 8-63 characters - double-check it, or phones won\'t connect.');
      }
      if (auth === 'WEP' && !([5, 13].indexOf(pw.length) >= 0 || /^([0-9a-f]{10}|[0-9a-f]{26})$/i.test(pw))) {
        notes.push('WEP passwords are normally 5 or 13 characters - double-check it, or phones won\'t connect.');
      }
      return { text: 'WIFI:T:' + auth + ';S:' + wifiEsc(ssid) + ';P:' + wifiEsc(pw) + ';' + hid + ';', notes };
    },
    email(f) {
      const to = oneLine(f.email, 'email address');
      if (!to || /\s/.test(to) || to.indexOf('@') < 0) throw new Error('Enter a valid email address.');
      const qs = [];
      if (f.subject) qs.push('subject=' + encodeURIComponent(f.subject));
      if (f.body) qs.push('body=' + encodeURIComponent(f.body));
      return { text: 'mailto:' + to + (qs.length ? '?' + qs.join('&') : ''), notes: [] };
    },
    phone(f) {
      const p = oneLine(f.phone, 'phone number');
      if (!p) throw new Error('Enter a phone number.');
      return { text: 'tel:' + p, notes: [] };
    },
    sms(f) {
      const p = oneLine(f.phone, 'phone number');
      if (!p) throw new Error('Enter a phone number.');
      return { text: 'SMSTO:' + p + ':' + String(f.body || ''), notes: [] };
    },
    text(f) {
      const s = String(f.text || '');
      if (!s.trim()) throw new Error('Enter some text.');
      return { text: s, notes: [] };
    }
  };

  const api = { encode, svg, panelHtml, render, styledSvg, shareSvg, payload, contrast, colorWarnings,
    BODY_SHAPES, EYE_FRAMES, EYE_CENTERS, FRAMES, LOGO_SIZES, SAFE_BODY_MAX_VERSION, SHARE_KEY };
  if (typeof window !== 'undefined') {
    window.IHQR = api;
    window.ihShowQRBig = showBig;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
