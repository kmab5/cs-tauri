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
const CONFIG = join(ROOT, 'src-tauri', 'tauri.standalone.conf.json');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/* ----------------------------------------------------------------- arguments */

function parseArgs(argv) {
  const flags = { portable: false, nsis: false, msi: false, icon: false, skipTests: false, keep: false };
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
  console.error('  Optional: --name, --version, --identifier, --icon, --skip-tests, --keep\n');
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
  const cover = entries.find((e) => new RegExp(`^${root}icon\\.(png|jpe?g)$`, 'i').test(e.name));

  return { title, author, scenes, cover };
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'game';

/* ------------------------------------------------------------------- running */

function run(command, args, label) {
  process.stdout.write(`\n▸ ${label}\n`);
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}

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

function restore() {
  if (!staged || flags.keep) return;
  rmSync(GAMES, { recursive: true, force: true });
  if (existsSync(STASH)) renameSync(STASH, GAMES);
  rmSync(MARKER, { force: true });
  rmSync(CONFIG, { force: true });
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
    JSON.stringify({ standalone: true, title: name, author: game.author, game: slug }, null, 2),
  );

  /* A config overlay, merged by `tauri build --config`. Product name, version
     and identifier all change; everything else is inherited. */
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
        },
      },
      null,
      2,
    ),
  );

  /* ---- test ------------------------------------------------------------- */
  if (flags.skipTests) {
    console.log('\n⚠ tests skipped (--skip-tests)');
  } else {
    run(npm, ['run', 'build'], 'building the window contents');
    run(npm, ['run', 'test:theme'], 'theme tokens resolve');
    run(npm, ['run', 'test:register'], 'chrome tokens in scope');
    /* The harness against *this* game, not the fixture: unpack it, play a
       screen, check the files land. An archive that cannot be played fails
       here rather than shipping. */
    run('node', ['scripts/test-webview.cjs', archive], `playing ${name} in the harness`);
    run(npm, ['run', 'test:rust'], 'rust');
  }

  /* ---- icon ------------------------------------------------------------- */
  if (flags.icon) {
    if (!game.cover) {
      console.log('\n⚠ --icon: the archive has no icon.png or icon.jpg; keeping the app icon');
    } else {
      const tmp = join(ROOT, 'src-tauri', `.cover-${slug}`);
      writeFileSync(tmp, game.cover.read());
      try {
        run(npm, ['run', 'tauri', '--', 'icon', tmp], "deriving the icon from the game's cover");
      } catch {
        console.log('\n⚠ --icon: tauri icon refused the cover (it wants a large square PNG)');
      } finally {
        rmSync(tmp, { force: true });
      }
    }
  }

  /* ---- build ------------------------------------------------------------ */
  const bundles = [flags.nsis && 'nsis', flags.msi && 'msi'].filter(Boolean);
  const args = ['run', 'tauri', '--', 'build', '--config', 'src-tauri/tauri.standalone.conf.json'];
  if (bundles.length) args.push('--bundles', bundles.join(','));
  /* --portable alone still needs a compile, just no installer. */
  else args.push('--no-bundle');
  run(npm, args, `compiling ${name}`);

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
    cpSync(join(ROOT, 'src-tauri', 'icons'), join(stage, 'icons'), { recursive: true });
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

  console.log(`\n✓ ${name} v${version}\n`);
  for (const a of artefacts) console.log(`  ${a}`);
  console.log(`\n  manifest: ${join(outDir, 'BUILD.json')}\n`);
} finally {
  restore();
}
