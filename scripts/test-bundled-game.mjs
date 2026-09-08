/**
 * Runs the real end-to-end harness against the bundled game.
 *
 * e2e-test.cjs already accepts a path to an unpacked game and builds its own
 * archive from it, so this does not reimplement any of it: it unpacks
 * src-tauri/games/*.cszip to a temporary directory and hands the path over.
 *
 * The point is that the fixture game proves the plumbing while a real one
 * proves the corpus. Choice of Magics has 22 scenes across 4 MB of text, 100
 * achievements, 325 *achieve calls, 73 *text_image renders, 3 *script blocks
 * and no *ifid — every one of which is a thing the fixture does not exercise.
 *
 * Run: npm run test:game
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const games = join(root, 'src-tauri', 'games');

const archives = existsSync(games)
  ? readdirSync(games).filter((f) => f.endsWith('.cszip'))
  : [];

if (!archives.length) {
  console.log('\nno bundled game in src-tauri/games — nothing to test against.\n');
  process.exit(0);
}

/**
 * A minimal zip reader over the central directory. Node has no zip built in,
 * and a dev dependency for one script that reads one file is not worth it.
 */
function unzip(file, dest) {
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(size);
  readSync(fd, buf, 0, size, 0);
  closeSync(fd);

  /* End of central directory: scan back for the signature, since the comment
     field means it is not at a fixed offset. */
  let eocd = size - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error(`${file} is not a zip`);

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  let written = 0;

  for (let i = 0; i < count; i++) {
    /* Sizes and method come from the central directory, never from the local
       header: an archive written with a data descriptor (general purpose bit 3,
       which streaming zip writers set) leaves both as zero there. */
    const method = buf.readUInt16LE(at + 10);
    const sizeCompressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/') || name.includes('..')) continue;

    const localNameLen = buf.readUInt16LE(localAt + 26);
    const localExtraLen = buf.readUInt16LE(localAt + 28);
    const from = localAt + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(from, from + sizeCompressed);
    const data = method === 0 ? raw : inflateRawSync(raw);

    const target = join(dest, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    written += 1;
  }
  return written;
}

const dest = mkdtempSync(join(tmpdir(), 'cs-game-'));
const written = unzip(join(games, archives[0]), dest);
console.log(`\nunpacked ${archives[0]}: ${written} files`);

/* The game root is wherever scenes/ lives — usually one wrapper down. */
function findRoot(dir) {
  if (existsSync(join(dir, 'scenes'))) return dir;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findRoot(join(dir, entry.name));
    if (found) return found;
  }
  return null;
}

const gameRoot = findRoot(dest);
if (!gameRoot) {
  console.error('no scenes folder in the archive');
  process.exit(1);
}

const scenes = readdirSync(join(gameRoot, 'scenes')).filter((f) => f.endsWith('.txt'));
console.log(`${scenes.length} scenes at ${gameRoot}`);

execFileSync('node', [join(root, 'e2e-test.cjs'), gameRoot], { stdio: 'inherit' });
