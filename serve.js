/* ══════════════════════════════════════════════════════════════════════
   serve.js — tiny zero-dependency web server for the studio.

   Double-clicking index.html opens the app from a file:// address, which
   phones on the wifi cannot reach, so the QR codes will not work. Running
   this instead puts the app on a real address that phones can scan.

       node serve.js                  start with your saved settings
       node serve.js --port 9000      just this once, on a different port
       node serve.js --help           every option

   Settings live in serve.config.json next to this file. It is written for
   you on first run, and you can edit it in any text editor.

   Nothing to install. Stop the server with Ctrl+C.
   ══════════════════════════════════════════════════════════════════════ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const CONFIG_FILE = path.join(__dirname, 'serve.config.json');

/* ── Settings ────────────────────────────────────────────────────────
   Precedence: command line flag > environment variable > config file >
   the defaults below. So a flag is always a one-off that never edits
   your saved settings.                                                */
const DEFAULTS = {
  port: 8080,
  // 0.0.0.0 lets phones on the wifi connect. Use 127.0.0.1 to keep the
  // app on this computer only.
  host: '0.0.0.0',
  // Open a browser window on startup.
  open: true,
  // Which address to open on THIS computer. Saved classes belong to the
  // exact address (host + port) they were made on, and the wifi address
  // changes whenever the router hands out a new one — so the laptop always
  // uses localhost. The QR codes still point phones at the wifi address
  // (the page asks /__phone-origin for it).
  openAddress: 'localhost',
  // Pin the address shown for phones. Leave empty to detect it. Set it if
  // this computer has several networks and the wrong one is picked.
  wifiAddress: '',
  // If the port is busy, try the next one instead of giving up. Off by
  // default: a different port is a different address, so the app would
  // open looking empty (your classes stay on the old port).
  autoPort: false,
};

const SETTING_HELP = {
  port: 'Port number to serve on (1-65535). Keep it the same: saved classes belong to one port.',
  host: 'Address to listen on. 0.0.0.0 = reachable by phones, 127.0.0.1 = this computer only.',
  open: 'Open a browser window when the server starts (true/false).',
  openAddress: "Which address to open on this computer: 'localhost' (recommended), 'wifi', or 'none'.",
  wifiAddress: 'Pin the address shown for phones. Empty means detect it.',
  autoPort: 'If the port is busy, try the next one (true/false). A new port starts with empty storage.',
};

const ENV_KEYS = {
  port: 'IH_PORT', host: 'IH_HOST', open: 'IH_OPEN',
  openAddress: 'IH_OPEN_ADDRESS', wifiAddress: 'IH_WIFI_ADDRESS', autoPort: 'IH_AUTO_PORT',
};

const bool = (v, fb) => {
  if (v === true || v === false) return v;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return fb;
};

const warnings = [];

function readConfigFile() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const clean = {};
    Object.keys(parsed).forEach(k => {
      if (k in DEFAULTS) clean[k] = parsed[k];
      else if (!k.startsWith('_')) warnings.push('Ignoring unknown setting "' + k + '" in serve.config.json');
    });
    return clean;
  } catch (e) {
    warnings.push('serve.config.json could not be read (' + e.message + '), using defaults.');
    return {};
  }
}

// Written on first run so the settings are discoverable rather than buried
// in this file. Never overwrites an existing config.
function writeConfigFileIfMissing() {
  if (fs.existsSync(CONFIG_FILE)) return false;
  const keys = Object.keys(DEFAULTS);
  const body = '{\n' +
    '  "_comment": "Settings for node serve.js. Edit, save, then restart. Delete this file to reset.",\n\n' +
    keys.map(k =>
      '  "_help_' + k + '": ' + JSON.stringify(SETTING_HELP[k]) + ',\n' +
      '  ' + JSON.stringify(k) + ': ' + JSON.stringify(DEFAULTS[k])
    ).join(',\n\n') +
    '\n}\n';
  try { fs.writeFileSync(CONFIG_FILE, body); return true; }
  catch (e) { warnings.push('Could not save serve.config.json: ' + e.message); return false; }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h' || a === '/?') { out.help = true; continue; }
    if (/^\d+$/.test(a)) { out.port = a; continue; }          // node serve.js 9000
    if (!a.startsWith('-')) { warnings.push('Ignoring unexpected argument "' + a + '"'); continue; }

    let key = a.replace(/^--?/, ''), val = null;
    const eq = key.indexOf('=');
    if (eq !== -1) { val = key.slice(eq + 1); key = key.slice(0, eq); }

    let negate = false;
    if (key.startsWith('no-')) { negate = true; key = key.slice(3); }
    key = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const alias = { p: 'port', address: 'wifiAddress', ip: 'wifiAddress', wifi: 'wifiAddress' };
    key = alias[key] || key;

    if (!(key in DEFAULTS)) { warnings.push('Ignoring unknown option "' + a + '"'); continue; }

    if (typeof DEFAULTS[key] === 'boolean') {
      out[key] = negate ? false : (val === null ? true : bool(val, true));
    } else {
      if (val === null) val = argv[++i];
      if (val === undefined) { warnings.push('Option "' + a + '" needs a value, ignoring it'); continue; }
      out[key] = val;
    }
  }
  return out;
}

function resolveSettings(cli) {
  const file = readConfigFile();
  const env = {};
  Object.entries(ENV_KEYS).forEach(([k, name]) => {
    if (process.env[name] !== undefined && process.env[name] !== '') env[k] = process.env[name];
  });

  const merged = Object.assign({}, DEFAULTS, file, env, cli);
  const source = k => (k in cli ? 'command line' : k in env ? 'environment' : k in file ? 'config file' : 'default');

  const port = parseInt(merged.port, 10);
  if (!(port >= 1 && port <= 65535)) {
    warnings.push('Port "' + merged.port + '" is not valid, using ' + DEFAULTS.port + '.');
    merged.port = DEFAULTS.port;
  } else merged.port = port;

  merged.open = bool(merged.open, DEFAULTS.open);
  merged.autoPort = bool(merged.autoPort, DEFAULTS.autoPort);

  merged.openAddress = String(merged.openAddress).trim().toLowerCase();
  if (!['wifi', 'localhost', 'none'].includes(merged.openAddress)) {
    warnings.push('openAddress "' + merged.openAddress + '" is not valid, using "' + DEFAULTS.openAddress + '".');
    merged.openAddress = DEFAULTS.openAddress;
  }
  if (merged.openAddress === 'none') merged.open = false;

  merged.host = String(merged.host).trim() || DEFAULTS.host;
  merged.wifiAddress = String(merged.wifiAddress || '').trim();

  return { s: merged, source };
}

/* ── Networking ──────────────────────────────────────────────────── */
function lanAddresses() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(list => {
    (list || []).forEach(ni => {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    });
  });
  // Ordinary home and studio wifi hands out 192.168.x or 10.x. Virtual
  // adapters from VPNs and VMs usually do not, so prefer the real ones.
  const rank = ip => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1
                    : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

function pickWifiAddress(s) {
  const found = lanAddresses();
  if (s.wifiAddress) {
    if (!found.includes(s.wifiAddress)) {
      warnings.push('wifiAddress ' + s.wifiAddress + ' is not on this computer right now' +
        (found.length ? ' (found ' + found.join(', ') + ')' : '') + '. Using it anyway.');
    }
    return { chosen: s.wifiAddress, found };
  }
  return { chosen: found[0] || null, found };
}

function openBrowser(url) {
  try {
    const p = process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true })
      : process.platform === 'darwin'
        ? spawn('open', [url], { detached: true, stdio: 'ignore' })
        : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    p.on('error', () => {});
    p.unref();
  } catch (e) { /* not fatal — the address is printed anyway */ }
}

/* ── Static files ────────────────────────────────────────────────── */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const ROOT = __dirname;
const HIDDEN = new Set(['serve.config.json', 'package.json', 'package-lock.json',
  'eslint.config.js', 'vitest.config.js', '.gitignore']);
// Developer folders are never part of the app and shouldn't be reachable from phones.
const HIDDEN_DIRS = new Set(['node_modules', 'tests', '.git']);

// Windows and macOS file names ignore case, and Windows also drops a
// trailing dot or space and understands "name::$DATA" and 8.3 short names
// (GIT~1). Any of those would walk straight past a plain name check, so a
// path is refused if any segment is hidden in *any* spelling, starts with a
// dot, ends in a dot or space, or contains ':' or '~'.
function blockedPath(relPath) {
  const segs = relPath.split(/[\\/]+/).filter(Boolean);
  if (!segs.length) return false;
  for (const raw of segs) {
    const seg = raw.toLowerCase();
    if (seg.startsWith('.') || /[.\s]$/.test(seg) || /[:~\0]/.test(seg)) return true;
    if (HIDDEN_DIRS.has(seg)) return true;
  }
  return HIDDEN.has(segs[segs.length - 1].toLowerCase());
}

// Set once the server is listening, so the page can ask which address a
// phone should use. Without this a QR generated on http://localhost would
// encode "localhost", which every phone resolves to itself.
let PHONE_ORIGIN = '';

function handler(req, res) {
  // The class link lives in the URL fragment, which never reaches the
  // server, so only the path matters here.
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]); }
  catch (e) { res.writeHead(400).end('Bad request'); return; }
  if (rel === '/' || rel === '') rel = '/index.html';

  if (rel === '/__phone-origin') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }).end(JSON.stringify({ origin: PHONE_ORIGIN }));
    return;
  }

  // Keep requests inside the app folder.
  const file = path.join(ROOT, path.normalize(rel).replace(/^([\\/])+/, ''));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  // Checked on the decoded request path and on the resolved one, so neither
  // "%2e" spellings nor normalisation can slip a hidden segment through.
  if (blockedPath(rel) || blockedPath(path.relative(ROOT, file))) {
    res.writeHead(404).end('Not found');
    return;
  }

  fs.stat(file, (serr, st) => {
    if (serr || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
         .end('<h1>404</h1><p>Not found: ' + rel.replace(/[<>&"']/g, '') + '</p>');
      return;
    }
    // A cheap validator lets the offline worker ask "has this changed?"
    // and get a 304 back instead of the whole file.
    const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    const headers = {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'ETag': etag,
      'Last-Modified': st.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

/* ── Help ────────────────────────────────────────────────────────── */
function printHelp() {
  console.log([
    '',
    '  Inspire Habits — local server',
    '',
    '  Usage:  node serve.js [options]',
    '          node serve.js 9000              shorthand for --port 9000',
    '',
    '  Options:',
    '    --port <n>            ' + SETTING_HELP.port,
    '    --host <addr>         ' + SETTING_HELP.host,
    '    --open, --no-open     ' + SETTING_HELP.open,
    '    --open-address <x>    ' + SETTING_HELP.openAddress,
    '    --wifi-address <ip>   ' + SETTING_HELP.wifiAddress,
    '    --auto-port, --no-auto-port',
    '                          ' + SETTING_HELP.autoPort,
    '    --help',
    '',
    '  Settings are read from serve.config.json, then environment variables',
    '  (' + Object.values(ENV_KEYS).join(', ') + '),',
    '  then the options above. Options win, and never change your saved file.',
    '',
    '  Config file: ' + CONFIG_FILE,
    '',
  ].join('\n'));
}

/* ── Start ───────────────────────────────────────────────────────── */
// Required as a module (the tests do this), nothing starts and no file is
// written; only the request handler is handed back.
let created = false, s = null, source = null;
if (require.main === module) {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) { printHelp(); process.exit(0); }
  created = writeConfigFileIfMissing();
  ({ s, source } = resolveSettings(cli));
} else {
  module.exports = { handler, blockedPath, TYPES };
}

function start(port, attempt) {
  const server = http.createServer(handler);

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      if (s.autoPort && attempt < 10) {
        console.log('  Port ' + port + ' is busy, trying ' + (port + 1) + '…');
        start(port + 1, attempt + 1);
        return;
      }
      console.error('\n  Port ' + port + ' is already in use — is Inspire Habits already running');
      console.error('  in another window? If so, just use that one.');
      console.error('  Otherwise close the program using it. (Moving to another port would');
      console.error('  open the app without your saved classes, so it is not done for you.)\n');
    } else if (e.code === 'EADDRNOTAVAIL' || e.code === 'EINVAL') {
      console.error('\n  Cannot listen on host "' + s.host + '". Try:  node serve.js --host 0.0.0.0\n');
    } else if (e.code === 'EACCES') {
      console.error('\n  Not allowed to use port ' + port + '. Try a number above 1024.\n');
    } else {
      console.error('\n  ' + e.message + '\n');
    }
    process.exit(1);
  });

  server.listen(port, s.host, () => {
    const { chosen, found } = pickWifiAddress(s);
    const localOnly = s.host === '127.0.0.1' || s.host === 'localhost';
    PHONE_ORIGIN = (!localOnly && chosen) ? 'http://' + chosen + ':' + port : '';

    console.log('\n  Inspire Habits is running.\n');
    if (created) console.log('  Saved your settings to serve.config.json — edit it any time.\n');
    warnings.forEach(w => console.log('  ! ' + w));
    if (warnings.length) console.log('');

    console.log('  On this computer:      http://localhost:' + port);

    if (localOnly) {
      console.log('\n  Phones cannot connect, because host is set to ' + s.host + '.');
      console.log('  For QR codes, restart with:  node serve.js --host 0.0.0.0');
    } else if (chosen) {
      console.log('  On phones (same wifi): http://' + chosen + ':' + port);
      if (found.length > 1) {
        console.log('\n  Other addresses on this computer:');
        found.filter(ip => ip !== chosen).forEach(ip => console.log('    http://' + ip + ':' + port));
        console.log('  If the one above is wrong:  node serve.js --wifi-address <ip>');
      }
      console.log('\n  Use http://localhost:' + port + ' on this laptop. The QR codes it shows');
      console.log('  already point phones at the wifi address above.');
      console.log('\n  Anyone on this wifi can open the sign-in page (the access code is');
      console.log('  still needed). Only the app\'s own files are served.');
      console.log('\n  Guests without the wifi password? In the QR window choose "Set up"');
      console.log('  and paste the address of a published copy of this folder — the codes');
      console.log('  then open on mobile data, and no wifi is needed at all.');
    } else {
      console.log('\n  No wifi network found, so phones will not be able to scan.');
      console.log('  In the QR window choose "Set up" and point the codes at a published');
      console.log('  copy of this folder instead — then phones use their own mobile data.');
    }

    console.log('\n  Saved classes belong to the exact address they were made on.');
    console.log('  Used the wifi address on this laptop before? Open it once, choose');
    console.log('  Back up, then Import the file at http://localhost:' + port + '.');

    if (s.open) {
      const target = (s.openAddress === 'wifi' && chosen && !localOnly)
        ? 'http://' + chosen + ':' + port
        : 'http://localhost:' + port;
      console.log('\n  Opening ' + target + ' …');
      openBrowser(target);
    }

    if (port !== s.port) {
      console.log('\n  ! Using port ' + port + ' because ' + s.port + ' was taken.');
      console.log('  ! A different port is a different address: the app will open with');
      console.log('  ! none of your saved classes. They are still safe on port ' + s.port + ' —');
      console.log('  ! close whatever is using it and start again to get them back.');
    }
    console.log('\n  Settings: port ' + s.port + ' (' + source('port') + '), host ' + s.host +
                ' (' + source('host') + '), open ' + s.open + ' (' + source('open') + ').');
    console.log('  node serve.js --help for all options.');
    console.log('\n  Press Ctrl+C to stop.\n');
  });

  const bye = () => {
    console.log('\n  Stopped.\n');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}

if (require.main === module) start(s.port, 0);
