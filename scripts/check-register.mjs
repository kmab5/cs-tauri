/**
 * Guards the split between the two token registers.
 *
 * The repo already carries check-theme-scope.cjs because the :root scoping bug
 * was introduced twice. The chrome/page split creates the same shape of trap:
 * a --cs-* token used in the sidebar compiles fine, renders fine, and only
 * looks wrong once somebody picks a different reading theme — at which point
 * the window frame turns sepia and nobody remembers why.
 *
 * Three checks:
 *   1. Every --app-* token that is used is also declared at :root.
 *   2. Pure chrome components use neither --cs-* nor the page utility classes.
 *   3. chrome.css reaches for --cs-* only on the surfaces that deliberately
 *      host authored content.
 *
 * Run: node scripts/check-register.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/* Surfaces that show the author's own words, where the page register is the
   correct answer and its use here is intentional. */
const PAGE_SURFACES = ['.app-main', '.app-measure', '.app-inspector-body'];

/* Components that are chrome and nothing but chrome. Shell.tsx and
   StatsPanel.tsx are mixed by design — they host the reading column and the
   stats scene — so they are not listed. */
const CHROME_COMPONENTS = ['src/features/Sidebar.tsx', 'src/features/DropOverlay.tsx'];

const PAGE_UTILITIES =
  /\b(?:bg-paper|bg-raised|text-ink|text-ink-muted|text-ink-faint|border-rule|bg-accent-wash|text-accent)\b/;

const failures = [];
/* Comments explain the split at length and naturally mention both registers,
   so they are stripped before anything is matched. */
const css = read('src/styles/chrome.css').replace(/\/\*[\s\S]*?\*\//g, '');

/* 1. Every --app-* that is read is also declared. */
const declared = new Set([...css.matchAll(/^\s*(--app-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
const used = new Set([...css.matchAll(/var\((--app-[a-z0-9-]+)/g)].map((m) => m[1]));
for (const token of used) {
  if (!declared.has(token)) failures.push(`${token} is used but never declared`);
}

/* 2. Chrome components stay in the chrome register. */
for (const file of CHROME_COMPONENTS) {
  const source = read(file);
  if (source.includes('--cs-')) failures.push(`${file} reaches into the page register (--cs-*)`);
  const utility = PAGE_UTILITIES.exec(source);
  if (utility) failures.push(`${file} uses the page utility "${utility[0]}"`);
}

/* 3. chrome.css uses --cs-* only where authored content is rendered. */
for (const block of css.split('}')) {
  if (!block.includes('--cs-')) continue;
  const selector = block.slice(block.lastIndexOf('{') === -1 ? 0 : 0, block.indexOf('{')).trim();
  if (!PAGE_SURFACES.some((s) => selector.includes(s))) {
    failures.push(`chrome.css uses --cs-* in "${selector.split('\n').pop()}"`);
  }
}

if (failures.length) {
  console.error('\nthe chrome and page registers have crossed:\n');
  for (const failure of failures) console.error(`  fail  ${failure}`);
  console.error(
    '\nChrome follows the operating system. The page follows the reading theme.\n' +
      'Keeping them apart is why a sepia reading theme does not repaint the sidebar.\n',
  );
  process.exit(1);
}

console.log(`\nregisters are intact: ${declared.size} chrome tokens, none crossing.\n`);
