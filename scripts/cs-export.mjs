#!/usr/bin/env node
/**
 * Build a standalone app for one game.
 *
 *   npm run cs:export -- --game sordwin.cszip --out dist-apps/sordwin \
 *     --portable --nsis --msi
 *
 * Bare names resolve against `stories/`, the inbox for this command.
 *
 * The result is the same player with the shelf removed: one game, no library,
 * no importing, and the game's own name on the window and the installer.
 *
 * How it works, and why this way:
 *
 * - **Nothing is forked.** The standalone app is this app, built with one extra
 *   resource file (`standalone.json`) and one archive in `src-tauri/games/`.
 *   The mode is read at runtime (`app_mode`), so a single-game build and a
 *   library build are the same code and the same binary — there is no second
 *   frontend to keep in step.
 * - **The workspace is restored.** Both of those live inside `src-tauri/`, so
 *   the build has to touch the tree. Everything moved is moved back in a
 *   `finally`, including on Ctrl-C.
 * - **Tests run first, against the actual game.** Not the fixture: the webview
 *   harness is pointed at the archive being shipped, so an archive that cannot
 *   be unpacked or played fails the build instead of shipping.
 *
 * Flags:
 *   --game <path>      the .cszip to ship            (required)
 *   --out <dir>        where the artefacts go        (required)
 *   --portable         a zip with the bare .exe      (Windows)
 *   --nsis             .exe installer                (Windows)
 *   --msi              .msi installer                (Windows)
 *   --name <string>    override the product name
 *   --version <semver> override the app version
 *   --identifier <id>  override the bundle identifier
 *   --author           an authoring build: god mode and the trace console on
 *   --icon             derive the app icon from the game's cover art
 *   --skip-tests       build without the test pass   (say why in the commit)
 *   --keep             leave the staged tree in place, for debugging
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = join(ROOT, 'src-tauri', 'games');
const STASH = join(ROOT, 'src-tauri', '.games-stash');
const MARKER = join(ROOT, 'src-tauri', 'standalone.json');
/* Named per game and relative to src-tauri, because the overlay config points
   at it and Tauri resolves bundle.icon paths from there. */
const iconDirFor = (slug) => `.icons-${slug}`;
const CONFIG = join(ROOT, 'src-tauri', 'tauri.standalone.conf.json');

/**
 * Everything is spawned as `node <script>`, never through npm.
 *
 * On Windows `npm` is `npm.cmd`, and since the fix for CVE-2024-27980 Node
 * refuses to spawn a `.cmd` or `.bat` without `shell: true` — `spawnSync
 * npm.cmd EINVAL`, which is exactly what this hit on Node 24. Turning the shell
 * on instead would mean hand-quoting every path, and paths here come from the
 * user.
 *
 * So each step resolves the package's own JS entry point out of its
 * `package.json` `bin` field and runs it on `process.execPath`. No shell, no
 * `.cmd`, no quoting, and one less process per step.
 */
function resolveBin(pkg, bin) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8'));
  const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bin];
  if (!entry) throw new Error(`${pkg} has no "${bin}" entry point — is it installed?`);
  return join(ROOT, 'node_modules', pkg, entry);
}

/* ----------------------------------------------------------------- arguments */

function parseArgs(argv) {
  const flags = {
    portable: false,
    nsis: false,
    msi: false,
    icon: false,
    author: false,
    skipTests: false,
    keep: false,
  };
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    switch (key) {
      case 'portable':
      case 'nsis':
      case 'msi':
      case 'icon':
      case 'author':
      case 'keep':
        flags[key] = true;
        break;
      case 'skip-tests':
        flags.skipTests = true;
        break;
      /* --location and --output are accepted as aliases: they are what the
         first draft of this interface used, and muscle memory outlives docs. */
      case 'game':
      case 'location':
        opts.game = argv[++i];
        break;
      case 'out':
      case 'output':
        opts.out = argv[++i];
        break;
      default:
        opts[key] = argv[++i];
    }
  }
  return { flags, opts };
}

function usage(message) {
  console.error(`\n${message}\n`);
  console.error('  npm run cs:export -- --game <archive.cszip> --out <dir> [--portable] [--nsis] [--msi]\n');
  console.error(
    '  Optional: --name, --version, --identifier, --icon, --author, --skip-tests, --keep\n',
  );
  process.exit(1);
}

/* --------------------------------------------------------------- the archive */

/**
 * Read the archive's central directory.
 *
 * Sizes and the compression method come from there and never from the local
 * header: an archive written by a streaming writer sets general purpose bit 3
 * and leaves both fields zero locally, which reads as a corrupt file.
 */
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('not a zip archive');

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
    if (name.endsWith('/')) continue;
    const from = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const raw = buf.subarray(from, from + compressed);
    out.push({ name, read: () => (method === 0 ? raw : inflateRawSync(raw)) });
  }
  return out;
}

/** Title, author and cover, straight out of the archive. */
function inspect(bytes, archivePath) {
  const entries = readZip(bytes);
  const startup = entries.find((e) => /(^|\/)scenes\/startup\.txt$/i.test(e.name));
  if (!startup) {
    throw new Error(
      'no ChoiceScript game in that archive: it needs a scenes/ folder with a startup.txt',
    );
  }
  const text = startup.read().toString('utf8').replace(/^\uFEFF/, '');
  const scenes = entries.filter((e) => /(^|\/)scenes\/[^/]+\.txt$/i.test(e.name)).length;

  /* The same two directives library.ts parses, and nothing more — the app does
     the rest of the parsing at import time. */
  const title = (/^\s*\*title\s+(.+)$/im.exec(text)?.[1] ?? basename(archivePath, '.cszip')).trim();
  const author = (/^\s*\*author\s+(.+)$/im.exec(text)?.[1] ?? '').trim();

  const root = startup.name.replace(/scenes\/startup\.txt$/i, '');
  /* Plural: Choice of Magics ships icon.jpg at 1024² *and* icon.png at 192².
     Taking whichever came first in the archive would have thrown away the only
     usable one. */
  const covers = entries.filter((e) =>
    new RegExp(`^${root}icon\\.(png|jpe?g)$`, 'i').test(e.name),
  );

  return { title, author, scenes, covers };
}

/**
 * Format and dimensions from the file's own header — PNG's IHDR, or JPEG's
 * first SOF marker. Enough to say *why* a cover is unusable before handing it
 * to a tool that will only say it is.
 */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) break;
      const marker = buf[at + 1];
      const length = buf.readUInt16BE(at + 2);
      /* SOF0..SOF15, skipping the four that are not frame headers. */
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc, 0xd8].includes(marker)) {
        return { type: 'jpeg', h: buf.readUInt16BE(at + 5), w: buf.readUInt16BE(at + 7) };
      }
      at += 2 + length;
    }
    return { type: 'jpeg', w: 0, h: 0 };
  }
  return null;
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'game';

/* ------------------------------------------------------------------- running */

/*
 * Steps are numbered on stdout — `▸ [3/7] compiling` — for two readers at once:
 * a person watching a terminal, and the GUI, which parses the counter to show
 * progress. A build takes minutes; "something is happening" is not enough.
 */
let step = 0;
let steps = 0;

function plan(n) {
  steps = n;
  step = 0;
}

function run(command, args, label) {
  step += 1;
  process.stdout.write(`\n▸ [${step}/${steps}] ${label}\n`);
  try {
    execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`${label}: could not run ${command} — is it on PATH?`);
    }
    throw e;
  }
}

/** A JS entry point, on this same Node. */
const node = (script, args, label) => run(process.execPath, [script, ...args], label);

/** A repo script, by path. */
const own = (script, args, label) => node(join(ROOT, script), args, label);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

function collect(dir, match, into = []) {
  if (!existsSync(dir)) return into;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path, match, into);
    else if (match.test(entry.name)) into.push(path);
  }
  return into;
}

/* ---------------------------------------------------------------------- main */

const { flags, opts } = parseArgs(process.argv.slice(2));
if (!opts.game) usage('Which game? Pass --game path/to/game.cszip');
if (!opts.out) usage('Where should it go? Pass --out path/to/output/dir');

/* Bare names resolve against the inbox, so the everyday case is
   `--game sordwin.cszip` rather than a path. */
const INBOX = join(ROOT, 'stories');
const candidates = [resolve(opts.game), join(INBOX, opts.game)];
const archive = candidates.find((p) => existsSync(p));
if (!archive) {
  usage(`No archive at ${candidates[0]}\n  Nor at ${candidates[1]}`);
}

const outDir = resolve(opts.out);
const windows = process.platform === 'win32';
const wanted = [flags.nsis && 'nsis', flags.msi && 'msi', flags.portable && 'portable'].filter(Boolean);
if (!wanted.length) {
  usage('Nothing to build. Pass at least one of --portable, --nsis, --msi');
}
if (!windows && (flags.nsis || flags.msi)) {
  usage(
    `--nsis and --msi are Windows-only formats and this is ${process.platform}.\n` +
      '  Tauri cannot cross-compile them; run this on Windows, or drop those flags.',
  );
}

/*
 * Read the bytes *before* anything is staged. The archive is allowed to live in
 * `src-tauri/games/` — that is where a bundled game already sits — and staging
 * moves that whole directory aside, which would pull the source file out from
 * under the copy. Found that the first time this ran.
 */
const bytes = readFileSync(archive);
const game = inspect(bytes, archive);
const name = opts.name ?? game.title;
const slug = slugify(name);
const version = opts.version ?? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const identifier = opts.identifier ?? `com.kmab.cs-tauri.${slug.replace(/-/g, '')}`;

console.log(`\n  ${name}${game.author ? ` — ${game.author}` : ''}`);
console.log(`  ${game.scenes} scenes · ${(statSync(archive).size / 1048576).toFixed(1)} MB archive`);
console.log(`  v${version} · ${identifier}`);
console.log(`  building: ${wanted.join(', ')}\n`);

let staged = false;
/* Six test steps, the icon, the compile, and the collection. */
plan((flags.skipTests ? 0 : 6) + (flags.icon ? 1 : 0) + 1);
/** Set by --icon: the per-game icon directory, relative to src-tauri. */
let iconOverride = null;

function restore() {
  if (!staged || flags.keep) return;
  rmSync(GAMES, { recursive: true, force: true });
  if (existsSync(STASH)) renameSync(STASH, GAMES);
  rmSync(MARKER, { force: true });
  rmSync(CONFIG, { force: true });
  /*
   * The game's icons live in their own directory and are simply deleted. They
   * are never written into src-tauri/icons: stashing that and putting it back
   * afterwards was the previous approach and it was wrong — any crash, kill or
   * locked file between the two halves left the player wearing a game's cover,
   * and the window for that included a five-minute cargo build.
   */
  rmSync(join(ROOT, 'src-tauri', iconDirFor(slug)), { recursive: true, force: true });
  staged = false;
}

/* Ctrl-C during a five-minute cargo build must not leave the tree staged. */
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

try {
  /* ---- stage: exactly one game, plus the marker that switches the mode ---- */
  if (existsSync(STASH)) rmSync(STASH, { recursive: true, force: true });
  if (existsSync(GAMES)) renameSync(GAMES, STASH);
  mkdirSync(GAMES, { recursive: true });
  staged = true;

  /* Only this archive ships. A stray second .cszip would be imported on first
     run and the "standalone" app would open with two games in it. */
  writeFileSync(join(GAMES, `${slug}.cszip`), bytes);
  if (existsSync(join(STASH, 'README.md'))) {
    copyFileSync(join(STASH, 'README.md'), join(GAMES, 'README.md'));
  }

  writeFileSync(
    MARKER,
    JSON.stringify(
      {
        standalone: true,
        title: name,
        author: game.author,
        game: slug,
        /* Baked, not a setting: an exported story is either a release build or
           a testing build, and which one was decided here. */
        authorMode: flags.author,
      },
      null,
      2,
    ),
  );

  /* ---- test ------------------------------------------------------------- */
  if (flags.skipTests) {
    console.log('\n⚠ tests skipped (--skip-tests)');
  } else {
    /* `npm run build`, step by step, so there is no shell in the chain. */
    own('scripts/check-stale.mjs', [], 'no stale files from an earlier version');
    own('scripts/build-engine.mjs', [], 'bundling the engine');
    node(resolveBin('typescript', 'tsc'), ['-b'], 'typechecking');
    node(resolveBin('vite', 'vite'), ['build'], 'building the window contents');

    own('check-theme-scope.cjs', [], 'theme tokens resolve');
    own('scripts/check-register.mjs', [], 'chrome tokens in scope');

    /* The harness against *this* game, not the fixture: unpack it, play a
       screen, check the files land. An archive that cannot be played fails
       here rather than shipping. */
    own('scripts/test-webview.cjs', [archive], `playing ${name} in the harness`);
    /* And the single-game interface the build is about to produce. */
    own('scripts/test-webview.cjs', [archive, '--standalone'], 'the standalone interface');

    /* cargo is a real executable on every platform, so it needs none of the
       above — only the manifest path, since there is no shell to cd with. */
    run('cargo', ['test', '--manifest-path', join('src-tauri', 'Cargo.toml')], 'rust');
  }

  /* ---- icon ------------------------------------------------------------- */
  if (flags.icon) {
    /* Best candidate, not first: square, then largest, PNG breaking ties since
       that is what the tool documents. */
    const measured = game.covers
      .map((entry) => {
        const bytes = entry.read();
        return { entry, bytes, size: imageSize(bytes) };
      })
      .filter((c) => c.size)
      .sort(
        (a, b) =>
          Number(b.size.w === b.size.h) - Number(a.size.w === a.size.h) ||
          b.size.w * b.size.h - a.size.w * a.size.h ||
          Number(b.size.type === 'png') - Number(a.size.type === 'png'),
      );
    const best = measured[0];

    if (!best) {
      console.log('\n⚠ --icon: no readable icon.png or icon.jpg in the archive; keeping the app icon');
    } else if (best.size.w !== best.size.h || best.size.w < 1024) {
      /* Checked here rather than left to fail inside the tool: "tauri icon
         refused the cover" tells you nothing about why. Upscaling a 192px
         cover would look worse than the app's own icon, so it is not done. */
      console.log(
        `\n⚠ --icon: the best cover is ${best.entry.name} at ${best.size.w}×${best.size.h}; ` +
          'tauri icon wants a square image of at least 1024×1024. Keeping the app icon',
      );
    } else {
      const cover = best.bytes;
      const size = best.size;
      console.log(
        `\n  icon source: ${best.entry.name} (${size.type.toUpperCase()} ${size.w}×${size.h})`,
      );
      const iconDir = join(ROOT, 'src-tauri', iconDirFor(slug));
      rmSync(iconDir, { recursive: true, force: true });
      mkdirSync(iconDir, { recursive: true });
      /* Keep the real extension: the tool sniffs the format, and a .png that
         is actually a JPEG is a worse failure than an honest .jpg. */
      const tmp = join(ROOT, 'src-tauri', `.cover-${slug}.${size.type === 'png' ? 'png' : 'jpg'}`);
      writeFileSync(tmp, cover);
      try {
        /* -o keeps this out of src-tauri/icons entirely. The player's own icon
           is never touched by an export, whatever happens next. */
        node(
          resolveBin('@tauri-apps/cli', 'tauri'),
          ['icon', tmp, '-o', iconDir],
          "deriving the icon from the game's cover",
        );
        iconOverride = iconDirFor(slug);
      } catch {
        rmSync(iconDir, { recursive: true, force: true });
        console.log(
          `\n⚠ --icon: tauri icon would not take ${best.entry.name}` +
            (size.type === 'png'
              ? '. Keeping the app icon'
              : ' — it documents PNG input. Convert it to a 1024×1024 PNG and put that in the\n' +
                '  archive as icon.png. Keeping the app icon'),
        );
      } finally {
        rmSync(tmp, { force: true });
      }
    }
  }

  /* ---- config ----------------------------------------------------------- */
  /*
   * Written here rather than during staging because it carries the icon paths,
   * and the icons are derived above. A config overlay, merged by
   * `tauri build --config`: product name, version, identifier and icons change,
   * everything else is inherited.
   */
  writeFileSync(
    CONFIG,
    JSON.stringify(
      {
        productName: name,
        version,
        identifier,
        bundle: {
          resources: ['games/*.cszip', 'standalone.json'],
          shortDescription: name,
          longDescription: `${name}${game.author ? ` by ${game.author}` : ''}. A ChoiceScript story.`,
          /* No .cszip association: a single-game app has nothing to do with
             someone else's archive. */
          fileAssociations: [],
          ...(iconOverride
            ? {
                icon: [
                  `${iconOverride}/32x32.png`,
                  `${iconOverride}/128x128.png`,
                  `${iconOverride}/128x128@2x.png`,
                  `${iconOverride}/icon.icns`,
                  `${iconOverride}/icon.ico`,
                ],
              }
            : {}),
        },
      },
      null,
      2,
    ),
  );

  /* ---- build ------------------------------------------------------------ */
  const bundles = [flags.nsis && 'nsis', flags.msi && 'msi'].filter(Boolean);
  const args = ['build', '--config', 'src-tauri/tauri.standalone.conf.json'];
  if (bundles.length) args.push('--bundles', bundles.join(','));
  /* --portable alone still needs a compile, just no installer. */
  else args.push('--no-bundle');
  node(resolveBin('@tauri-apps/cli', 'tauri'), args, `compiling ${name}`);

  /* ---- collect ---------------------------------------------------------- */
  mkdirSync(outDir, { recursive: true });
  const release = join(ROOT, 'src-tauri', 'target', 'release');
  const artefacts = [];

  for (const file of collect(join(release, 'bundle'), /\.(exe|msi|dmg|AppImage|deb)$/)) {
    const target = join(outDir, basename(file));
    copyFileSync(file, target);
    artefacts.push(target);
  }

  if (flags.portable) {
    /* Globbed, not named: Tauri derives the binary name from productName, so
       hardcoding either that or the crate name is a guess. */
    const exe = readdirSync(release)
      .filter((f) => (windows ? f.endsWith('.exe') : !f.includes('.')))
      .map((f) => join(release, f))
      .filter((f) => statSync(f).isFile() && !/setup|installer/i.test(f))[0];
    if (!exe) throw new Error(`no executable in ${release}`);

    const stage = join(outDir, `${slug}-${version}-portable`);
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(join(stage, 'games'), { recursive: true });
    copyFileSync(exe, join(stage, `${name}${windows ? '.exe' : ''}`));
    /* The game and the marker travel beside the executable, which is where
       Tauri resolves resources for an unpackaged binary. */
    writeFileSync(join(stage, 'games', `${slug}.cszip`), bytes);
    copyFileSync(MARKER, join(stage, 'standalone.json'));
    cpSync(join(ROOT, 'src-tauri', iconOverride ?? 'icons'), join(stage, 'icons'), {
      recursive: true,
    });
    artefacts.push(stage);
    console.log(`\n  portable tree: ${stage}`);
  }

  writeFileSync(
    join(outDir, 'BUILD.json'),
    JSON.stringify(
      {
        name,
        author: game.author || null,
        version,
        identifier,
        scenes: game.scenes,
        builtAt: new Date().toISOString(),
        platform: process.platform,
        player: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version,
        artefacts: artefacts.map((a) => ({
          file: basename(a),
          bytes: statSync(a).isFile() ? statSync(a).size : null,
          sha256: statSync(a).isFile() ? sha256(a) : null,
        })),
      },
      null,
      2,
    ),
  );

  process.stdout.write(`\n▸ [${steps}/${steps}] done\n`);
  console.log(`\n✓ ${name} v${version}\n`);
  for (const a of artefacts) console.log(`  ${a}`);
  console.log(`\n  manifest: ${join(outDir, 'BUILD.json')}\n`);
} finally {
  restore();
}
