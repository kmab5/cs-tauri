#!/usr/bin/env node
/*
 * Proves the app is a static site.
 *
 * A dumb file server: no API, no engine endpoint, nothing that could be
 * mistaken for a backend. Any request to /api/* fails the test outright.
 *
 * Needs jsdom (test-only):  npm install --no-save jsdom
 * Run: node e2e-test.js [path/to/game/mygame]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, 'dist');
const PORT = 9950 + Math.floor(Math.random() * 40);

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  ok   ' + n))
                            : (fail++, console.log('  FAIL ' + n + (e ? '  -> ' + e : ''))); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json' };

let apiHits = 0;
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api')) { apiHits++; res.writeHead(404); return res.end('no backend here'); }
  const file = path.join(ROOT, url === '/' ? 'index.html' : decodeURIComponent(url));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function finish(code) {
  try { server.close(); } catch (e) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(code);
}

/* ---------------------------------------------------------------- fixture */
/*
 * The archive is built here in JavaScript rather than by shelling out to `zip`.
 * The previous version assumed /bin/bash, a `zip` binary and a /tmp directory,
 * none of which hold on Windows.
 *
 * Entries are STORED (uncompressed), which is a valid zip the app's
 * DecompressionStream path handles via method 0.
 */
const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);           // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(chunks), cdBuf, eocd]);
}

/* A self-contained game, so the test runs anywhere with no arguments. */
const SAMPLE = [
  ['scenes/startup.txt',
    '*title The Lamplighter\n' +
    '*author A. Tester\n' +
    '*scene_list\n  startup\n  second\n' +
    '*achievement lamp visible 10 First Light\n' +
    '  Light the first lamp.\n' +
    '  Lit the first lamp.\n' +
    '*create warmth 40\n' +
    'The lamps along the canal have gone out.\n' +
    '*page_break Continue\n' +
    'You strike a match.\n' +
    '*choice\n' +
    '  #Light the near lamp.\n' +
    '    *achieve lamp\n' +
    '    Warm light spills across the water.\n' +
    '    *finish\n' +
    '  #Walk on in the [i]dark[/i].\n' +
    '    The canal keeps its secrets.\n' +
    '    *finish\n'],
  ['scenes/second.txt', 'Morning comes to the canal.\n*finish\n'],
  ['scenes/choicescript_stats.txt',
    '*stat_chart\n  percent warmth Warmth\n*finish\n'],
];

/**
 * Read a real game folder, if one was named on the command line.
 * Uses fs, not a shell, so it works the same on every platform.
 */
function readGame(dir) {
  const scenesDir = path.join(dir, 'scenes');
  if (!fs.existsSync(scenesDir)) {
    console.error(`No scenes folder in ${dir}`);
    process.exit(1);
  }
  const files = [];
  for (const f of fs.readdirSync(scenesDir)) {
    if (f.endsWith('.txt')) files.push([`scenes/${f}`, fs.readFileSync(path.join(scenesDir, f))]);
  }
  for (const f of fs.readdirSync(dir)) {
    if (/\.png$/i.test(f) && files.length < 40) files.push([f, fs.readFileSync(path.join(dir, f))]);
  }
  return files;
}

const gameArg = process.argv[2];
const archive = makeZip(gameArg ? readGame(gameArg) : SAMPLE);
console.log(gameArg ? `\nusing game at ${gameArg}` : '\nusing the built-in sample game');

server.listen(PORT, async () => {
  console.log('\nstatic file server on :' + PORT + ' (no API, no engine endpoint)');

  const dom = await JSDOM.fromURL('http://127.0.0.1:' + PORT + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
  });
  const win = dom.window;
  const errors = [];
  win.addEventListener('error', (e) => errors.push(e.message));

  /*
   * jsdom implements none of these. They are universal in browsers; the app is
   * not doing anything exotic. Polyfilling here keeps the test honest about
   * what it is actually exercising.
   */
  const fakeIdb = require('fake-indexeddb');
  win.indexedDB = fakeIdb.indexedDB;
  win.IDBKeyRange = fakeIdb.IDBKeyRange;
  win.DecompressionStream = DecompressionStream;
  win.Blob = Blob;
  win.Response = Response;
  if (!win.crypto.randomUUID) win.crypto.randomUUID = () => require('crypto').randomUUID();
  let objectUrls = 0;
  win.URL.createObjectURL = () => 'blob:test/' + ++objectUrls;
  win.URL.revokeObjectURL = () => {};
  if (!win.navigator.storage) {
    Object.defineProperty(win.navigator, 'storage', {
      value: { estimate: async () => ({ usage: 1024, quota: 1024 * 1024 * 500 }),
               persist: async () => true, persisted: async () => true },
      configurable: true,
    });
  }

  /* jsdom does not execute <script type="module">, which is what Vite emits.
     The entry chunk has no top-level import/export, so running it as a classic
     script is faithful. */
  const src = win.document.querySelector('script[type=module]');
  if (src) {
    const href = src.getAttribute('src').replace(/^\.?\//, '');
    const code = await new Promise((resolve) => {
      http.get('http://127.0.0.1:' + PORT + '/' + href, (r) => {
        const c = []; r.on('data', (x) => c.push(x));
        r.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
      });
    });
    try { win.eval(code); } catch (e) { errors.push('module eval: ' + e.message); }
  }

  await new Promise((r) => setTimeout(r, 1200));
  const d = win.document;

  console.log('\nthe static app loads');
  ok('React mounted', !!d.querySelector('#root > *'), d.body.innerHTML.slice(0, 100));
  ok('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  ok('IndexedDB is available', typeof win.indexedDB === 'object');

  console.log('\nimporting a game entirely in the browser');
  const file = new win.File([new Uint8Array(archive)], 'game.zip', { type: 'application/zip' });
  const input = d.querySelector('input[type=file]');
  ok('a file input exists', !!input);
  if (!input) return finish(1);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));

  await new Promise((r) => setTimeout(r, 4000));

  console.log('\nit plays with no server');
  ok('the engine loaded from static files', typeof win.ChoiceScript === 'object');
  if (typeof win.ChoiceScript !== 'object') {
    console.log('  page errors:', errors.slice(0, 3).join(' | '));
    return finish(1);
  }
  const state = win.ChoiceScript.getState();
  ok('state is serialisable', (function () { try { JSON.stringify(state); return true; } catch (e) { return false; } })());
  ok('scenes were preloaded, not fetched', !!win.allScenes && Object.keys(win.allScenes).length > 0,
    'allScenes: ' + Object.keys(win.allScenes || {}).length);
  ok('title published', !!state.title, JSON.stringify(state.title));

  const body = d.querySelector('.prose-cs');
  ok('the first screen has content',
    !!body && (body.textContent.trim().length > 0 || !!body.querySelector('img')),
    body ? JSON.stringify(body.innerHTML.slice(0, 60)) : 'no .prose-cs');

  const next = Array.prototype.slice.call(d.querySelectorAll('button'))
    .find((b) => /^(Next|Continue)/.test(b.textContent.trim()));
  ok('a control is offered', !!next, next ? next.textContent : 'none');
  if (next) {
    next.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const after = d.querySelector('.prose-cs');
    ok('the story advances', !!after && after.textContent.trim().length > 0);
  }

  console.log('\nnothing reached a server');
  ok('zero /api requests were made', apiHits === 0, apiHits + ' hits');

  console.log('\nit is still the same app');
  const bar = d.querySelector('nav[aria-label="Game controls"]');
  ok('the toolbar renders', !!bar);
  ok('the title bar is sticky', (() => {
    const header = d.querySelector('header');
    return !!header && /sticky/.test(header.className);
  })());
  ok('there is a way back to the library',
    !!d.querySelector('[aria-label="Back to library"]'));
  const labels = bar ? Array.prototype.map.call(bar.querySelectorAll('button'), (b) => b.textContent.trim()) : [];
  ok('controls are named, not bare icons',
    labels.some((t) => /Stats/.test(t)) && labels.some((t) => /Settings/.test(t)),
    JSON.stringify(labels));
  ok('every control clears the 44px target',
    bar ? Array.prototype.every.call(bar.querySelectorAll('button'),
      (b) => (b.className || '').includes('min-h-touch')) : false);
  win.ChoiceScript.setTheme('terminal');
  ok('themes still apply', d.body.classList.contains('theme-terminal'));
  ok('theme tokens resolve from the static stylesheet',
    win.getComputedStyle(d.body).getPropertyValue('--cs-paper').trim() !== '',
    JSON.stringify(win.getComputedStyle(d.body).getPropertyValue('--cs-paper')));
  win.ChoiceScript.openStats();
  await new Promise((r) => setTimeout(r, 400));
  ok('stats dialog opens', !!d.querySelector('[role=dialog]'), win.ChoiceScript.getState().overlay);
  ok('it is a centred dialog, not a drawer',
    !d.querySelector('[data-vaul-drawer]'));
  ok('stat bars render as meters', d.querySelectorAll('[role=meter]').length > 0,
    d.querySelectorAll('[role=meter]').length + ' meters');

  finish(fail ? 1 : 0);
});
