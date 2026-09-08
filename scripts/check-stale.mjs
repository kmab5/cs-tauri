/**
 * Fails the build when a file removed in an earlier version is still present.
 *
 * Updating by unzipping over an existing checkout leaves behind files that no
 * longer exist upstream. package.json gets replaced, the orphan does not, and
 * the build dies on an import for a dependency that is no longer installed —
 * or worse, a stale config silently changes how the build runs.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const REMOVED = [
  ['src/components/ui/sheet.tsx', 'the vaul drawer, replaced by the centred dialog'],
  ['src/features/Hud.tsx', 'the floating HUD, replaced by the title bar'],
  ['src/lib/api.ts', 'the backend client; storage is local now (src/lib/library.ts)'],
  ['tailwind.config.js', 'Tailwind v4 is CSS-first — the theme lives in src/index.css'],
  ['postcss.config.js', 'Tailwind v4 is a Vite plugin, not a PostCSS plugin'],
  ['e2e-test.js', 'renamed to e2e-test.cjs (this package is an ES module)'],

  /* 0.1.6 — the web build was removed. Every one of these still type-checks
     against the old contract, so leaving them behind fails `tsc -b` rather
     than being harmlessly ignored. */
  ['e2e-test.cjs', 'the static-site harness, replaced by scripts/test-webview.cjs'],
  ['scripts/test-bundled-game.mjs', 'folded into scripts/test-webview.cjs'],
  ['src/features/Library.tsx', 'the library page, replaced by the sidebar (Sidebar.tsx)'],
  ['src/features/Toolbar.tsx', 'the in-page sticky title bar, replaced by the window titlebar'],
  ['src/lib/db.web.ts', 'the IndexedDB backend; storage is files on disk now'],
  ['src/lib/db.tauri.ts', 'became src/lib/db.ts — there is one backend, not two'],
  ['src/lib/archive.ts', 'browser zip reading; extraction lives in src-tauri/src/archive.rs'],
];

const found = REMOVED.filter(([p]) => existsSync(join(root, p)) && statSync(join(root, p)).isFile());

if (found.length) {
  console.error('\nStale files from an earlier version are still present:\n');
  for (const [p, why] of found) console.error(`  ${p}\n      ${why}`);
  console.error('\nDelete them and rebuild:\n');
  console.error(`  rm -f ${found.map(([p]) => p).join(' ')}\n`);
  process.exit(1);
}
