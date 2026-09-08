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

`0.1.11` reads as **major release · major update · session**. `package.json` is
the single source of truth: `src-tauri/tauri.conf.json` deliberately has no
`version` key so Tauri reads it from there, which keeps the installer, the
About box and the release label in agreement by construction. The crate version
in `Cargo.toml` has to be written separately, because Cargo cannot read
`package.json` — `npm run test:version` fails if the two drift, or if a tag
disagrees with either.

Pushing a `v*` tag builds and publishes:

```bash
npm version 0.1.12 --no-git-tag-version   # then update src-tauri/Cargo.toml
git commit -am "release: v0.1.12"
git tag v0.1.12 && git push --follow-tags
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

Drop an archive on the library page, use **File ▸ Open Game…**, or
double-click a `.cszip` — the same zip a game ships as, renamed so the operating
system can associate it with the app.

Unpacking happens in Rust. The format is detected from the file's magic bytes
rather than its extension, so `.cszip` needs no special case anywhere; entries
that would escape the game's own folder are refused; and the old ChoiceScript
runtime that published games bundle is dropped, along with any signing keys that
came with it. `src-tauri/src/archive.rs` owns those rules and has the tests for
them.

## The design system

`PRODUCT.md` says who this is for and what it must not look like; `DESIGN.md` documents the visual system as built — the two surfaces, the colour
roles, the fixed type scale, the 8px spacing unit, the z-index ladder, motion
tokens and the accessibility targets. Read it before changing any of them; the
guards in `npm test` enforce the parts that can be checked mechanically.

## One theme

The most important thing to know before touching the CSS.

The chrome tokens are *derived* from the engine's theme tokens: `--app-chrome`
is `var(--cs-paper-raised)`, `--app-border` is `var(--cs-rule)`, and so on down
the list. Picking a reading theme repaints the titlebar, the sidebar and the
panels along with the page, so the window reads as one object rather than a
frame with a document inside it.

They are declared inside a `body` rule, and that is not cosmetic. The engine
declares `--cs-*` on `<body>`, and custom properties only inherit downward — an
`--app-*` token declared at `:root` could never see them, would resolve to its
fallback silently, and the chrome would stop following the theme while the prose
kept changing colour. `npm run test:register` fails the build if one escapes to
`:root`, and the webview harness checks the derivation holds.

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
  lib/theme.ts          theme and text size, before there is an engine
  features/
    Shell.tsx           the window frame: titlebar, panes, focus mode, resizing
    LibraryPage.tsx     the shelf — the only place a game can be started
    GamePanel.tsx       the sidebar while a game is open: details over saves
    AppSettings.tsx     the settings that make sense with no game loaded
    Player.tsx          subscribes to the engine, renders state
    AchievementsPanel.tsx  achievements, docked beside the story
    useAutosave.ts      a rolling three-deep autosave queue
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

`⌘/Ctrl+K` command palette — everything the app can do, searchable · `⌘O` open · `⌘S` save · `⌘L` restore · `⌘⇧R` restart · `⌘⇧L` library ·
`⌘\` sidebar · `⌘I` stats · `⌘⇧F` focus mode · `⌘+/-/0` text size · `⌘,`
settings.

Restart is `⌘⇧R`, not `⌘R`: every webview treats `⌘R` as reload, and a player
who meant "restart the chapter" would have dropped the whole session.

Every one of these is handled twice on purpose — as a native menu accelerator
and again in `lib/desktop/menu.ts` — because a menu that fails to build takes
all of its shortcuts down with it silently, and a webview can swallow
combinations before the menu sees them. Both routes end at the same handler.

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

## Exporting a game with its saves

**Export with saves** in the sidebar, or the share icon on a shelf card, writes
one `.cszip` to your downloads folder:

```
scenes/*.txt                            the game, as it ships
<assets>                                its images, beside the scenes
choicescript-player/manifest.json       title, author, scene list, achievements
choicescript-player/store.json          saves, achievements, per-game settings
```

Any other ChoiceScript player ignores that folder and sees an ordinary game.
This one reads it back on import, so a game and everything you did in it travel
together — to another machine, or into a backup.

The saves are restored under the *new* import's id, so importing the same
export twice gives two independent copies rather than two games writing to one
save file.

## Why the stats screen is a dialog

A stats screen is a ChoiceScript *scene*. It can contain `*stat_chart`, `*if`,
and — in games like Sordwin — a `*choice` the reader answers. The engine runs it
by raising `bus.statsMode`, and while that flag is up every block it emits routes
to the stats channel (`bus.js:74`).

Answering a stats choice needs the flag up. Advancing the story needs it down.
One flag, two mutually exclusive requirements, so a live character sheet beside
a usable story is not something the engine can be asked for — an earlier attempt
at one is why the sheet once printed itself into the middle of the page.

Achievements have no such problem: `state.achievements` is derived state, not a
rendered channel, so they dock in the side panel and update live without
touching the interpreter.

## Saves

The engine keeps one restore point and overwrites it constantly — the stats
screen rewrites it every time it runs. So the app writes its own autosave at
each screen, three deep, oldest evicted: walk into a bad ending and there are
three places to step back to. They appear in the saves list alongside anything
saved by hand, labelled `Autosave`, and only slots the app created are ever
pruned.

## Bundled games and licensing

`src-tauri/games/` is gitignored. A commercial game placed there for a local
build must not be redistributed inside the installers you produce.
