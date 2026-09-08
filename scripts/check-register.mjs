/**
 * Guards the chrome tokens against the scope trap.
 *
 * The chrome now derives from the engine's theme: --app-chrome is
 * var(--cs-paper-raised), and so on down the list. The engine declares --cs-*
 * on <body>, and custom properties only inherit downward — so an --app-* token
 * declared at :root cannot see them. It does not error. It resolves to its
 * fallback, permanently, and the chrome simply stops following the theme while
 * the prose keeps changing colour. index.css documents the same trap for
 * Tailwind's @theme, where it has been introduced twice.
 *
 * So: every --app-* token that is used must be declared, and every declaration
 * must sit inside a body rule.
 *
 * Run: node scripts/check-register.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/chrome.css'), 'utf8')
  /* Comments discuss both registers at length; strip them before matching. */
  .replace(/\/\*[\s\S]*?\*\//g, '');

const failures = [];

/* Selector -> declarations, for every top-level rule. */
const blocks = [];
for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  blocks.push({ selector: match[1].trim().split('\n').pop().trim(), body: match[2] });
}

const declared = new Set();
for (const { selector, body } of blocks) {
  const tokens = [...body.matchAll(/(--app-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  if (!tokens.length) continue;
  for (const token of tokens) declared.add(token);
  /* A body rule, or a rule whose subject is body — `[data-platform] body`
     counts, `:root` does not. */
  if (!/(^|[\s>])body$/.test(selector)) {
    failures.push(`${tokens.join(', ')} declared on "${selector}" — must be a body rule`);
  }
}

for (const match of css.matchAll(/var\((--app-[a-z0-9-]+)/g)) {
  if (!declared.has(match[1])) failures.push(`${match[1]} is used but never declared`);
}

if (failures.length) {
  console.error('\nthe chrome tokens are out of scope:\n');
  for (const failure of new Set(failures)) console.error(`  fail  ${failure}`);
  console.error(
    '\nThe engine declares --cs-* on <body>. Chrome tokens derive from those, so\n' +
      'they have to be declared there too — at :root they can never see them.\n',
  );
  process.exit(1);
}

console.log(`\nchrome tokens in scope: ${declared.size}, all declared on body.\n`);
