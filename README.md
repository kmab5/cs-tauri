# ChoiceScript Player

A desktop ChoiceScript player for Windows, macOS and Linux. Tauri 2 · Rust ·
React 18 · TypeScript · Vite 8 · Tailwind CSS 4 · Radix UI · Motion · Sonner.

Games, saves and settings are ordinary files in your own application data
directory. Nothing is uploaded, nothing is synced, and the app makes no network
requests at all — the content security policy in `src-tauri/tauri.conf.json`
forbids them.

There is no web version. The React app is the contents of the window and
nothing else: it needs the Tauri IPC bridge to reach the library on disk, and
opening the dev server URL in a browser gets you a notice saying so.

## Run it

```bash
npm install
npm run tauri:dev
```

Needs [Rust](https://rustup.rs) and Node 20+. On Linux you also need
`webkit2gtk-4.1` and `gtk3` development packages; the CI workflow lists the
exact Ubuntu ones.

```bash
npm run tauri:build                     # installers for the current platform
npm run tauri build -- --bundles nsis   # just one of them
```

First launch imports anything in `src-tauri/games/*.cszip`, so it pauses for a
moment on a fresh profile.

## Versioning and releases

`0.1.6` reads as **major release · major update · session**. `package.json` is
the single source of truth: `src-tauri/tauri.conf.json` deliberately has no
`version` key so Tauri reads it from there, which keeps the installer, the
About box and the release label in agreement by construction. The crate version
in `Cargo.toml` has to be written separately, because Cargo cannot read
`package.json` — `npm run test:version` fails if the two drift, or if a tag
disagrees with either.

Pushing a `v*` tag builds and publishes:

```bash
npm version 0.1.7 --no-git-tag-version   # then update src-tauri/Cargo.toml
git commit -am "release: v0.1.7"
git tag v0.1.7 && git push --follow-tags
```

`.github/workflows/release.yml` then runs the tests, builds the NSIS installer,
the MSI and a portable zip, and attaches all three to a GitHub release. The tag
is checked against `package.json` before anything expensive starts: an
installer labelled with the wrong version is worse than a failed build, because
it looks like it worked.

| Artefact | Use it when |
| --- | --- |
| `.exe` (NSIS) | Normal install, no administrator rights needed |
| `.msi` | Managed or scripted deployment |
| `-portable-x64.zip` | No install at all — unzip and run |

## Where everything lives

| Platform | Data directory |
| --- | --- |
| Windows | `%APPDATA%\com.kmab.cs-tauri` |
| macOS | `~/Library/Application Support/com.kmab.cs-tauri` |
| Linux | `~/.local/share/com.kmab.cs-tauri` |

```
games/<id>/manifest.json     title, author, scene list, achievements
games/<id>/scenes/*.txt      the game's text, as the author wrote it
games/<id>/assets/…          images
stores/CS-<id>.json          saves, achievements, per-game settings
bundled.marker               bundled games have been offered once
```

Plain text and JSON throughout, so a game folder can be copied, backed up or
read in an editor. Deleting a game deletes its store with it. Save files are
written to a temp file and renamed, so a crash mid-save cannot truncate one.

## Getting games in

Drop an archive anywhere in the window, use **File ▸ Open Game…**, or
double-click a `.cszip` — the same zip a game ships as, renamed so the operating
system can associate it with the app.

Unpacking happens in Rust. The format is detected from the file's magic bytes
rather than its extension, so `.cszip` needs no special case anywhere; entries
that would escape the game's own folder are refused; and the old ChoiceScript
runtime that published games bundle is dropped, along with any signing keys that
came with it. `src-tauri/src/archive.rs` owns those rules and has the tests for
them.

## The two registers

The most important thing to know before touching the CSS.

- `--cs-*` is **the page**: the author's reading surface. It follows whichever
  of the six reading themes the player picked.
- `--app-*` is **the chrome**: titlebar, sidebar, inspector. It follows the
  operating system's light or dark appearance and nothing else.

A sepia reading theme must not repaint the sidebar. The frame belongs to the
desktop; the page belongs to the author. Settings shows both controls one above
the other — **Window** and **Theme** — which is the whole argument made visible.

`npm run test:register` fails the build if the two cross, and the webview
harness asserts it behaviourally: switching appearance must not move
`--cs-paper`, and switching theme must not move `--app-chrome-solid`.

`src/styles/chrome.css` also holds the platform faces (SF Pro, Segoe UI
Variable, Inter/Cantarell), the titlebar inset that clears the macOS traffic
lights, and the density rule: controls are 28 px under a cursor and 44 px under
`(pointer: coarse)`, because the WCAG target size is about fingers.

## The theme-scope trap

Worth reading before touching `index.css`.

The engine declares its colour tokens on `<body>` and overrides them per theme
(`body.theme-nocturne`). Tailwind's `@theme` emits `--color-*` at `:root`, where
`var(--cs-paper)` **cannot see them** — custom properties only inherit downward
— so it silently resolves to the fallback and never re-themes.

The symptom is deceptive rather than obvious: prose themes correctly, because it
is styled directly on `body`, while every utility-driven surface (`bg-raised`,
`text-ink`, `border-rule`) stays on the default palette. Choice text changes
colour; its background does not.

The fix is to re-declare the same variables inside a `body` rule, which
`index.css` does. `npm run test:theme` parses the built stylesheet and fails if
any mapped variable exists only at `:root`. This bug has been introduced twice;
the guard exists so it cannot be a third time.

## Structure

```
src-tauri/
  src/archive.rs        unpack, filter, find the scene root — pure, unit-tested
  src/library.rs        the game commands, and the bundled-game import
  src/store.rs          one JSON file per save namespace, written atomically
  src/paths.rs          every path, with id validation as the only way in
  src/menu.rs           the native menu bar and its accelerators
  src/lib.rs            plugins, commands, and both file-open mechanisms
  games/*.cszip         bundled games, imported once on a fresh profile
src/
  lib/choicescript.ts   the engine contract, as types
  lib/db.ts             the file backend, over Tauri commands
  lib/library.ts        manifest parsing, engine boot, scene cache
  lib/desktop/          polyfills, links, menus, appearance, the save store
  features/
    Shell.tsx           the window frame: titlebar, three panes, focus mode
    Sidebar.tsx         the library, always visible
    Player.tsx          subscribes to the engine, renders state
    StatsPanel.tsx      the character sheet, docked beside the story
    Blocks.tsx          block rendering, incl. the mandatory legacyNode mount
    Pending.tsx         choices, page breaks, text input
    Overlays.tsx        stats, saves, settings, achievements, menu
    DropOverlay.tsx     the whole window as a drop target
engine/                 the ChoiceScript engine sources, bundled at build time
```

`engine/` is compiled into `public/engine/` by `scripts/build-engine.mjs` on
every build. **Never edit that output or commit `public/engine/`.**

## The typed contract

`src/lib/choicescript.ts` is the whole engine contract as TypeScript: block
kinds, pending kinds, state, and every method. Type-checking against it is how
you know you are using the documented API rather than reaching into the engine.

It earns its keep — `tsc` caught a real bug during development, where
`useEffect(refresh)` returned the chainable API and React would have treated it
as a cleanup function.

## The five obligations

Every front end must do these.

1. **Load the bundle, then `start()`** — and pass `sceneList`, `achievements`
   and `title` from the manifest. Everything declared in `startup.txt` is
   invisible to a restored save, which jumps straight into a later scene:
   without the scene list the first `*finish` ends the game, and without
   achievements `*achieve` throws.
2. **Render `state.blocks` in order**, as HTML — the engine already expanded
   bbcode, so rendering as plain text loses bold, italics and links.
3. **Mount `legacyNode` blocks.** Not optional. `Blocks.tsx` does it. Skip it
   and games that draw their own stat bars lose them silently.
4. **Do not use `id="text"`.** The core owns an offscreen `#text` host so
   authored `*script` appends are intercepted before the engine writes. This app
   renders into `.cs-text`.
5. **Answer `state.pending` with the matching verb** — `cs.chooseGroups`,
   `cs.next`, `cs.submitInput` — not a callback from state.

Also: the CSP has to keep `'unsafe-eval'`. `*script` blocks are `eval`'d, and
plenty of published games use them.

## Keyboard

Space and PageDown page the story and then continue at the bottom of a passage;
Shift+Space and PageUp go back; Home and End jump. Number keys select an option
and Enter confirms — select-then-confirm, because a mis-tap that silently
branches the story is far worse than one extra keystroke. Arrow keys move
between options once one has focus, which native radios give for free.

`⌘/Ctrl+O` open · `⌘S` save · `⌘L` restore · `⌘⇧R` restart · `⌘\` sidebar ·
`⌘I` stats · `⌘⇧F` focus mode · `⌘+/-/0` text size.

Restart is `⌘⇧R`, not `⌘R`: every webview treats `⌘R` as reload, and a player
who meant "restart the chapter" would have dropped the whole session.

## Accessibility

WCAG 2.1 AA: choices are native radios in a labelled group, stat bars are
`role="meter"` with `aria-valuenow`, touch targets clear 44×44 px on touch
devices, focus is visible, dialogs come from Radix (focus trap, Escape,
`aria-modal`), and `prefers-reduced-motion` is respected.

## Testing

```bash
npm test              # build, versions, theme, registers, webview, rust
npm run test:game     # the webview harness against the bundled game
npm run test:rust     # cargo test
```

`scripts/test-webview.cjs` is the interesting one. `dist/` is exactly what the
webview loads, and the only thing missing under Node is the IPC bridge — so the
bridge is mocked over a real temporary directory and the app is driven through
it: import an archive, check the files landed, play a screen, dock the stats
panel, confirm the registers stay apart, confirm the save store reached disk.

The mock is a test double, not a second implementation. It unpacks an archive
because the frontend needs something on disk to read; no assertion there is
about the filter rules, which have their own tests in Rust where they belong.

Everything runs on Windows, macOS and Linux — no shell, no `zip` binary, no
`/tmp` assumptions. The harness builds its fixture archive in JavaScript and
ships a small sample game, so it needs no arguments.

## Bundled games and licensing

`src-tauri/games/` is gitignored. A commercial game placed there for a local
build must not be redistributed inside the installers you produce.
