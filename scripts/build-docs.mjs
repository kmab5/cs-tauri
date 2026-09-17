#!/usr/bin/env node
/**
 * Builds `docs/index.html` for GitHub Pages.
 *
 * Generated rather than hand-written, because a hand-written landing page is
 * out of date by the second release and nobody notices until someone downloads
 * the wrong version. Everything that can drift — the version, the feature list,
 * the download links, the data locations — is read from the repository here:
 * `package.json` for the version, this file for the copy, and the release tag
 * for the links.
 *
 * `npm run docs` regenerates it; the release workflow runs it on every tag, so
 * the page and the release it points at are built from the same commit.
 *
 * Identity: the palette and the lowercase-heading habit are the kmab brand's
 * (kmab5/kmab-brand: purple #B24BFF, green #3DE08A, amber #F5C451, near-black
 * #0E0E11, off-white #EDEBE4). The type is not — the page is set in the app's
 * own bundled faces, Fraunces over JetBrains Mono, so it looks like the thing
 * it is selling rather than like the brand kit it came from.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const REPO = 'kmab5/cs-tauri';
const TAG = `v${pkg.version}`;

/** The copy. Edited here, not in HTML. */
const FEATURES = [
  {
    title: 'your games, your machine',
    body: `Drop a ChoiceScript archive on the shelf and it unpacks to plain files in your own
      application data folder — scenes as text, saves as JSON, readable in an editor and copyable
      to a backup. No account, no sync, and no network access at all: the content security policy
      forbids it.`,
  },
  {
    title: 'built for reading',
    body: `Six reading themes, six packaged typefaces including OpenDyslexic, a weight slider for
      the variable ones, four text sizes, and a focus mode that takes the window fullscreen and
      leaves nothing but the prose. Space pages and then continues; every control has a real
      shortcut; ⌘K finds any of them.`,
  },
  {
    title: 'saves that survive a bad ending',
    body: `The engine keeps one restore point and overwrites it constantly. This keeps a rolling
      autosave three deep alongside anything you save by hand, so walking into a bad ending eight
      hours in costs you a step rather than an evening.`,
  },
  {
    title: 'one story, one app',
    body: `Ship a single game as its own application — same player, shelf removed, the game's name
      on the window and the installer. One command, or a button in the library. Export a game with
      its saves and achievements as a single <code>.cszip</code> and carry both to another machine.`,
  },
  {
    title: 'author mode',
    body: `God mode over every variable, edited like a diff — amber for pending, green for applied,
      one undo. A trace console recording every <code>*if</code>, <code>*goto</code> and
      <code>*set</code> the interpreter runs. And upstream's own quicktest and randomtest, vendored
      and run headless from the library.`,
  },
];

const INSTALL = [
  ['.exe', 'NSIS installer', 'Normal install. No administrator rights needed.'],
  ['.msi', 'MSI package', 'Managed or scripted deployment.'],
  ['-portable-x64.zip', 'Portable', 'No install at all. Unzip and run.'],
];

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const squash = (s) => s.replace(/\s+/g, ' ').trim();

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ChoiceScript Player — a desktop reader for interactive fiction</title>
<meta name="description" content="A desktop ChoiceScript player for Windows, macOS and Linux. Your games and saves stay on your own machine.">
<meta property="og:title" content="ChoiceScript Player">
<meta property="og:description" content="A desktop reader for ChoiceScript games. Nothing leaves your machine.">
<meta property="og:type" content="website">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<style>
  /* Palette from kmab5/kmab-brand. Type from the app itself. */
  :root {
    --purple: #b24bff;
    --green: #3de08a;
    --amber: #f5c451;
    --bg: #0e0e11;
    --surface: #17171b;
    --surface2: #1e1e24;
    --line: #2a2a31;
    --text: #edebe4;
    --muted: #9a9aa6;
    --dim: #66666f;
    --display: 'Fraunces', 'Iowan Old Style', Georgia, serif;
    --mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
    --ui: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 400 1rem/1.65 var(--ui);
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--purple); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: var(--mono); font-size: 0.9em; color: var(--amber); }
  .wrap { margin: 0 auto; max-width: 68rem; padding: 0 clamp(1rem, 4vw, 2.5rem); }

  /* Lowercase headings, per the brand's written habits. */
  h1, h2, h3 { font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; text-transform: lowercase; }
  .label { font: 700 0.6875rem/1.2 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); }

  header { border-bottom: 1px solid var(--line); }
  .bar { display: flex; align-items: center; gap: 1rem; padding: 1rem 0; }
  .bar strong { font-family: var(--display); font-size: 1.0625rem; letter-spacing: -0.01em; }
  .bar nav { margin-left: auto; display: flex; gap: 1.25rem; font-size: 0.9375rem; }
  .bar nav a { color: var(--muted); }

  .hero { padding: clamp(3rem, 10vw, 7rem) 0 clamp(2.5rem, 6vw, 4rem); }
  .hero h1 { margin: 0; font-size: clamp(2.5rem, 7vw, 5rem); line-height: 0.98; }
  .hero h1 em { font-style: normal; color: var(--purple); }
  .hero p { margin: 1.25rem 0 0; max-width: 42rem; color: var(--muted); font-size: clamp(1.0625rem, 2vw, 1.25rem); }
  .cta { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2rem; }
  .btn {
    border: 1px solid var(--line); border-radius: 4px; background: var(--surface);
    padding: 0.625rem 1.125rem; color: var(--text); font-size: 0.9375rem;
  }
  .btn:hover { border-color: var(--purple); text-decoration: none; }
  .btn-primary { border-color: var(--purple); background: var(--purple); color: #16021f; font-weight: 600; }
  .btn-primary:hover { filter: brightness(1.1); }
  .version { align-self: center; font-family: var(--mono); font-size: 0.8125rem; color: var(--dim); }

  section { padding: clamp(2.5rem, 7vw, 4.5rem) 0; border-top: 1px solid var(--line); }
  section > .wrap > h2 { margin: 0 0 2rem; font-size: clamp(1.5rem, 3.5vw, 2.25rem); }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(17rem, 100%), 1fr)); gap: 1.25rem; }
  .card { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); padding: 1.375rem; }
  .card h3 { margin: 0 0 0.625rem; font-size: 1.1875rem; }
  .card p { margin: 0; color: var(--muted); font-size: 0.9375rem; }

  table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
  th, td { border-bottom: 1px solid var(--line); padding: 0.75rem 0.5rem; text-align: left; vertical-align: top; }
  th { color: var(--dim); font: 700 0.6875rem/1.2 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; }
  td code { color: var(--green); }

  pre {
    overflow-x: auto; border: 1px solid var(--line); border-radius: 6px;
    background: var(--surface2); padding: 1rem; color: var(--text);
    font-family: var(--mono); font-size: 0.875rem; line-height: 1.6;
  }
  pre .c { color: var(--dim); }

  footer { border-top: 1px solid var(--line); padding: 2.5rem 0; color: var(--dim); font-size: 0.875rem; }
  footer p { margin: 0.35rem 0; }

  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
</style>
</head>
<body>

<header>
  <div class="wrap bar">
    <strong>ChoiceScript Player</strong>
    <nav>
      <a href="#features">features</a>
      <a href="#install">install</a>
      <a href="#author">author mode</a>
      <a href="https://github.com/${REPO}">source</a>
    </nav>
  </div>
</header>

<main>
  <div class="wrap hero">
    <p class="label">desktop · windows · macos · linux</p>
    <h1>interactive fiction,<br>read <em>on your own machine</em>.</h1>
    <p>A desktop player for ChoiceScript games. Games unpack to plain files you own, saves are
      JSON you can read, and the app makes no network requests at all.</p>
    <div class="cta">
      <a class="btn btn-primary" href="https://github.com/${REPO}/releases/latest">download for windows</a>
      <a class="btn" href="https://github.com/${REPO}">read the source</a>
      <span class="version">${TAG}</span>
    </div>
  </div>

  <section id="features">
    <div class="wrap">
      <h2>what it does</h2>
      <div class="grid">
${FEATURES.map((f) => `        <article class="card">
          <h3>${f.title}</h3>
          <p>${squash(f.body)}</p>
        </article>`).join('\n')}
      </div>
    </div>
  </section>

  <section id="install">
    <div class="wrap">
      <h2>install</h2>
      <table>
        <thead><tr><th>file</th><th>what it is</th><th>use it when</th></tr></thead>
        <tbody>
${INSTALL.map(([ext, what, when]) => `          <tr><td><code>${escape(ext)}</code></td><td>${what}</td><td>${when}</td></tr>`).join('\n')}
        </tbody>
      </table>
      <p style="color:var(--muted);font-size:0.9375rem">
        Every release is built from a tag by GitHub Actions, tests first. Games, saves and settings
        live in <code>%APPDATA%\\com.kmab.cs-tauri</code> on Windows,
        <code>~/Library/Application&nbsp;Support/com.kmab.cs-tauri</code> on macOS, and
        <code>~/.local/share/com.kmab.cs-tauri</code> on Linux.
      </p>
    </div>
  </section>

  <section id="author">
    <div class="wrap">
      <h2>for authors</h2>
      <p style="max-width:44rem;color:var(--muted)">Author mode turns the reader into a testing
        tool: god mode over every variable, a trace console recording the interpreter's decisions,
        and upstream's own quicktest and randomtest run headless from the library. Ship a single
        story as its own app when it is ready.</p>
      <pre><span class="c"># build a standalone app for one story</span>
npm run cs:export -- --game sordwin.cszip --out dist-apps/sordwin \\
  --portable --nsis --icon

<span class="c"># the same, with author mode baked in, for testing</span>
npm run cs:export -- --game sordwin.cszip --out dist-apps/sordwin-test \\
  --portable --author</pre>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <p>Built on <a href="https://github.com/dfabulich/choicescript">ChoiceScript</a> by Dan
      Fabulich, under the ChoiceScript License. This player is not affiliated with Choice of Games.</p>
    <p>Games are the property of their authors. Nothing here redistributes them.</p>
    <p>${TAG} · <a href="https://github.com/${REPO}">github.com/${REPO}</a> · identity from
      <a href="https://github.com/kmab5/kmab-brand">kmab</a></p>
  </div>
</footer>

</body>
</html>
`;

/* A favicon that is the app's own mark rather than a copy of the brand's:
   the branching path, which is what a ChoiceScript story is. */
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0e0e11"/>
  <g fill="none" stroke="#b24bff" stroke-width="5" stroke-linecap="round">
    <path d="M19 50V30"/><path d="M19 30l14-9"/><path d="M19 30l14 9"/>
  </g>
  <g fill="#edebe4"><circle cx="19" cy="50" r="4"/><circle cx="33" cy="21" r="4"/><circle cx="33" cy="39" r="4"/></g>
</svg>
`;

mkdirSync(join(ROOT, 'docs'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'index.html'), page);
writeFileSync(join(ROOT, 'docs', 'icon.svg'), icon);
/* GitHub Pages runs Jekyll otherwise, which ignores files it does not like. */
writeFileSync(join(ROOT, 'docs', '.nojekyll'), '');

console.log(`\ndocs/index.html written for ${TAG} — ${FEATURES.length} features, ${INSTALL.length} downloads\n`);
