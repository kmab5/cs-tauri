#!/usr/bin/env node
/*
 * Guards the bug that has now bitten twice.
 *
 * The engine declares its colour tokens on <body> and overrides them per theme.
 * Tailwind's @theme emits --color-* at :root, where var(--cs-*) cannot see them
 * and silently resolves to a fallback forever. The symptom is deceptive: prose
 * themes correctly (styled on body) while every utility-driven surface stays on
 * the default palette.
 *
 * So: every --color-* Tailwind generates must ALSO be declared inside a body
 * rule in the built stylesheet.
 *
 * Run: node check-theme-scope.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'dist', 'assets');
const cssFile = fs.readdirSync(dir).find((f) => f.endsWith('.css'));
if (!cssFile) {
  console.error('No built stylesheet found. Run `npm run build` first.');
  process.exit(1);
}
/*
 * A stale dist is worse than no dist: it reports failures for a stylesheet the
 * source no longer produces. Compare timestamps and say so plainly.
 */
const cssPath = path.join(dir, cssFile);
const srcCss = path.join(__dirname, 'src', 'index.css');
if (fs.existsSync(srcCss) && fs.statSync(srcCss).mtimeMs > fs.statSync(cssPath).mtimeMs) {
  console.error(
    '\nsrc/index.css is newer than the built stylesheet, so this would be\n' +
    'checking stale output. Run `npm run build` first.\n',
  );
  process.exit(1);
}

const css = fs.readFileSync(cssPath, 'utf8');

/* every custom property the theme maps onto an engine token */
const mapped = [...css.matchAll(/(--color-[\w-]+|--font-[\w-]+|--radius-cs)\s*:\s*var\(--cs-/g)]
  .map((m) => m[1]);
const unique = [...new Set(mapped)];

/* collect the declarations that live inside a body-scoped rule */
const bodyScoped = new Set();
for (const m of css.matchAll(/(^|[},])\s*([^{}]*\bbody\b[^{}]*)\{([^}]*)\}/g)) {
  for (const d of m[3].matchAll(/(--[\w-]+)\s*:/g)) bodyScoped.add(d[1]);
}

let fail = 0;
console.log(`\n${unique.length} theme variables map onto engine tokens\n`);
for (const name of unique) {
  const ok = bodyScoped.has(name);
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? 'declared at body scope' : 'ONLY at :root — will never re-theme'}`);
}

console.log(
  fail
    ? `\n${fail} variable(s) can never see the engine tokens.\n`
    : `\nall ${unique.length} resolve against the live theme.\n`,
);
process.exit(fail ? 1 : 0);
