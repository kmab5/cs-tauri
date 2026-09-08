#!/usr/bin/env node
/*
 * Drives the real window contents against a stand-in for Rust.
 *
 * The old harness proved the app was a static site. That is no longer a
 * property worth having, so this replaces it: dist/ is exactly what the webview
 * loads, and the only thing missing under Node is the IPC bridge. So the bridge
 * is mocked over a real temporary directory, and the app is driven through it.
 *
 * What that means the mock is: a test double, not a second implementation. It
 * unpacks an archive the way archive.rs does because the frontend needs
 * something on disk to read, and no assertion here is about the filter rules —
 * those have their own tests in Rust, which is where they belong.
 *
 * Needs jsdom (a dev dependency).
 * Run: node scripts/test-webview.cjs [path/to/game.cszip]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const zlib = require('zlib');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', 'dist');
const PORT = 9950 + Math.floor(Math.random() * 40);

let pass = 0,
  fail = 0;
/* Not every game exercises every feature: an assertion about a *choice in a
   stats screen cannot fail a game whose stats screen has none. */
const skip = (n, why) => console.log('  --   ' + n + '  (' + why + ')');
const ok = (n, c, e) => {
  c
    ? (pass++, console.log('  ok   ' + n))
    : (fail++, console.log('  FAIL ' + n + (e ? '  -> ' + e : '')));
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('\nNo dist/ to test. Run `npm run build` first.\n');
  process.exit(1);
}

/* ------------------------------------------------------------- fixture zip */

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
  const chunks = [],
    central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
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
  [
    'scenes/startup.txt',
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
      '    *finish\n',
  ],
  ['scenes/second.txt', 'Morning comes to the canal.\n*finish\n'],
  [
    'scenes/choicescript_stats.txt',
    '*stat_chart\n  percent warmth Warmth\n' +
      'How do you carry yourself?\n' +
      '*choice\n' +
      '  #Briskly.\n' +
      '    *set warmth +5\n' +
      '    *goto done\n' +
      '  #Slowly.\n' +
      '    *goto done\n' +
      '*label done\n' +
      '*finish\n',
  ],
];

/* ------------------------------------------------------- the mocked backend */

/**
 * A zip reader over the central directory.
 *
 * Sizes and the compression method are read there and never from the local
 * header: an archive written by a streaming writer sets general purpose bit 3
 * and leaves both as zero locally, filling them in afterwards in a data
 * descriptor. Reading the local header gives Z_BUF_ERROR on a perfectly good
 * archive.
 */
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('not a zip');

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = [];

  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.includes('..')) continue;

    const from = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const raw = buf.subarray(from, from + compressed);
    out.push({ name, data: method === 0 ? raw : zlib.inflateRawSync(raw) });
  }
  return out;
}

const ASSET_EXT = /\.(png|jpg|jpeg|gif|webp|svg|avif|bmp|ico|mp3|ogg|wav|m4a|woff2?|ttf|otf)$/i;
const RUNTIME = /^(index\.html|mygame\.js|scene\.js|util\.js|persist\.js|navigator\.js|style\.css|credits\.html)$/i;

/** Stands in for library.rs: unpack, filter, report. */
function importArchive(dataDir, bytes, source) {
  const entries = readZip(Buffer.from(bytes));
  const rootEntry = entries.find((e) => /(^|\/)scenes\/startup\.txt$/i.test(e.name));
  if (!rootEntry) throw new Error('no ChoiceScript game found');
  const root = rootEntry.name.replace(/scenes\/startup\.txt$/i, '');

  const id = Math.random().toString(16).slice(2).padEnd(16, '0').slice(0, 16);
  const dir = path.join(dataDir, 'games', id);
  const out = { id, scenes: [], assets: [], skipped: [], startup: '', bytes: 0, source };

  for (const entry of entries) {
    if (!entry.name.startsWith(root)) continue;
    const inner = entry.name.slice(root.length);
    const base = inner.split('/').pop();
    if (!inner || base.startsWith('.')) continue;

    const scene = /^scenes\/([^/]+)\.txt$/i.exec(inner);
    if (scene) {
      const text = entry.data.toString('utf8').replace(/^\uFEFF/, '');
      fs.mkdirSync(path.join(dir, 'scenes'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'scenes', scene[1] + '.txt'), text);
      out.scenes.push(scene[1]);
      out.bytes += entry.data.length;
      if (scene[1].toLowerCase() === 'startup') out.startup = text;
      continue;
    }
    if (inner.includes('/scenes/')) continue;
    if (RUNTIME.test(base)) {
      out.skipped.push(base);
      continue;
    }
    if (ASSET_EXT.test(base)) {
      const target = path.join(dir, 'assets', inner);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.data);
      out.assets.push(inner);
      out.bytes += entry.data.length;
    }
  }
  if (!out.scenes.length) throw new Error('no scene files in the archive');
  out.scenes.sort();
  out.assets.sort();
  return out;
}

/** The command table. Each entry is one #[tauri::command] on the Rust side. */
function makeBridge(dataDir, archivePath) {
  const listeners = new Map(); // event name -> Set of callback ids
  const callbacks = new Map(); // id -> fn
  let nextCallback = 1;
  const calls = [];

  const gameDir = (id) => path.join(dataDir, 'games', id);

  const commands = {
    take_pending_archives: () => [],
    take_bundled: () => [],
    import_archive: (args, options) =>
      importArchive(
        dataDir,
        args,
        decodeURIComponent((options && options.headers && options.headers.source) || 'archive'),
      ),
    import_archive_path: ({ path: p }) =>
      importArchive(dataDir, fs.readFileSync(p), path.basename(p)),
    write_manifest: ({ id, manifest }) => {
      fs.writeFileSync(path.join(gameDir(id), 'manifest.json'), JSON.stringify(manifest, null, 2));
      return null;
    },
    list_manifests: () => {
      const dir = path.join(dataDir, 'games');
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .map((id) => path.join(dir, id, 'manifest.json'))
        .filter((f) => fs.existsSync(f))
        .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    },
    read_scenes: ({ id }) => {
      const dir = path.join(gameDir(id), 'scenes');
      const out = {};
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.txt')) out[f.slice(0, -4)] = fs.readFileSync(path.join(dir, f), 'utf8');
      }
      return out;
    },
    asset_root: ({ id }) => path.join(gameDir(id), 'assets'),
    delete_game: ({ id }) => {
      fs.rmSync(gameDir(id), { recursive: true, force: true });
      return null;
    },
    library_bytes: () => 4096,
    read_store: ({ name }) => {
      const f = path.join(dataDir, 'stores', name + '.json');
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    },
    write_store: ({ name, data }) => {
      fs.mkdirSync(path.join(dataDir, 'stores'), { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'stores', name + '.json'), JSON.stringify(data));
      return null;
    },
    decompress: (args, options) => {
      const format = (options && options.headers && options.headers.format) || 'gzip';
      const buf = Buffer.from(args);
      const out =
        format === 'gzip'
          ? zlib.gunzipSync(buf)
          : format === 'deflate'
            ? zlib.inflateSync(buf)
            : zlib.inflateRawSync(buf);
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    },

    /* The event and opener plugins, which the store, the menu and the link
       handler all reach for at boot. */
    'plugin:event|listen': ({ event, handler }) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return 1;
    },
    'plugin:event|unlisten': () => null,
    /* Focus mode and the menu-enable command both reach Rust. */
    'plugin:window|set_fullscreen': () => null,
    set_game_menu_enabled: () => null,
    set_menu_visible: () => null,
    export_game: () => path.join(dataDir, 'exported.cszip'),
    'plugin:opener|open_url': ({ url }) => {
      calls.push('open_url:' + url);
      return null;
    },
  };

  const internals = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
    transformCallback(fn) {
      const id = nextCallback++;
      callbacks.set(id, fn);
      return id;
    },
    convertFileSrc(filePath) {
      return 'asset://localhost/' + encodeURIComponent(filePath);
    },
    invoke(cmd, args, options) {
      calls.push(cmd);
      const fn = commands[cmd];
      if (!fn) return Promise.reject(new Error('unmocked command: ' + cmd));
      try {
        return Promise.resolve(fn(args, options));
      } catch (e) {
        return Promise.reject(e);
      }
    },
  };

  return { internals, calls, archivePath, callbacks, listeners };
}

/* ------------------------------------------------------------------ server */

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = path.join(ROOT, url === '/' ? 'index.html' : decodeURIComponent(url));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function finish(code) {
  try {
    server.close();
  } catch (e) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(code);
}

/* -------------------------------------------------------------------- run */

const arg = process.argv[2];
const archive = arg ? fs.readFileSync(arg) : makeZip(SAMPLE);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-appdata-'));
console.log(arg ? `\nusing ${arg}` : '\nusing the built-in sample game');
console.log(`app data in ${dataDir}`);

server.listen(PORT, async () => {
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + PORT + '/', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const errors = [];
  win.addEventListener('error', (e) => errors.push(e.message));

  /* The bridge has to exist before any application script runs: main.tsx
     checks for it, and the store installs itself off the back of it. */
  const bridge = makeBridge(dataDir, arg);
  win.__TAURI_INTERNALS__ = bridge.internals;
  /* @tauri-apps/api reaches for this directly when unlistening, without a
     guard, so an absent one throws inside a cleanup nobody can catch. */
  win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };

  /* jsdom implements none of these. They are universal in both webviews the
     app actually runs in, so polyfilling keeps the test honest. */
  win.DecompressionStream = DecompressionStream;
  /* jsdom stubs window.scrollTo with a warning but never defines the element
     method, so scrolling the reading pane throws rather than no-opping. */
  win.Element.prototype.scrollTo = function () {};
  /* jsdom has no matchMedia. Reporting the wide breakpoint as matching is what
     lets the docked stats panel be exercised at all; layout is never computed
     here, so the window's nominal width is irrelevant. */
  win.matchMedia = (media) => ({
    media,
    matches: /min-width:\s*1100px/.test(media),
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  win.Blob = Blob;
  win.Response = Response;
  if (!win.crypto.randomUUID) win.crypto.randomUUID = () => require('crypto').randomUUID();

  /* jsdom does not execute <script type=module>, which is what Vite emits.
     The entry chunk has no top-level import/export, so running it as a classic
     script is faithful. */
  const src = win.document.querySelector('script[type=module]');
  if (src) {
    const href = src.getAttribute('src').replace(/^\.?\//, '');
    const code = await new Promise((resolve) => {
      http.get('http://127.0.0.1:' + PORT + '/' + href, (r) => {
        const c = [];
        r.on('data', (x) => c.push(x));
        r.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
      });
    });
    try {
      win.eval(code);
    } catch (e) {
      errors.push('module eval: ' + e.message);
    }
  }

  await new Promise((r) => setTimeout(r, 1200));
  const d = win.document;

  console.log('\nthe window loads');
  ok('React mounted', !!d.querySelector('#root > *'), d.body.innerHTML.slice(0, 120));
  ok('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  ok('the IPC bridge was used', bridge.calls.length > 0, bridge.calls.slice(0, 4).join(', '));
  ok(
    'it did not fall back to the browser notice',
    !/Open this in the desktop app/.test(d.body.textContent),
  );
  ok('the platform is marked on the document', !!d.documentElement.dataset.platform);
  ok('a theme is applied to the document', /theme-/.test(d.body.className), d.body.className);

  console.log('\nthe frame is a window, not a page');
  ok('the library page owns the window', !!d.querySelector('.lib-head h1'),
    d.querySelector('.lib-head h1')?.textContent);
  ok('there is a titlebar', !!d.querySelector('.app-titlebar'));
  ok(
    'the titlebar is a drag region',
    !!d.querySelector('.app-titlebar[data-tauri-drag-region]'),
  );
  ok(
    'its controls are not draggable',
    !!d.querySelector('.app-titlebar [data-tauri-drag-region="false"]'),
  );
  ok('the reading pane scrolls, not the window', !!d.querySelector('.app-reading'));

  console.log('\nimporting a game through the bridge');
  const file = new win.File([new Uint8Array(archive)], 'game.cszip', { type: 'application/zip' });
  const input = d.querySelector('input[type=file]');
  ok('a file input exists', !!input);
  if (!input) return finish(1);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));

  await new Promise((r) => setTimeout(r, 1500));

  const games = fs.existsSync(path.join(dataDir, 'games'))
    ? fs.readdirSync(path.join(dataDir, 'games'))
    : [];
  ok('the game landed on disk', games.length === 1, games.join(', '));
  const gameDir = games.length ? path.join(dataDir, 'games', games[0]) : null;
  ok('its manifest was written', !!gameDir && fs.existsSync(path.join(gameDir, 'manifest.json')));
  const manifest = gameDir && fs.existsSync(path.join(gameDir, 'manifest.json'))
    ? JSON.parse(fs.readFileSync(path.join(gameDir, 'manifest.json'), 'utf8'))
    : null;
  ok('the title was parsed from startup.txt', !!manifest && !!manifest.title, manifest && manifest.title);
  ok(
    'the scene list was parsed',
    !!manifest && manifest.sceneList.length > 0,
    manifest && String(manifest.sceneList.length) + ' scenes',
  );
  ok(
    'achievements were parsed',
    !!manifest && manifest.achievements.length > 0,
    manifest && String(manifest.achievements.length),
  );
  ok(
    'scenes are readable text on disk',
    !!gameDir && fs.readFileSync(path.join(gameDir, 'scenes', 'startup.txt'), 'utf8').includes('*title'),
  );
  ok('it appears on the shelf', /./.test(d.querySelector('.lib-card-title')?.textContent || ''),
    d.querySelector('.lib-card-title')?.textContent);
  ok('the shelf card is the play target', !!d.querySelector('button.lib-card'));

  console.log('\nit plays');
  const play = d.querySelector('button.lib-card');
  if (play) play.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 3000));

  ok('the engine loaded from the bundle', typeof win.ChoiceScript === 'object');
  if (typeof win.ChoiceScript !== 'object') {
    console.log('  page errors:', errors.slice(0, 3).join(' | '));
    return finish(1);
  }
  const state = win.ChoiceScript.getState();
  ok('state is serialisable', (() => { try { JSON.stringify(state); return true; } catch (e) { return false; } })());
  ok(
    'scenes were preloaded from disk, never fetched',
    !!win.allScenes && Object.keys(win.allScenes).length > 0,
    'allScenes: ' + Object.keys(win.allScenes || {}).length,
  );
  ok('the title reached the titlebar', !!d.querySelector('.app-title b')?.textContent.trim());
  ok('the author sits under it, not beside it', !!d.querySelector('.app-title span'),
    d.querySelector('.app-title span')?.textContent);
  ok('the sidebar became the game panel', !!d.querySelector('aside[aria-label="This game"]'));
  ok('there is no way to switch games from here', !d.querySelector('.lib-card'));
  ok('and a way back to the shelf', !!d.querySelector('aside[aria-label="This game"] .app-btn'));

  const body = d.querySelector('.prose-cs');
  ok(
    'the first screen has content',
    !!body && (body.textContent.trim().length > 0 || !!body.querySelector('img')),
    body ? JSON.stringify(body.innerHTML.slice(0, 60)) : 'no .prose-cs',
  );

  const next = Array.prototype.slice
    .call(d.querySelectorAll('button'))
    .find((b) => /^(Next|Continue)/.test(b.textContent.trim()));
  ok('a control is offered', !!next, next ? next.textContent : 'none');
  if (next) {
    next.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const after = d.querySelector('.prose-cs');
    ok('the story advances', !!after && after.textContent.trim().length > 0);
  }

  console.log('\nthe sidebar splits, and saves are in it');
  ok('the panel has both sections',
    d.querySelectorAll('aside[aria-label="This game"] .app-pane').length === 2);
  ok('the sections have a divider to drag', !!d.querySelector('.app-vsplit'));
  ok('saving is offered in the sidebar', !!d.querySelector('#sidebar-save-name'));
  const collapse = d.querySelectorAll('.app-pane-head button');
  ok('each section can be collapsed', collapse.length === 2);
  if (collapse.length === 2) {
    collapse[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    ok('collapsing hides the body but keeps the header',
      d.querySelectorAll('aside[aria-label="This game"] .app-pane-body').length === 1 &&
        d.querySelectorAll('.app-pane-head').length === 2);
    collapse[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log('\nachievements dock, stats do not');
  const achBtn = Array.prototype.slice
    .call(d.querySelectorAll('.app-titlebar button'))
    .find((b) => /Achievements/.test(b.textContent));
  ok('the achievements control is in the titlebar', !!achBtn);
  if (achBtn) {
    achBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    ok('achievements dock as a panel',
      !!d.querySelector('aside[aria-label=Achievements]') && !d.querySelector('[role=dialog]'));
    ok('the story is still on screen beside them', !!d.querySelector('.prose-cs'));
    achBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    ok('and close again', !d.querySelector('aside[aria-label=Achievements]'));
  }
  /* A stats screen can contain a *choice, which needs the engine's stats mode
     held up while the reader answers — so it cannot share the window with a
     live story. It is a dialog, deliberately. */
  const statsBtn = Array.prototype.slice
    .call(d.querySelectorAll('.app-titlebar button'))
    .find((b) => /Stats/.test(b.textContent));
  if (statsBtn) {
    statsBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    ok('stats open as a dialog, not a panel',
      !!d.querySelector('[role=dialog]') && !d.querySelector('aside[aria-label=Stats]'));
    win.ChoiceScript.closeOverlay();
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\nan interactive stats screen answers itself, not the story');
  /*
   * The bug this replaces: the stats dialog reused the story's radio ids, so a
   * <label htmlFor> inside it resolved to the story's radio behind the dialog
   * and answering the stats screen silently picked a story option.
   */
  const storyBefore = d.querySelector('.app-reading input[type=radio]:checked');
  win.ChoiceScript.openStats();
  await new Promise((r) => setTimeout(r, 700));
  const dialogRadios = Array.prototype.slice.call(
    d.querySelectorAll('[role=dialog] input[type=radio]'),
  );
  if (!dialogRadios.length) {
    skip('the stats screen offers its own choice', "this game's stats screen has none");
  } else {
    ok('the stats screen offers its own choice', dialogRadios.length >= 2,
      dialogRadios.length + ' radios');
    ok('its ids are scoped to the stats channel',
      dialogRadios.every((r) => r.id.startsWith('stats-')),
      dialogRadios.map((r) => r.id).join(', '));
    ok("and its radio group is separate from the story's",
      dialogRadios.every((r) => r.name.startsWith('stats-')),
      dialogRadios.map((r) => r.name).join(', '));
  }

  if (dialogRadios.length) {
    const label = d.querySelector(`[role=dialog] label[for="${dialogRadios[0].id}"]`);
    ok('its label points into the dialog, not the page',
      !!label && d.getElementById(dialogRadios[0].id).closest('[role=dialog]') !== null);
    if (label) label.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    ok('answering it left the story choice alone',
      (d.querySelector('.app-reading input[type=radio]:checked') || null) === storyBefore);
  }
  win.ChoiceScript.closeOverlay();
  await new Promise((r) => setTimeout(r, 300));

  console.log('\nthe game travels with its saves');
  ok('exporting is offered in the sidebar',
    !!Array.prototype.slice
      .call(d.querySelectorAll('aside[aria-label="This game"] button'))
      .find((b) => /Export/.test(b.textContent)));
  ok('the panel shows facts as tiles, not a list of text',
    d.querySelectorAll('.app-fact').length >= 2,
    d.querySelectorAll('.app-fact').length + ' tiles');
  ok('opening the game stamped it as played',
    !!manifest && games.length === 1 &&
      !!JSON.parse(fs.readFileSync(path.join(gameDir, 'manifest.json'), 'utf8')).lastPlayedAt);

  console.log('\nthe design system holds');
  const varOf = (name) => win.getComputedStyle(d.body).getPropertyValue(name).trim();
  ok('the spacing scale is declared', varOf('--app-2') === '8px', varOf('--app-2'));
  ok('the type scale is declared', varOf('--app-text-md') !== '', varOf('--app-text-md'));
  ok('the z-index ladder is declared', varOf('--z-modal') !== '', varOf('--z-modal'));
  ok('there is a skip link to the story', !!d.querySelector('a.app-skip[href="#story"]'));
  ok('the story is a main landmark', !!d.querySelector('main.app-reading#story'));
  /* The old save row carried a 3px left accent border — the detector's top AI
     tell, and ten competing stripes in a ten-save list. */
  const save = d.querySelector('.app-save');
  ok('save rows are rows, not accent-striped cards',
    !save || win.getComputedStyle(save).borderLeftWidth !== '3px',
    save ? win.getComputedStyle(save).borderLeftWidth : 'no saves yet');

  console.log('\nthe chrome follows the theme');
  const paper = () => win.getComputedStyle(d.body).getPropertyValue('--cs-paper').trim();
  const chrome = () => win.getComputedStyle(d.body).getPropertyValue('--app-chrome').trim();
  ok('page tokens resolve', paper() !== '', JSON.stringify(paper()));
  ok('chrome tokens resolve', chrome() !== '', JSON.stringify(chrome()));
  /* jsdom does not resolve var() chains in custom properties, so this checks
     the derivation rather than the resolved colour: the chrome token points at
     an engine theme token instead of carrying a palette of its own. Where it is
     declared is check-register.mjs's job. */
  ok('chrome is derived from the theme, not a second palette',
    /--cs-/.test(chrome()), JSON.stringify(chrome()));

  const before = [paper(), chrome()].join('|');
  win.ChoiceScript.setTheme('terminal');
  await new Promise((r) => setTimeout(r, 300));
  ok('the reading theme applied', d.body.classList.contains('theme-terminal'));
  ok('and the chrome moved with it', [paper(), chrome()].join('|') !== before,
    before + ' -> ' + [paper(), chrome()].join('|'));

  console.log('\nsaves are files');
  await new Promise((r) => setTimeout(r, 600));
  const stores = fs.existsSync(path.join(dataDir, 'stores'))
    ? fs.readdirSync(path.join(dataDir, 'stores'))
    : [];
  ok('the engine store was written to disk', stores.length > 0, stores.join(', '));
  ok(
    'it is namespaced to this game',
    stores.some((f) => f.startsWith('CS-')),
    stores.join(', '),
  );

  console.log('\noverlays still work');
  win.ChoiceScript.openStats();
  await new Promise((r) => setTimeout(r, 400));
  ok('the stats screen opens', !!d.querySelector('[role=dialog]'), win.ChoiceScript.getState().overlay);
  ok('stat bars render as meters', d.querySelectorAll('[role=meter]').length > 0,
    d.querySelectorAll('[role=meter]').length + ' meters');

  finish(fail ? 1 : 0);
});
