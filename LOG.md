# ChoiceScript Desktop — Log

A running record of what has been done, what was decided and why, and what comes next.
Newest entry at the top.

---

## 2026-09-08 · Session 7 — The same request, and the trap in applying it

The instructions arrived again, unchanged. I checked the remote before doing
anything: `kmab5/cs-tauri` is still at `c79b282`, `package.json` still says
0.1.5, there is no `.github/`, and `Library.tsx`, `Toolbar.tsx` and
`test-bundled-game.mjs` are all still there. Nothing had been applied, so
session 6's work already answers all five items and none of it needed redoing.

So I spent the session on the thing that would have gone wrong next.

### Unzipping over your checkout breaks the build

Extracting an archive adds and overwrites files. It never deletes them. Session
6 *removed* seven, and every one of them still type-checks against the old
contract, so they fail the build rather than sitting there harmlessly.

I simulated it — cloned your repo at `c79b282`, extracted the zip over it, ran
`npm run build`:

```
src/features/Library.tsx(6,55): error TS2305: Module '"@/lib/library"' has no exported member 'quota'.
src/lib/db.web.ts(131,17): error TS2339: Property 'payload' does not exist on type 'Ingested'.
src/lib/db.web.ts(132,32): error TS2339: Property 'payload' does not exist on type 'Ingested'.
src/lib/db.web.ts(132,57): error TS2339: Property 'payload' does not exist on type 'Ingested'.
```

Four errors, all from orphans, none from the new code.

### The fix was already in your repo

`scripts/check-stale.mjs` exists for precisely this, and its header says so:
*"Updating by unzipping over an existing checkout leaves behind files that no
longer exist upstream."* It already lists the vaul sheet, the old HUD,
`lib/api.ts`, the Tailwind v3 configs. I simply failed to add session 6's
removals to it — the guard was right there and I walked past it.

Seven entries added, each with the reason:

| Orphan | Why it went |
| --- | --- |
| `e2e-test.cjs` | the static-site harness, replaced by `scripts/test-webview.cjs` |
| `scripts/test-bundled-game.mjs` | folded into `scripts/test-webview.cjs` |
| `src/features/Library.tsx` | the library *page*, replaced by the sidebar |
| `src/features/Toolbar.tsx` | the in-page sticky title bar, replaced by the window titlebar |
| `src/lib/db.web.ts` | the IndexedDB backend |
| `src/lib/db.tauri.ts` | became `src/lib/db.ts` — one backend, not two |
| `src/lib/archive.ts` | browser zip reading; extraction is `src-tauri/src/archive.rs` |

The guard runs first in both `dev` and `build`, so instead of four type errors
about `payload` you now get the file list, the reason for each, and the exact
`rm -f` line to paste.

### Verified the whole path, not just the guard

On a clone of `c79b282` with the zip extracted over it:

1. `npm run build` → guard fails, lists all seven, prints the command
2. paste the command
3. `npm run build` → clean, 422 kB
4. `test:version`, `test:theme`, `test:register` → pass
5. `test:webview` → **40 passed, 0 failed**

That is the sequence you will actually go through, run end to end rather than
reasoned about.

### To apply

```bash
cd /d/Code/cs-tauri
# extract the zip over the checkout, then:
npm run build          # tells you what to delete
rm -f e2e-test.cjs scripts/test-bundled-game.mjs src/features/Library.tsx \
      src/features/Toolbar.tsx src/lib/db.web.ts src/lib/db.tauri.ts src/lib/archive.ts
npm install            # the dependency set changed
npm test
```

`git status` after that should show the seven as deleted, `.github/` as new, and
no orphans. Then tag `v0.1.6`.

---

## 2026-09-08 · Session 6 — Desktop only, v0.1.6, CI, and the reported failures

Pulled `kmab5/cs-tauri` at `c79b282` and worked from there.

### The web build is gone

Not "web elements hidden behind a flag" — deleted. The React app is now the
contents of the window and nothing else.

**Removed:** `src/lib/db.web.ts` (IndexedDB), `src/lib/archive.ts` (browser zip
reading), `src/features/Library.tsx` (the library *page*), `src/features/Toolbar.tsx`
(the in-page sticky title bar), `e2e-test.cjs` and `scripts/test-bundled-game.mjs`,
the `fake-indexeddb` dependency, `isDesktop()` and every branch behind it, the
`preview` script, and `Player`'s `variant` prop.

**Collapsed:** `db.tauri.ts` became `db.ts`; the dispatcher and the `Backend`
interface went with it, since there is one backend now. `library.ts` lost its
browser ingest and the filter rules that went with it — those live in
`archive.rs`, which is where the extraction happens and where the tests are.
`releaseAssets()` no longer revokes anything: asset URLs are paths through the
asset protocol, not object URLs.

**Fixed a latent bug while doing it.** `chrome.css` was scoped to
`[data-shell="desktop"]` to protect the web build, and inside that it set
`body { background: transparent }` for vibrancy. But `index.css` declares
`body { background-color: var(--cs-paper) }` *after* the import, so it always
won — the window was opaque and no vibrancy could ever have shown. The page
background now lives on `.app-main`, which is the only surface that should have
carried it. The scoping attribute is gone entirely; `:root` in `chrome.css` is
unlayered, so it beats Tailwind's `@theme` whatever the specificity.

**Also fixed:** the docked stats panel could only be opened by *middle-clicking*
the Stats button — `onAuxClick`, which is no discoverable affordance at all.
The button now toggles the dock when the window is wide and opens the dialog
when it is not, which is what the menu item already did.

### Your test failures

**`npm run test:rust` — the `AboutMetadata` warning.** The import was
unconditional while its only use sits behind `#[cfg(target_os = "macos")]`, so
it warned on every Windows and Linux build. Moved under the same cfg.

**`npm run test:game` — jsdom 404.** The harness served `dist/`, and `dist/`
had never been built. Two changes: the harness now checks for
`dist/index.html` and says *"Run `npm run build` first"* instead of dying inside
jsdom, and `npm test` builds before the checks that read it. The theme guard had
the same latent crash — it did `readdirSync('dist/assets')` — and now fails the
same clear way.

**`npm run tauri:dev` — `EBUSY … choicescript_lib.dll`.** Vite was watching
`src-tauri/target`, which is where cargo writes that DLL while the app runs.
The rebuild touched it, chokidar threw, and the frontend process took
`tauri dev` down with it. `server.watch.ignored: ['**/src-tauri/**']` fixes it,
and it is very likely also the cause of the `incremental compilation …
Access is denied` note just above it — the watcher holding a handle open.

**A break you had not hit yet.** `npm install` from a clean checkout *fails*:
`@vitejs/plugin-react@4` declares no peer range for Vite 8. Upgraded to v6,
which is oxc-based — that also removed the two deprecation warnings your dev
start was printing (`esbuild` option, `optimizeDeps.rollupOptions`) and the
`__dirname` warning went with the switch to `import.meta.url`.

`vite.config.ts` also picked up the rest of the documented Tauri setup:
`strictPort` (Tauri waits on 5173 specifically), `clearScreen: false` so Rust
output survives, `envPrefix` for `TAURI_ENV_*`, and a build target of
chrome105/safari13 — only two engines ever run this, so there is no reason to
ship output for browsers nobody will use.

### The harness, rewritten

The old one existed to prove the app was a static site. That is no longer a
property worth having, so `scripts/test-webview.cjs` replaces it: `dist/` is
exactly what the webview loads, and the only thing missing under Node is the
IPC bridge — so the bridge is mocked over a real temp directory and the app is
driven through it.

**40 passed, 0 failed** on the sample game and again on Choice of Magics. It
now asserts things the old harness structurally could not:

- the game lands on disk, with a manifest, and scenes readable as text
- title, scene list and achievements were parsed out of `startup.txt`
- the stats sheet **docks** beside the story rather than over it, captures the
  scene, and closes again
- switching window appearance does not move `--cs-paper`; switching reading
  theme does not move `--app-chrome-solid` — the two registers, tested
  behaviourally rather than by grep
- the engine's save store reached disk, namespaced `CS-<id>`

Three jsdom gaps are polyfilled in the harness, not worked around in the app:
`matchMedia` (absent entirely — reporting the wide breakpoint as matching is
what lets the docked panel be exercised at all), `Element.prototype.scrollTo`
(jsdom stubs the window method but never defines the element one), and
`__TAURI_EVENT_PLUGIN_INTERNALS__`, which `@tauri-apps/api` reaches for without
a guard when unlistening.

### Versioning

**0.1.6** — major release · major update · session. Six sessions, so six.

`package.json` is the single source of truth. I *removed* the `version` key from
`tauri.conf.json`: Tauri falls back to `package.json`, so the installer, the
About box and the release label now agree by construction rather than by
discipline. `Cargo.toml` has to be written separately (Cargo cannot read
`package.json`) and was still on `1.0.0` in one place and `0.1.5` in another;
both are 0.1.6 now, with `Cargo.lock` updated to match.

`scripts/check-version.mjs` fails if the three disagree, and with a tag argument
fails if the tag disagrees too.

### CI

**`.github/workflows/release.yml`** — on `v*` tags only. Checks the tag against
`package.json` *before* spending five minutes compiling, then builds NSIS, MSI
and a portable zip and publishes them to a GitHub release with generated notes.
A tag containing `-` is marked prerelease.

NSIS and MSI are both there because they are not interchangeable: MSI is what
managed deployment can install, NSIS is what works without administrator
rights. The portable zip is the bare executable plus a `games/` folder beside
it, because that is where Tauri resolves resources on Windows.

The portable step **globs** for the executable rather than naming it: Tauri v2
derives the binary name from `productName`, not the crate name, so hardcoding
either is a guess that breaks the day the other is true.

**`.github/workflows/ci.yml`** — on pushes and PRs, Windows and Ubuntu.
`cargo test` is a gate; clippy reports without failing, and `cargo fmt --check`
is deliberately **not** there: this tree has never been through rustfmt and
would fail on arrival for no useful reason. Run `npm run fmt:rust` once, then
promote both.

### Verified here

- `npm install` from a clean checkout — succeeds now, 131 packages
- `npm run build` — clean, 422 kB (down 23 kB with the web code gone)
- `npm run typecheck` — clean
- `npm run test:version` · `test:theme` · `test:register` — all pass
- `npm run test:webview` — 40 passed, 0 failed
- `npm run test:game` — 40 passed, 0 failed on Choice of Magics
- Both workflow files parse as YAML

Still no Rust toolchain here, so `menu.rs` is edited but uncompiled — though
your run confirms everything else in `src-tauri/` builds and 13 tests pass.

### Next

Tag `v0.1.6` and watch the release job. If the portable step surprises you, it
prints the binary name it picked before copying.

---

## 2026-09-08 · Session 5 — Verification against the real game, and the last loose end

All nine phases were implemented last session, so this one went after the two things still worth
having: proof that the actual game works, and a setting that existed in code but nowhere in the
interface.

### Choice of Magics passes the full harness

`npm run test:game` — new. It unpacks `src-tauri/games/*.cszip` and hands the path to
`e2e-test.cjs`, which already accepts an unpacked game and builds its own archive from it. No test
logic is duplicated; it is the same 22 assertions, pointed at real content.

**22 passed, 0 failed** on Choice of Magics: 113 files unpacked, 22 scenes preloaded rather than
fetched, title published, first screen rendered, story advanced on a real choice, stats dialog
opened, stat bars rendered as meters, and nothing reached a server.

That is the corpus the fixture game cannot stand in for. It exercises 4 MB of scene text, 100
achievements, 325 `*achieve` calls, 73 `*text_image` renders, 3 `*script` blocks going through
`eval`, 2 `*stat_chart` screens, and the no-`*ifid` path where the save namespace has to come from
our own manifest. The `*script` blocks passing is the concrete evidence behind the `'unsafe-eval'`
decision in the CSP: without it, this game breaks three times.

Note what this does *not* prove: it runs the web path, on IndexedDB, in jsdom. The parsing and
engine half is shared with the desktop build, so that half is now verified against real content.
Rust is still unverified.

### The zip reader, and a bug worth writing down

`test-bundled-game.mjs` needed to read a zip, and Node has no zip built in — not worth a dev
dependency for one script, so it walks the central directory directly.

First attempt failed with `Z_BUF_ERROR`, because I read the compression method and compressed size
from each entry's **local** header. Archives written by a streaming zip writer set general purpose
bit 3 and leave both fields as zero there, filling them in afterwards in a data descriptor. The
central directory always has the real values. Fixed, and commented, because it is exactly the kind
of thing that looks like a corrupt archive rather than a reader bug.

### Window appearance, now reachable

`setAppearance()` shipped last session with nothing calling it, which made the OS-following chrome
a one-way door: it followed the system and the player could not say otherwise. Settings now has a
**Window** row — Match system / Light / Dark — above the reading Theme row, and only on the
desktop.

The two rows sitting one above the other is the whole design argument made visible: Window paints
the frame and follows the operating system; Theme paints the author's page and follows the reader.

### Verified

- `npm run build` — clean. Bundle 445 kB, CSS 37.9 kB.
- `node check-theme-scope.cjs` — 16 tokens resolve.
- `node scripts/check-register.mjs` — 19 chrome tokens, none crossing.
- `node e2e-test.cjs` — 22 passed, 0 failed on the fixture game.
- `npm run test:game` — 22 passed, 0 failed on Choice of Magics.

### What is left, in one sentence

`cargo build`. Everything else has been exercised.

When it does compile, the first thing to check is a chapter plate rendering in chapter one: 73
`*text_image` calls ride on the asset protocol scope, and that is the one behaviour no harness here
could reach.

---

## 2026-09-08 · Session 4 — Phase 9 (reading polish, icons, packaging)

The plan is now complete. All nine phases are implemented; the Rust half remains uncompiled.

### Delivered

| File | What it does |
| --- | --- |
| `src/features/useReadingKeys.ts` | Keyboard paging and per-game scroll memory |
| `src-tauri/icons/*` | A real icon set: 32/128/256 PNG, `.ico`, `.icns`, 1024 source |
| `README.md` | A Desktop section: build, data locations, what differs from the web |

**Modified:** `src/features/Shell.tsx` (focus mode, headless `ReadingKeys`),
`src-tauri/src/menu.rs` (Focus Mode item), `src/lib/desktop/menu.ts` (the new id).

### Keyboard reading

Most of what was needed already existed and I did not rebuild it: the engine's number shortcuts
select an option, Enter submits, and because the choices are real radio inputs the arrow keys move
between them natively once one has focus.

What was missing was paging. Space and PageDown scroll 85% of the pane, and at the bottom of a
passage whose only remaining action is a page break they continue instead — which is what pressing
it again means to a reader. Shift+Space and PageUp go back; Home and End jump.

**Arrow keys are deliberately untouched.** A ChoiceScript screen is often a page of prose above its
choices, and hijacking Down to move the selection would take scrolling away from someone in the
middle of reading. Native radio behaviour already covers the case where the reader has reached the
options.

Scroll position is restored once per session, from localStorage rather than the engine's save
store: it describes the window, not the story, and should not travel inside a save file into a
different window size.

### Focus mode

`⌘⇧F`, or the button in the titlebar. Hides both side panes without forgetting whether they were
open, so leaving it restores the layout the reader had. Escape exits — it is the way out of a mode,
never the only way in.

### Icons

The build could not run without them, because `tauri.conf.json` names five files. Rather than
leave you blocked, they are generated: an original mark, a branching path on a blue rounded
square, drawn at 1024 and downsampled. It reads cleanly at 32 px, which is the only size that
really tests an icon.

The `.icns` is written by hand. Pillow only saves that format on macOS, where it shells out to
`iconutil`, so the container is assembled directly: `icns`, total length, then OSType, length and
PNG payload per entry, across eleven sizes including the `@2x` retina types. Replace the set any
time with `npm run tauri icon <your 1024 png>`.

### Verified

- `npm run build` — clean. Bundle 445 kB, CSS 37.9 kB.
- `node check-theme-scope.cjs` — 16 tokens resolve.
- `node scripts/check-register.mjs` — 19 chrome tokens, none crossing.
- `node e2e-test.cjs` — **22 passed, 0 failed.**
- Icon set opened back with Pillow to confirm the hand-written `.icns` parses as ICNS at 1024 and
  the `.ico` carries all seven resolutions.

One real bug caught here: `tsc --noEmit` passed while `tsc -b` failed on the new `toggle-focus`
menu id. The two resolve project references differently, so **`npm run build` is the check that
counts** — `typecheck` alone will let a missing union member through.

### What is left

Only compilation. `cargo build` has never run against any of `src-tauri/`. In likely order of
trouble: `SubmenuBuilder`'s macOS-only helpers, `event.id().0` versus `.as_ref()` across 2.x
releases, `PredefinedMenuItem::fullscreen` on Windows, and `EffectsBuilder`'s import path. Each is
isolated to a few lines, and the LOG entries above say what to do with them.

After that, the first genuine test is the one nothing here can substitute for: open Choice of
Magics, play into chapter one, and check that a chapter plate renders. 73 `*text_image` calls
depend on the asset protocol scope being right.

---

## 2026-09-08 · Session 3 — Phases 6 to 8 (the native shell and the theme split)

### Delivered

`choicescript-3.zip`, the whole repository with structure intact. Unpack over your checkout,
`npm install`, `npm run tauri:dev`.

**New this session**

| File | What it does |
| --- | --- |
| `src-tauri/src/menu.rs` | The native menu bar. Items forward their id to the webview; Rust owns only the shape and the accelerators |
| `src/lib/desktop/menu.ts` | `useMenu()` — components register the ids they handle, so menu items and on-screen buttons share one code path |
| `src/lib/desktop/appearance.ts` | Chrome light/dark following the OS, with a stored override |
| `src/styles/chrome.css` | The `--app-*` register: tokens, platform faces, density, layout, scrollbars |
| `src/features/Shell.tsx` | The window frame: titlebar, three panes, drag regions |
| `src/features/Sidebar.tsx` | The library as a permanent shelf |
| `src/features/StatsPanel.tsx` | The docked character sheet |
| `src/features/DropOverlay.tsx` | The whole window as a drop target |
| `scripts/check-register.mjs` | Build guard: fails if the two registers cross |

**Modified:** `src-tauri/src/lib.rs` (menu registration), `src/App.tsx` (desktop branch),
`src/features/Player.tsx` (`variant="shell"`), `src/components/ui/toaster.tsx` (corner toasts),
`src/index.css` (imports the chrome register), `src/lib/desktop/index.ts`, `package.json`.

### The theming, concretely

Two registers, and the build now fails if they cross:

- `--cs-*` is the page. It follows the reading theme the player picked, all six of them.
- `--app-*` is the chrome. It follows the operating system's light or dark appearance and nothing
  else. Nineteen tokens: chrome surfaces, borders, labels, accent, shadow, titlebar height,
  control height, radius, pane widths, UI font.

Everything is scoped to `[data-shell="desktop"]`, so the static site is untouched — which the 22
e2e assertions confirm rather than assume.

What that buys, specifically: picking sepia no longer repaints the sidebar. Chrome takes the
platform UI face (SF Pro, Segoe UI Variable, Inter/Cantarell) while prose keeps the engine's
serifs. Controls drop from 44 px to 28 px under a cursor and go straight back to 44 px under
`(pointer: coarse)`, because the WCAG target size is about fingers, not mice. Scrollbars are thin
overlay thumbs with a stable gutter. Toasts moved to the bottom right, capped at three, since the
bundled game alone calls `*achieve` 325 times.

Vibrancy needed one structural change: `background: transparent` on `html` and `body` in the
desktop shell, with the reading theme's paper moving onto `.app-main`. Otherwise the opaque body
paints over the material the window manager is compositing. The reading column stays fully
opaque — prose over a blurred desktop is unreadable, and the whole brief is that the page recedes,
not that it dissolves.

### The engine constraint that shaped the stats panel

The plan called for a live docked inspector. The engine will not allow one, and it is worth
writing down why.

`showStats()` sets `bus.statsMode`, and while that flag is up **every** block the engine emits
routes to the stats channel (`bus.js:74`, `:86`, `:96`). A panel that simply stayed open would
swallow the story's own output the moment the player made a choice. `shellCloseOverlay()` then
clears `statsBlocks` outright, so the panel cannot just hold the overlay open and read from it
either.

So the panel is a snapshot: run the scene, copy the blocks out, close the overlay immediately to
lower the flag, and re-read whenever the player reaches a new screen. Refreshing that often is
safe because the engine runs the stats scene with `saveSlot: 'temp'` (`shell.js:79`), its own
convention for exactly this — the autosave concern in the plan turned out to be already handled
upstream. Interactive stats screens keep their dialog; a page that asks a question cannot be
answered from a snapshot, so the panel says so and offers the full screen.

### Verified

- `npm run build` — clean. Bundle 442 kB, CSS 37.9 kB.
- `npm run typecheck` — clean.
- `node check-theme-scope.cjs` — 16 tokens resolve against the live theme.
- `node scripts/check-register.mjs` — 19 chrome tokens, none crossing. Also confirmed it *fails*
  correctly, which is the only way to know a guard works.
- `node e2e-test.cjs` — **22 passed, 0 failed**, including "every control clears the 44px target"
  and "it is a centred dialog, not a drawer". Both would have broken if the density change or the
  layout rework had leaked into the web build.

`npm test` now runs all four.

### Still not compiled

No Rust toolchain here, so `menu.rs` joins the rest of `src-tauri/` as unverified. Most likely
first-build issues, in order: `SubmenuBuilder`'s macOS-only helpers (`services`, `hide_others`)
are behind the `#[cfg(target_os = "macos")]` arm already; `event.id().0` is the `MenuId` tuple
field and became `.as_ref()` in some 2.x releases; `PredefinedMenuItem::fullscreen` exists on
macOS only — if it fails on Windows, wrap it the same way as the app menu.

### Behaviour worth knowing

Switching games from the sidebar reloads the process. The engine holds one game at a time and
cannot be re-pointed in place, so there is no honest alternative short of tearing the interpreter
down. Saves are on disk, so nothing is lost — but it is a visible flash and I would rather flag it
than let you find it.

### Next — Phase 9

Keyboard-first reading (Space and PageDown to page, arrows to move the choice selection, Enter to
confirm), scroll position restored per game, a full-screen reading mode that hides both side
panes, then icons and the packaging pass.

---

## 2026-09-08 · Session 2 — Phases 1 to 5 (storage complete, interface not started)

### Delivered

The whole repository as files, folder structure intact: `choicescript-3/`, also zipped as
`choicescript-3.zip`. Replace your checkout with it, or copy the changed paths over. Then
`npm install`, because `package.json` gained three dependencies.

**Delivery protocol, revised:** full files with structure, not patches. Future sessions ship only
the files that changed in that session, in the same layout, so they can be dropped straight in.

Build artefacts are left out on purpose: `node_modules/`, `dist/` and `public/engine/` are all
generated (`npm run build` writes the last one from `engine/` via `scripts/build-engine.mjs`).

Changed or new in this session, 26 files:

**New — Rust (`src-tauri/`)**

| File | What it does |
| --- | --- |
| `Cargo.toml` | Tauri 2 with `protocol-asset`, plus `zip`/`flate2`/`tar`. `zip` has default features off, which drops the bzip2 and zstd C dependencies |
| `tauri.conf.json` | Window, CSP, asset protocol scope, bundle targets, `.cszip` association |
| `capabilities/default.json` | Permissions for the `main` window |
| `src/paths.rs` | Every path, with id and store-name validation as the only way in |
| `src/archive.rs` | Extraction, filtering, scene-root detection. No Tauri types, so `cargo test` reaches it |
| `src/library.rs` | Import, list, read, delete, plus the bundled-game import and the decompression fallback |
| `src/store.rs` | One JSON file per save namespace, written atomically |
| `src/lib.rs` | Plugins, command registration, and both file-open delivery mechanisms |

**New — TypeScript**

| File | What it does |
| --- | --- |
| `lib/desktop/index.ts` | `isDesktop()`, `platform()`, and the boot sequence |
| `lib/desktop/polyfills.ts` | `crypto.randomUUID` and `DecompressionStream` fallbacks |
| `lib/desktop/links.ts` | External links to the system browser |
| `lib/desktop/store.ts` | File-backed `window.store` |
| `lib/desktop/openWith.ts` | `useDesktopImports()` — bundled games and `.cszip` opens |
| `lib/db.types.ts` | `StoredGame`, `Ingested`, and the `Backend` contract |
| `lib/db.web.ts` | The existing IndexedDB code, moved |
| `lib/db.tauri.ts` | The file backend |

**Modified:** `lib/db.ts` (now a dispatcher), `lib/library.ts` (two ingest paths, asset URLs),
`features/Library.tsx` (desktop import hook, `.cszip` accepted), `main.tsx` (one import),
`package.json`, `.gitignore`.

`src-tauri/games/choice-of-magics.cszip` is included in the tree and is the archive you uploaded,
renamed. It stays gitignored, so committing the repository will not carry it.

### Verified

Everything that can be checked without a Rust toolchain, was:

- `npm run build` — clean, 431 kB bundle, up about 1 kB from before.
- `npm run typecheck` — clean.
- `node check-theme-scope.cjs` — all 16 tokens resolve against the live theme.
- `node e2e-test.cjs` — **22 passed, 0 failed.** This is the meaningful one: the harness drives a
  real import through `importGame`, so the `library.ts` refactor and the `db.ts` split are
  exercised end to end on the web path, including "scenes were preloaded, not fetched" and
  "nothing reached a server".

### Not verified

**No Rust toolchain in this environment, so none of `src-tauri/` has been compiled.** The unit
tests are written and will run under `npm run test:rust`, but the first `cargo build` may need
small fixes. Most likely spots, in order:

1. `window.set_effects` — the `EffectsBuilder` import path moved between Tauri 2 minors. If it
   fails, delete `apply_window_effects`; nothing else depends on it and vibrancy is Phase 8 work.
2. `RunEvent::Opened` is macOS-only in the enum. It is already behind `#[cfg(target_os = "macos")]`.
3. `zip` 2.x renamed `FileOptions` to `SimpleFileOptions`; the test helper uses the new name.

### Decisions taken while building

| Decision | Reason |
| --- | --- |
| Archives cross IPC as a raw body, not a JSON array | The bundled game is 3.8 MB. As a JSON number array that is roughly 20 MB of text to serialise and parse on the main thread |
| Format detected by magic bytes, not extension | `.cszip` then needs no special case anywhere — it is a zip and says so in its first four bytes |
| A failed import deletes its directory | The manifest is written in a second step, so a half-written game would be invisible to the library and never cleaned up |
| Save stores are written to a temp file and renamed | A crash mid-save cannot truncate a store. Rename is atomic when both paths share a directory |
| `store.set` calls back on the memory write, not the disk write | The engine chains its next step off that callback; a player should not wait on disk to see "Saved" |
| Close is intercepted, flushed, then the window destroyed explicitly | Returning from the handler would let the process exit inside the 200 ms debounce window, losing the save the player just made |
| Bundled import guarded by a module-level flag as well as the Rust marker | StrictMode runs effects twice in development, and two overlapping first-run imports would both find the marker absent |
| `quota()` returns `{ usage, quota: 0 }` on desktop | The library screen hides its storage line when quota is zero, which is the honest result: there is no browser quota, and disk free space is not a limit worth showing someone importing a 4 MB game |
| Desktop asset URLs are never revoked | They are paths, not handles. `releaseAssets` now checks for the `blob:` scheme first |

### Bugs found and fixed along the way

- **Save namespace leak (fixed on desktop, still live on web).** `initStore()` caches
  `window.store` for the lifetime of the page while `openGame()` reassigns `window.storeName` per
  game. The desktop store reads the namespace on every call, so the second game opened in a
  session writes to its own file. The web build still writes game B's saves into game A's
  namespace.
- **Byte order marks.** `TextDecoder` strips a UTF-8 BOM; a naive Rust read does not, and a BOM
  before `*title` defeats the title and author regexes. `archive.rs` strips it at extraction, with
  a test.
- **`.txt.json` siblings.** Choice of Magics ships 22 of them next to its 22 scenes. A looser scene
  match would have doubled the scene list. There is a test for exactly this.
- **`cutscenes/`.** Scene-root detection requires `scenes/` to be a whole path segment, so a game
  with a `cutscenes` folder does not resolve to a phantom root.

### Next — Phase 6, the native shell

This is where the interface work starts; nothing before it is visible as a redesign.

1. **6.1 Titlebar and drag region.** macOS overlay titlebar with a 78 px leading inset for the
   traffic lights; Windows and Linux keep system decorations with the toolbar beneath.
   `data-platform` is already set on `<html>` by `lib/desktop/index.ts`, so the CSS can branch.
2. **6.2 Native menus, accelerators and window state.** `tauri-plugin-window-state` is already a
   dependency and registered; the menu module is not written yet.
3. Then Phase 7 (sidebar library, docked stats inspector) and Phase 8 (the `--app-*` register,
   OS appearance following, density, vibrancy CSS, register guard).

### Before you can run it

1. Put the tree in place, replacing your checkout or copying the changed paths over
2. `npm install`
3. Generate icons into `src-tauri/icons/`: `npm run tauri icon <a 1024×1024 png>`.
   `public/favicon.png` is smaller than that and will be upscaled, which shows most on the
   macOS `.icns`. The build will not run until these exist, because `tauri.conf.json` names them
4. `npm run tauri:dev`

First launch imports Choice of Magics, so the library screen pauses for a moment.

### Open questions

- **Product name and identifier** are still `ChoiceScript` and `com.kmab5.choicescript`. The
  identifier determines the data directory, so changing it after you have played orphans the
  library.
- **Asset protocol scope.** `$APPDATA/**` should cover the game folders on all three platforms. If
  images 404 on first run, that scope is the thing to check first, before anything in the
  application code.

---

## 2026-09-08 · Session 1 — Investigation and plan

### Done

- Cloned and read `kmab5/choicescript-3`. It is already fully client-side: React 18 + Vite 5 +
  Tailwind 4, engine bundled by `scripts/build-engine.mjs` into `public/engine/bundle.js`, scenes
  and assets in IndexedDB, saves and settings in `localStorage` via the Persist library.
- Traced the engine's persistence path. Everything goes through `window.store`, created by
  `initStore()` at `engine/util.js:791`. That function returns any pre-existing `window.store`
  instead of constructing one, so a replacement backend can be installed without touching
  `engine/`.
- Inspected the uploaded `choice-of-magic.zip`. 115 entries under a `choice-of-magic/` wrapper:
  22 scene files (4 MB of text), 22 `.txt.json` siblings, 66 PNGs, `icon.jpg`, `credits.html`,
  `mygame.js`.
- Counted engine feature usage in the game: 100 `*achievement` declarations, 325 `*achieve` calls,
  73 `*text_image`, 3 `*script`, 2 `*stat_chart`, no `*ifid`.
- Read `src/index.css`. Every design token maps to a `--cs-*` variable, so the reading theme
  currently paints the entire interface.
- Wrote the implementation plan: `docs/superpowers/plans/2026-09-08-choicescript-desktop.md`.

### Decisions

| Decision | Reason |
| --- | --- |
| Tauri v2, desktop only | Chosen target; no mobile scaffolding |
| Games and saves as real files under `app_data_dir` | Chosen storage model; durable, backup-able, hand-inspectable |
| Rust owns bytes and paths, TypeScript owns ChoiceScript semantics | `parseSceneList`, `parseAchievements` and title parsing already work; porting them would duplicate fiddly logic for nothing |
| `db.ts` becomes a runtime dispatcher | Keeps the Vercel static deployment working |
| Assets served via `convertFileSrc`, not Blobs | The bundled game renders 73 images |
| CSP includes `'unsafe-eval'` | `engine/scene.js:2479`, `engine/util.js:1057`, and 3 `*script` blocks in the bundled game |
| `dragDropEnabled: false` | Otherwise Tauri swallows the drop event |
| Two token registers: `--app-*` chrome, `--cs-*` page | The window frame belongs to the OS, the page belongs to the author |
| Chrome appearance follows the OS, not the reading theme | Same reason |
| Storage phases before interface phases | Phases 6–8 would otherwise be rebuilt on a changing data layer |

### Licensing note

Choice of Magics is a commercial title by Kevin Gold / Choice of Games. Bundling it in a local
build is your call; do not distribute built installers containing it. `.gitignore` excludes
`src-tauri/games/*.cszip`.

### Delivery protocol

Phase 1 arrives as complete files. From Phase 2 onward: only new files and patches to changed
ones, with the log updated each time.
