# ChoiceScript Desktop — Log

A running record of what has been done, what was decided and why, and what comes next.
Newest entry at the top.

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
