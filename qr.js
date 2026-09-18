/* ══════════════════════════════════════════════════════════════════════
   qr.js — self-contained QR Code generator (ISO/IEC 18004, model 2).

   No dependencies, no CDN, no build step: the studio's wifi is not on the
   critical path. Byte mode only, which is all a URL needs.

   Public API:
     QR.encode(text, level)  -> { size, modules:boolean[][], version, level }
     QR.svg(text, opts)      -> SVG markup string
   ══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Galois field GF(256), primitive polynomial 0x11D ──────────────────
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  // Generator polynomial for `degree` error-correction codewords:
  // the product of (x - a^i) for i in 0..degree-1, highest power first.
  function rsGenerator(degree) {
    let poly = [1];
    for (let d = 0; d < degree; d++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let i = 0; i < poly.length; i++) {
        next[i] ^= poly[i];                          // multiply by x
        next[i + 1] ^= gfMul(poly[i], EXP[d]);       // multiply by a^d
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, degree) {
    const gen = rsGenerator(degree);
    const rem = new Array(degree).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      rem.shift(); rem.push(0);
      for (let j = 0; j < degree; j++) rem[j] ^= gfMul(gen[j + 1], factor);
    }
    return rem;
  }

  // ── Spec tables ───────────────────────────────────────────────────────
  // Total codewords (data + EC) per version, 1..40.
  const TOTAL_CW = [
    26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
    404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
    1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
    2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
  ];

  // [ecCodewordsPerBlock, numBlocks] per version, 1..40.
  const ECB = {
    L: [[7,1],[10,1],[15,1],[20,1],[26,1],[18,2],[20,2],[24,2],[30,2],[18,4],
        [20,4],[24,4],[26,4],[30,4],[22,6],[24,6],[28,6],[30,6],[28,7],[28,8],
        [28,8],[28,9],[30,9],[30,10],[26,12],[28,12],[30,12],[30,13],[30,14],[30,15],
        [30,16],[30,17],[30,18],[30,19],[30,19],[30,20],[30,21],[30,22],[30,24],[30,25]],
    M: [[10,1],[16,1],[26,1],[18,2],[24,2],[16,4],[18,4],[22,4],[22,5],[26,5],
        [30,5],[22,8],[22,9],[24,9],[24,10],[28,10],[28,11],[26,13],[26,14],[26,16],
        [26,17],[28,17],[28,18],[28,20],[28,21],[28,23],[28,25],[28,26],[28,28],[28,29],
        [28,31],[28,33],[28,35],[28,37],[28,38],[28,40],[28,43],[28,45],[28,47],[28,49]],
    Q: [[13,1],[22,1],[18,2],[26,2],[18,4],[24,4],[18,6],[22,6],[20,8],[24,8],
        [28,8],[26,10],[24,12],[20,16],[30,12],[24,17],[28,16],[28,18],[26,21],[30,20],
        [28,23],[30,23],[30,25],[30,27],[30,29],[28,34],[30,34],[30,35],[30,38],[30,40],
        [30,43],[30,45],[30,48],[30,51],[30,53],[30,56],[30,59],[30,62],[30,65],[30,68]],
    H: [[17,1],[28,1],[22,2],[16,4],[22,4],[28,4],[26,5],[26,6],[24,8],[28,8],
        [24,11],[28,11],[22,16],[24,16],[24,18],[30,16],[28,19],[28,21],[26,25],[28,25],
        [30,25],[24,34],[30,30],[30,32],[30,35],[30,37],[30,40],[30,42],[30,45],[30,48],
        [30,51],[30,54],[30,57],[30,60],[30,63],[30,66],[30,70],[30,74],[30,77],[30,81]],
  };

  const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // Alignment pattern centre coordinates per version.
  const ALIGN = [
    [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50],
    [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78],
    [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102],
    [6,28,54,80,106], [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118], [6,26,50,74,98,122],
    [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134], [6,34,60,86,112,138],
    [6,30,58,86,114,142], [6,34,62,90,118,146], [6,30,54,78,102,126,150], [6,24,50,76,102,128,154],
    [6,28,54,80,106,132,158], [6,32,58,84,110,136,162], [6,26,54,82,110,138,166], [6,30,58,86,114,142,170],
  ];

  const dataCapacity = (version, level) => {
    const [ec, blocks] = ECB[level][version - 1];
    return TOTAL_CW[version - 1] - ec * blocks;
  };

  // ── Encoding ──────────────────────────────────────────────────────────
  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        const c2 = str.charCodeAt(i + 1);
        const cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        i++;
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  const charCountBits = version => (version < 10 ? 8 : 16);

  function buildCodewords(bytes, version, level) {
    const capacity = dataCapacity(version, level);
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };

    push(4, 4);                                   // byte mode
    push(bytes.length, charCountBits(version));
    bytes.forEach(b => push(b, 8));

    // Terminator, then pad to a byte boundary, then alternating pad bytes.
    const capBits = capacity * 8;
    for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const cw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    const PAD = [0xEC, 0x11];
    for (let i = 0; cw.length < capacity; i++) cw.push(PAD[i % 2]);
    return cw;
  }

  // Split into blocks, compute EC per block, then interleave both.
  function interleave(cw, version, level) {
    const [ecLen, numBlocks] = ECB[level][version - 1];
    const totalData = cw.length;
    const shortLen = Math.floor(totalData / numBlocks);
    const numLong = totalData % numBlocks;          // blocks holding one extra codeword

    const dataBlocks = [], ecBlocks = [];
    let pos = 0;
    for (let b = 0; b < numBlocks; b++) {
      const len = shortLen + (b >= numBlocks - numLong ? 1 : 0);
      const block = cw.slice(pos, pos + len); pos += len;
      dataBlocks.push(block);
      ecBlocks.push(rsRemainder(block, ecLen));
    }

    const out = [];
    for (let i = 0; i <= shortLen; i++)
      dataBlocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ecLen; i++)
      ecBlocks.forEach(b => out.push(b[i]));
    return out;
  }

  // ── Matrix construction ───────────────────────────────────────────────
  function buildMatrix(version, level, codewords, mask) {
    const size = version * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));

    const set = (r, c, v) => { m[r][c] = v; fixed[r][c] = true; };

    // Finder patterns + separators.
    [[0, 0], [size - 7, 0], [0, size - 7]].forEach(([r0, c0]) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                       (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        set(rr, cc, inRing || inCore);
      }
    });

    // Timing patterns.
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    // Alignment patterns (skipped where they would collide with finders).
    const centres = ALIGN[version - 1];
    centres.forEach(r0 => centres.forEach(c0 => {
      const nearFinder = (r0 <= 8 && c0 <= 8) ||
                         (r0 <= 8 && c0 >= size - 9) ||
                         (r0 >= size - 9 && c0 <= 8);
      if (nearFinder) return;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++)
        set(r0 + r, c0 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }));

    // Reserve format areas (written after masking) and the always-dark module.
    for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(8, i, false); if (!fixed[i][8]) set(i, 8, false); }
    for (let i = 0; i < 8; i++) { if (!fixed[8][size - 1 - i]) set(8, size - 1 - i, false); if (!fixed[size - 1 - i][8]) set(size - 1 - i, 8, false); }
    set(size - 8, 8, true);

    // Version information block (version 7 and up).
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >> i) & 1) === 1;
        const a = Math.floor(i / 3), b = i % 3;
        set(size - 11 + b, a, bit);
        set(a, size - 11 + b, bit);
      }
    }

    // Zigzag data placement, two columns at a time, skipping the timing column.
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    const nextBit = () => {
      if (bitIdx >= totalBits) return false;
      const bit = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
      bitIdx++;
      return bit;
    };
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (let c = 0; c < 2; c++) {
          const col = right - c;
          if (fixed[row][col]) continue;
          m[row][col] = applyMask(nextBit(), row, col, mask);
        }
      }
      upward = !upward;
    }

    writeFormat(m, size, level, mask);
    return { size, modules: m };
  }

  function applyMask(bit, r, c, mask) {
    let flip;
    switch (mask) {
      case 0: flip = (r + c) % 2 === 0; break;
      case 1: flip = r % 2 === 0; break;
      case 2: flip = c % 3 === 0; break;
      case 3: flip = (r + c) % 3 === 0; break;
      case 4: flip = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
      case 5: flip = ((r * c) % 2) + ((r * c) % 3) === 0; break;
      case 6: flip = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
      default: flip = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
    }
    return flip ? !bit : bit;
  }

  function writeFormat(m, size, level, mask) {
    const data = (ECL_BITS[level] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const get = i => ((bits >> i) & 1) === 1;

    for (let i = 0; i <= 5; i++) m[8][i] = get(i);
    m[8][7] = get(6); m[8][8] = get(7); m[7][8] = get(8);
    for (let i = 9; i < 15; i++) m[14 - i][8] = get(i);

    for (let i = 0; i < 8; i++) m[size - 1 - i][8] = get(i);
    for (let i = 8; i < 15; i++) m[8][size - 15 + i] = get(i);
    m[size - 8][8] = true;
  }

  // ── Mask selection (penalty rules from the spec) ───────────────────────
  function penalty(m, size) {
    let score = 0;

    // Rule 1: runs of five or more same-coloured modules in a line.
    for (let i = 0; i < size; i++) {
      let runRow = 1, runCol = 1;
      for (let j = 1; j < size; j++) {
        runRow = m[i][j] === m[i][j - 1] ? runRow + 1 : 1;
        if (runRow === 5) score += 3; else if (runRow > 5) score += 1;
        runCol = m[j][i] === m[j - 1][i] ? runCol + 1 : 1;
        if (runCol === 5) score += 3; else if (runCol > 5) score += 1;
      }
    }

    // Rule 2: 2x2 blocks of one colour.
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++)
        if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;

    // Rule 3: finder-like 1:1:3:1:1 patterns with a 4-module quiet run.
    const A = [true, false, true, true, true, false, true, false, false, false, false];
    const B = [false, false, false, false, true, false, true, true, true, false, true];
    const matches = (get, start) => {
      let a = true, b = true;
      for (let k = 0; k < 11; k++) {
        const v = get(start + k);
        if (v !== A[k]) a = false;
        if (v !== B[k]) b = false;
      }
      return a || b;
    };
    for (let i = 0; i < size; i++)
      for (let j = 0; j + 11 <= size; j++) {
        if (matches(k => m[i][k], j)) score += 40;
        if (matches(k => m[k][i], j)) score += 40;
      }

    // Rule 4: deviation from a 50% dark ratio.
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
    const pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function encode(text, level) {
    level = level || 'M';
    if (!ECB[level]) throw new Error('QR: bad EC level ' + level);
    const bytes = utf8Bytes(String(text));

    let version = 0;
    for (let v = 1; v <= 40; v++) {
      const need = 4 + charCountBits(v) + bytes.length * 8;
      if (need <= dataCapacity(v, level) * 8) { version = v; break; }
    }
    if (!version) throw new Error('QR: payload too large (' + bytes.length + ' bytes)');

    const codewords = interleave(buildCodewords(bytes, version, level), version, level);

    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const cand = buildMatrix(version, level, codewords, mask);
      const s = penalty(cand.modules, cand.size);
      if (s < bestScore) { bestScore = s; best = cand; }
    }
    best.version = version; best.level = level;
    return best;
  }

  // Render to SVG. Horizontal runs are merged into single rects so the
  // markup stays small enough to inline comfortably.
  function svg(text, opts) {
    opts = opts || {};
    const px = opts.size || 320;
    const margin = opts.margin == null ? 4 : opts.margin;
    const { size, modules } = encode(text, opts.level);
    const total = size + margin * 2;
    let rects = '';
    for (let r = 0; r < size; r++) {
      let c = 0;
      while (c < size) {
        if (!modules[r][c]) { c++; continue; }
        let run = 1;
        while (c + run < size && modules[r][c + run]) run++;
        rects += '<rect x="' + (c + margin) + '" y="' + (r + margin) + '" width="' + run + '" height="1"/>';
        c += run;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px +
           '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
           '<rect width="' + total + '" height="' + total + '" fill="' + (opts.light || '#fff') + '"/>' +
           '<g fill="' + (opts.dark || '#000') + '">' + rects + '</g></svg>';
  }

  global.QR = { encode, svg, capacityBytes: (v, l) => dataCapacity(v, l) };
})(typeof window !== 'undefined' ? window : globalThis);
