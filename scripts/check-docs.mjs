/**
 * Fails if the landing page has drifted from the repository.
 *
 * "Stays up to date" is only true if something checks. The page is generated,
 * so the check is simply: generate it again and see whether the file on disk
 * matches. If it does not, the version moved and nobody ran `npm run docs`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(ROOT, 'docs', 'index.html');

const before = readFileSync(page, 'utf8');
execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-docs.mjs')], { stdio: 'ignore' });
const after = readFileSync(page, 'utf8');

if (before !== after) {
  console.error('\ndocs/index.html was out of date and has been regenerated. Commit it.\n');
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
if (!after.includes(`v${version}`)) {
  console.error(`\ndocs/index.html does not mention v${version}.\n`);
  process.exit(1);
}

console.log(`\ndocs/index.html is current for v${version}.\n`);
