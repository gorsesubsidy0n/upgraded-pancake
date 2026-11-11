/* ══════════════════════════════════════════════════════════════════════
   QR BUILDER — instructor tool for making styled QR codes (qr-builder.js)

   Makes codes for a web link, Wi-Fi network, plain text, email, phone call
   or text message, styled with module shapes, eye shapes, colours, an
   optional frame/banner/caption and a centre logo. Everything runs in the
   browser with IHQR.render (qr.js); nothing is uploaded anywhere.

   Downloads: SVG (exact) and PNG (1000 px). "Use for class share codes"
   saves the shapes and colours (never the logo, frame or caption) so the
   class join codes match; qr.js keeps those scannable on its own.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MODAL_ID = 'ih-qr-builder';
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;
  const LOGO_PX = 256;
  const PNG_PX = 1000;

  const TYPES = [
    ['url', 'Web link'], ['wifi', 'Wi-Fi network'], ['text', 'Plain text'],
    ['email', 'Email'], ['phone', 'Phone call'], ['sms', 'Text message']
  ];
  const LABELS = {
    square: 'Square', rounded: 'Rounded', dots: 'Dots', diamond: 'Diamond',
    'small-squares': 'Small squares', fluid: 'Fluid', 'vertical-bars': 'Vertical bars',
    'horizontal-bars': 'Horizontal bars', 'extra-rounded': 'Extra rounded', circle: 'Circle',
    leaf: 'Leaf', none: 'None', box: 'Box', 'rounded-box': 'Rounded box', banner: 'Banner',
    small: 'Small', medium: 'Medium', large: 'Large'
  };
  const DEFAULTS = { body: 'square', eyeFrame: 'square', eyeCenter: 'square', frame: 'none',
    fg: '#000000', bg: '#ffffff', eyeColor: '#000000', frameColor: '#000000', logoSize: 'medium' };

  let logoData = '';
  let lastSvg = '';
  let lastKind = 'url';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const val = id => { const el = $(id); return el ? el.value : ''; };
  const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t); };
  // storage.js declares IHStore with const, so it is not a window property.
  const store = () => (typeof IHStore !== 'undefined' ? IHStore : window.IHStore) || null;

  function options(list, sel) {
    return list.map(v => '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' +
      esc(LABELS[v] || v) + '</option>').join('');
  }
  function field(id, label, input) {
    return '<label class="ih-qrb-field" for="' + id + '"><span>' + label + '</span>' + input + '</label>';
  }
  function text(id, label, ph, type) {
    return field(id, label, '<input id="' + id + '" type="' + (type || 'text') + '" placeholder="' +
      esc(ph || '') + '" autocomplete="off" spellcheck="false" />');
  }
  function area(id, label, ph) {
    return field(id, label, '<textarea id="' + id + '" rows="3" placeholder="' + esc(ph || '') + '"></textarea>');
  }
  function colour(id, label, v) {
    return field(id, label, '<input id="' + id + '" type="color" value="' + esc(v) + '" />');
  }
  function select(id, label, list, sel) {
    return field(id, label, '<select id="' + id + '">' + options(list, sel) + '</select>');
  }

  const CONTENT = {
    url: () => text('qrb-url', 'Web address', 'contoso.com/schedule', 'url'),
    wifi: () => text('qrb-ssid', 'Network name', 'IFW Guest') +
      field('qrb-auth', 'Security', '<select id="qrb-auth"><option value="WPA">WPA / WPA2 / WPA3</option>' +
        '<option value="WEP">WEP</option><option value="nopass">Open (no password)</option></select>') +
      text('qrb-pass', 'Password', '', 'text') +
      '<label class="ih-qrb-check"><input id="qrb-hidden" type="checkbox" /> Hidden network</label>',
    text: () => area('qrb-text', 'Text', 'Anything you like'),
    email: () => text('qrb-email', 'To', 'studio@example.com', 'email') +
      text('qrb-subject', 'Subject (optional)', '') + area('qrb-body', 'Message (optional)', ''),
    phone: () => text('qrb-phone', 'Phone number', '+1 555 010 0199', 'tel'),
    sms: () => text('qrb-phone', 'Phone number', '+1 555 010 0199', 'tel') +
      area('qrb-body', 'Message (optional)', '')
  };

  function readPayload(kind) {
    const P = window.IHQR.payload;
    switch (kind) {
      case 'url': return P.url(val('qrb-url'));
      case 'wifi': return P.wifi({ ssid: val('qrb-ssid'), auth: val('qrb-auth'),
        password: val('qrb-pass'), hidden: !!($('qrb-hidden') && $('qrb-hidden').checked) });
      case 'email': return P.email({ email: val('qrb-email'), subject: val('qrb-subject'), body: val('qrb-body') });
      case 'phone': return P.phone({ phone: val('qrb-phone') });
      case 'sms': return P.sms({ phone: val('qrb-phone'), body: val('qrb-body') });
      default: return P.text({ text: val('qrb-text') });
    }
  }

  function readStyle() {
    return {
      body: val('qrb-body-shape'), eyeFrame: val('qrb-eye-frame'), eyeCenter: val('qrb-eye-center'),
      frame: val('qrb-frame'), fg: val('qrb-fg'), bg: val('qrb-bg'), eyeColor: val('qrb-eye'),
      frameColor: val('qrb-frame-color'), bannerText: val('qrb-banner'), caption: val('qrb-caption'),
      logoSize: val('qrb-logo-size'), logo: logoData
    };
  }

  function update() {
    const kind = val('qrb-type') || 'url';
    const prev = $('qrb-preview'), info = $('qrb-info'), msgs = $('qrb-msgs');
    if (!prev) return;
    const bannerRow = $('qrb-banner-row');
    if (bannerRow) bannerRow.hidden = val('qrb-frame') !== 'banner';
    const sizeRow = $('qrb-logo-size-row');
    if (sizeRow) sizeRow.hidden = !logoData;
    let p;
    try { p = readPayload(kind); } catch (e) {
      lastSvg = '';
      prev.innerHTML = '<div class="ih-qrb-empty">' + esc(e.message) + '</div>';
      info.textContent = ''; msgs.innerHTML = '';
      setDownloads(false);
      return;
    }
    const r = window.IHQR.render(p.text, readStyle());
    if (!r) {
      lastSvg = '';
      prev.innerHTML = '<div class="ih-qrb-empty">That is too much to fit in one QR code. Shorten it.</div>';
      info.textContent = ''; msgs.innerHTML = '';
      setDownloads(false);
      return;
    }
    lastSvg = r.svg; lastKind = kind;
    prev.innerHTML = r.svg;
    let line = 'Version ' + r.version + ' · error correction ' + r.ecl;
    if (r.readback) line += ' · logo covers ' + r.readback.pct + '% (' + r.readback.verdict + ')';
    info.textContent = line;
    const notes = p.notes.map(n => '<div class="qr-warn">' + esc(n) + '</div>');
    r.warnings.forEach(w => notes.push('<div class="qr-warn">⚠ ' + esc(w) + '</div>'));
    msgs.innerHTML = notes.join('');
    setDownloads(true);
  }

  function setDownloads(on) {
    ['qrb-png', 'qrb-svg'].forEach(id => { const b = $(id); if (b) b.disabled = !on; });
  }

  function fileName(ext) {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    return 'qr-' + lastKind + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.' + ext;
  }
  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function downloadSvg() {
    if (!lastSvg) return;
    save(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + lastSvg], { type: 'image/svg+xml' }),
      fileName('svg'));
  }
  function downloadPng() {
    if (!lastSvg) return;
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(lastSvg);
    const w = vb ? +vb[1] : 1, h = vb ? +vb[2] : 1;
    const cw = PNG_PX, ch = Math.round(PNG_PX * h / w);
    const sized = lastSvg.replace('<svg ', '<svg width="' + cw + '" height="' + ch + '" ');
    const img = new Image();
    const fail = () => toast('This browser could not make a PNG. Download the SVG instead.', 'error');
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(img, 0, 0, cw, ch);
        c.toBlob(b => { if (b) save(b, fileName('png')); else fail(); }, 'image/png');
      } catch (e) { fail(); }
    };
    img.onerror = fail;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  }

  function loadLogo(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) {
      toast('Choose a PNG, JPG, GIF, WebP or SVG image.', 'error'); return;
    }
    if (file.size > MAX_LOGO_BYTES) { toast('That image is over 2 MB. Choose a smaller one.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Redraw as a small PNG: keeps saved SVGs light and strips any
        // script an uploaded SVG might carry.
        const k = Math.min(1, LOGO_PX / Math.max(img.naturalWidth || LOGO_PX, img.naturalHeight || LOGO_PX));
        const w = Math.max(1, Math.round((img.naturalWidth || LOGO_PX) * k));
        const h = Math.max(1, Math.round((img.naturalHeight || LOGO_PX) * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        try {
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          logoData = c.toDataURL('image/png');
        } catch (e) { toast('Could not read that image.', 'error'); return; }
        const rm = $('qrb-logo-remove');
        if (rm) rm.hidden = false;
        update();
      };
      img.onerror = () => toast('Could not read that image.', 'error');
      img.src = reader.result;
    };
    reader.onerror = () => toast('Could not read that image.', 'error');
    reader.readAsDataURL(file);
  }

  function useForShare() {
    const s = readStyle();
    const pick = { body: s.body, eyeFrame: s.eyeFrame, eyeCenter: s.eyeCenter,
      fg: s.fg, eyeColor: s.eyeColor, bg: s.bg };
    if (window.IHQR.colorWarnings(pick).length) {
      toast('Those colours are too hard to scan. Pick darker code colours on a lighter background.', 'error');
      return;
    }
    const S = store();
    if (!S || S.setJSON(window.IHQR.SHARE_KEY, pick) === false) {
      toast('Could not save the style on this device.', 'error');
      return;
    }
    toast('Class share codes will use this style.', 'success');
  }
  function resetShare() {
    const S = store();
    if (S) S.remove(window.IHQR.SHARE_KEY);
    toast('Class share codes are back to classic black and white.', 'success');
  }

  function close() { const m = $(MODAL_ID); if (m) m.remove(); }

  function renderContent() {
    const box = $('qrb-content');
    if (!box) return;
    box.innerHTML = CONTENT[val('qrb-type')] ? CONTENT[val('qrb-type')]() : CONTENT.url();
  }

  function show() {
    if (typeof ihIsInstructor === 'function' && !ihIsInstructor()) return;
    if (!window.IHQR || !window.IHQR.render) return;
    close();
    const Q = window.IHQR;
    let saved = null;
    try { const S = store(); saved = S && S.getJSON(Q.SHARE_KEY, null); } catch (e) { saved = null; }
    const st = Object.assign({}, DEFAULTS, saved && typeof saved === 'object' ? saved : {});
    logoData = ''; lastSvg = '';

    const m = document.createElement('div');
    m.className = 'qr-modal';
    m.id = MODAL_ID;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'qrb-title');
    m.innerHTML =
      '<div class="qr-modal-inner ih-qrb-inner">' +
        '<button class="modal-close qr-close" id="qrb-close" aria-label="Close">✕</button>' +
        '<h2 class="qr-title" id="qrb-title">📱 QR Builder</h2>' +
        '<p class="qr-sub">Make a scan code for a link, your Wi-Fi, an email and more. ' +
          'Everything stays on this device.</p>' +
        '<div class="ih-qrb-grid">' +
          '<div class="ih-qrb-form">' +
            '<fieldset><legend>What it opens</legend>' +
              field('qrb-type', 'Type', '<select id="qrb-type">' + TYPES.map(t =>
                '<option value="' + t[0] + '">' + esc(t[1]) + '</option>').join('') + '</select>') +
              '<div id="qrb-content"></div>' +
            '</fieldset>' +
            '<fieldset><legend>Shapes</legend>' +
              select('qrb-body-shape', 'Pattern', Q.BODY_SHAPES, st.body) +
              select('qrb-eye-frame', 'Corner frames', Q.EYE_FRAMES, st.eyeFrame) +
              select('qrb-eye-center', 'Corner centres', Q.EYE_CENTERS, st.eyeCenter) +
            '</fieldset>' +
            '<fieldset><legend>Colours</legend><div class="ih-qrb-colours">' +
              colour('qrb-fg', 'Code', st.fg) + colour('qrb-eye', 'Corners', st.eyeColor) +
              colour('qrb-bg', 'Background', st.bg) +
              colour('qrb-frame-color', 'Frame', st.frameColor || st.fg) +
            '</div></fieldset>' +
            '<fieldset><legend>Frame and logo</legend>' +
              select('qrb-frame', 'Frame', Q.FRAMES, 'none') +
              '<div id="qrb-banner-row" hidden>' + text('qrb-banner', 'Banner text', 'SCAN ME') + '</div>' +
              text('qrb-caption', 'Caption under the code (optional)', 'Join tonight\'s class') +
              field('qrb-logo', 'Centre logo (optional)',
                '<input id="qrb-logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" />') +
              '<div id="qrb-logo-size-row" hidden>' +
                select('qrb-logo-size', 'Logo size', Object.keys(Q.LOGO_SIZES), st.logoSize) + '</div>' +
              '<button class="qr-btn" id="qrb-logo-remove" hidden>Remove logo</button>' +
            '</fieldset>' +
          '</div>' +
          '<div class="ih-qrb-side">' +
            '<div class="ih-qrb-preview" id="qrb-preview" aria-live="polite"></div>' +
            '<div class="ih-qrb-info" id="qrb-info"></div>' +
            '<div id="qrb-msgs"></div>' +
            '<div class="ih-qrb-actions">' +
              '<button class="qr-btn primary" id="qrb-png">Download PNG</button>' +
              '<button class="qr-btn" id="qrb-svg">Download SVG</button>' +
            '</div>' +
            '<p class="qr-hint">Always test-scan a code with a phone before printing it.</p>' +
            '<hr class="ih-code-rule" />' +
            '<div class="ih-qrb-share">' +
              '<div class="ih-qrb-share-title">Class share codes</div>' +
              '<p class="qr-hint">Give the codes athletes scan to join a class this pattern and these ' +
                'colours. Logos, frames and captions are left off so they always scan.</p>' +
              '<div class="ih-qrb-actions">' +
                '<button class="qr-btn" id="qrb-use-share">Use this style</button>' +
                '<button class="qr-btn" id="qrb-reset-share">Reset to classic</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.style.display = 'flex';

    renderContent();
    $('qrb-close').addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    $('qrb-type').addEventListener('change', () => { renderContent(); update(); });
    m.addEventListener('input', e => { if (e.target && e.target.type !== 'file') update(); });
    m.addEventListener('change', e => {
      if (e.target && e.target.id === 'qrb-logo') loadLogo(e.target.files && e.target.files[0]);
      else if (e.target && e.target.id !== 'qrb-type') update();
    });
    $('qrb-logo-remove').addEventListener('click', () => {
      logoData = '';
      $('qrb-logo').value = '';
      $('qrb-logo-remove').hidden = true;
      update();
    });
    $('qrb-png').addEventListener('click', downloadPng);
    $('qrb-svg').addEventListener('click', downloadSvg);
    $('qrb-use-share').addEventListener('click', useForShare);
    $('qrb-reset-share').addEventListener('click', resetShare);
    update();
    const first = $('qrb-url');
    if (first) first.focus();
  }

  window.ihShowQRBuilder = show;
  window.IHQRBuilder = { show, close, _update: update, _readPayload: readPayload };
})();
