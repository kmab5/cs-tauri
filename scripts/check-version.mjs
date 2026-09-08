/**
 * Keeps the three places a version can live from drifting apart.
 *
 * `package.json` is the single source of truth: `tauri.conf.json` deliberately
 * has no `version` key, so Tauri reads it from there and the installer, the
 * window's About box and the release all agree by construction. The crate
 * version has to be written separately, because Cargo cannot read package.json.
 *
 * Called with an argument, it also checks a git tag matches — which is what CI
 * does before it spends ten minutes building an installer that would have been
 * labelled wrong.
 *
 * Run: node scripts/check-version.mjs [v0.1.6]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const pkg = JSON.parse(read('package.json')).version;

/* The first version key in the [package] table, not any dependency's. */
const cargo = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const conf = JSON.parse(read('src-tauri/tauri.conf.json'));

const problems = [];
if (!pkg) problems.push('package.json has no version');
if (cargo !== pkg) problems.push(`src-tauri/Cargo.toml is ${cargo}, package.json is ${pkg}`);
if (conf.version) {
  problems.push(
    `src-tauri/tauri.conf.json pins version ${conf.version}; remove the key so it follows package.json`,
  );
}

const tag = process.argv[2];
if (tag) {
  const wanted = tag.replace(/^v/, '');
  if (wanted !== pkg) problems.push(`tag ${tag} does not match package.json ${pkg}`);
}

if (problems.length) {
  console.error('\nversions disagree:\n');
  for (const p of problems) console.error(`  fail  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`\nversion ${pkg}${tag ? ` matches tag ${tag}` : ''}, crate and config agree.\n`);
