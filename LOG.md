# ChoiceScript Desktop — Log

A running record of what has been done, what was decided and why, and what comes next.
Newest entry at the top.

---

## 2026-09-08 · Session 19 — v0.3.3, the five, and a landing page

All five implemented, achievement analysis skipped as instructed.

### God mode is a diff now

Nothing reaches the interpreter as you type. Edits collect as a draft, changed
rows go amber with a left marker, **Apply** commits them, applied rows go green,
and there is one level of undo. Cancel drops the draft.

Two details worth recording:

- **The undo snapshot is taken from the interpreter, not the draft.** At apply
  time each variable's *current* value is read and kept, so undo restores what
  was actually there rather than what the form believed. Those differ whenever
  the story wrote to a variable between the edit and the apply.
- **A partial apply stays partial.** If the third of five edits is rejected, the
  first two are in, the rest stay in the draft to be fixed, and the error names
  the one that failed. Rolling back two successful writes to be tidy would be
  its own surprise.

The state colours are a diff's, mixed into the theme's surfaces rather than
fixed hues so they survive Terminal, and paired with a left marker so the state
does not rest on colour alone.

The harness now tests the whole cycle: type, assert the interpreter is
**unchanged**, apply, assert it changed, undo, assert it came back.

### Sheet shows what the stats scene actually uses

Reading only `*stat_chart` was the bug. A stats screen is a scene, and most of
them do far more than draw a chart: they branch with `*if`, interpolate with
`${}` and `@{}`, compute intermediates with `*temp`. None of that appeared.

The parser now collects every variable the scene mentions — chart rows first in
the author's order, then everything else as the scene mentions it. Names the
scene uses but the game never creates are listed too, marked *not created*, with
no value. That is information rather than noise: a stats screen referring to a
variable that does not exist is a bug the author wants to see.

### Advanced search

Collapsed under the plain filter, because the plain filter answers most
questions and a row of switches above the list would cost more than it earns.
Inside: type (number, true/false, text — with numeric strings counted as
numbers, since that is how ChoiceScript stores them), scope (permanent or
temporary), regular expressions, and case sensitivity. An unfinished pattern
matches nothing and says why rather than throwing on a keystroke.

### Context menus

The webview's own menu is suppressed everywhere and replaced per region: the
shelf background, a shelf card, the story, the panes and the titlebar, the
console. Items are omitted rather than greyed where they do not apply, for the
same reason a standalone build has no "Back to Library".

One exception, deliberately: **editable fields keep an edit menu**. Killing the
native menu takes cut, copy and paste with it, and a text field without those is
broken in a way people notice in a second. Those go through the clipboard API.
Anywhere else, a text selection gets a Copy.

Keyboard-navigable, dismissed by Escape, a click elsewhere, a scroll or the
window losing focus, and flipped inwards near an edge rather than overflowing.

### Font weight

A slider, per face, for the six faces with a range — eight of the bundled
families are variable fonts, so the axis is already there. The four static
families (Lato, Kanit, Sanchez, OpenDyslexic) get their two real weights instead
of a slider that would quietly synthesise everything between.

It is stored per face, because 500 in Fraunces is not 500 in JetBrains Mono, and
bold derives from it — `min(900, weight + 300)` — so a reader at 300 still gets
a bold that looks bold beside it. Settings gained a Typeface row too; the six
faces were only reachable from inside a game before.

### The landing page

`docs/`, served by GitHub Pages, and **generated**: `npm run docs` writes it from
`package.json` and the copy in `scripts/build-docs.mjs`. `npm run test:docs`
regenerates and fails if the committed file differs, and the release workflow
regenerates it from the tag being built — so "stays up to date" is enforced
rather than promised.

Identity: the palette and the lowercase-heading habit are kmab's (purple
#B24BFF, green, amber, near-black, off-white, mono labels). The type is
deliberately **not** — the page is set in Fraunces over JetBrains Mono, the
app's own bundled faces, so it looks like the thing it is selling rather than
like the brand kit it came from. The favicon is the app's branching-path mark in
the brand's purple, not a copy of the lambda.

It also carries the attributions this project owes: ChoiceScript and its
licence, that games belong to their authors, and that nothing here
redistributes them.

### Verified

- `npm run test:webview` — **88 passed, 0 failed** (five new: the native context
  menu is prevented, ours opens, it has items, Escape dismisses it, and the
  reading weight is a token)
- `npm run test:runners` — **97 passed, 0 failed**
- `npm run test:author` — **41 passed, 0 failed** (draft, apply, undo, advanced
  search collapsed)
- `npm run test:standalone` — 18 passed, 0 failed
- `npm run test:game` — **83 passed, 0 failed** on Choice of Magics
- docs freshness, version, theme-scope, register, stale — pass

`npm test` now runs seven checks and six passes.

---

## 2026-09-08 · Session 18 — v0.3.2, the tests properly, and the fonts

Nine of your sixteen items. The seven left are listed at the bottom with
reasons, not excuses.

### The tests: upstream's, not mine

You were right that mine did not work, and the reason is that they were the
wrong shape. Mine drove the **live game** through the public API — restart, read
the pending choice, answer it, wait for a render. Upstream's do not do anything
like that.

`quicktest.js` in dfabulich/choicescript is four lines. It shells into
`autotest.js`, which loads **`editor/embeddable-autotester.js`** — the form the
ChoiceScript web editor uses. That file is a single function, it takes *scene
text*, it walks every branch by cloning the interpreter, it renders nothing, and
it returns real line coverage. It is vendored here **unmodified**, with its
copyright header, because a test that is not upstream's test does not tell you
what upstream's test would.

There is no embeddable randomtest, so its `Scene.prototype` overrides are
mirrored from `randomtest.js` with the upstream line number recorded against
each one — `page_break` is not a stop (`:374`), `*finish` builds the next scene
from `nav` and carries on (`:618`), `input_text` sometimes answers blank where
blanks are allowed (`:602`), `choice` picks and records (`:654`).

Both are headless, which is what let them **move to the library**: nothing needs
to be playing to walk a scene. Testing is a right-hand panel on the shelf now,
with a game picker, and the in-game runner is gone.

`headless.ts` provides what `autotest.js` provides at the command line, and
finding that out took three failures, each of which was mine:

1. **`stats is not defined`** — every scene failed. Upstream sets `nav` and
   `stats` as *globals*; the autotester's cloned scenes reach for them by name.
   Passing them as arguments was not enough.
2. **`this.verifySceneFile is not a function`** — `autotest.js` defines
   `verifySceneFile`, `verifyImage` and `warning` and the embeddable file does
   not. One missing stub produced two misleading errors: `startup` aborted before
   its `*create` ran, so the stats scene then failed for the unrelated-looking
   reason that `warmth` did not exist.
3. **A blank page after a test run.** The harness silences `printx`/`println`
   while the runners work, and the first version never put them back — so a game
   opened afterwards in the same session rendered nothing. The harness playing a
   game *after* running the tests is what caught it.

Now verified end to end: the harness opens the panel, runs quicktest on the
fixture, and it explores both options of both choices across all three scenes
(`startup,13#1`, `startup,13#2`, `choicescript_stats,4#1`, `#2`), reports line
coverage and passes; then runs a three-iteration randomtest, which plays
commands, takes choices and passes.

### The fonts

OpenDyslexic is in — four faces, already woff2 upstream so copied rather than
converted, with `local()` first so a reader's own install wins. Regular, italic,
bold *and* bold italic, because the point of that face is weighted baselines and
a synthesised bold smears them.

Noted on the overused-font finding: your call, not touched, not raised again.

### The browser keyboard

`Ctrl+J` opened downloads, `Ctrl+P` offered to print a story, `Ctrl+F` opened a
find bar that cannot see past the current screen, `Ctrl+R` reloaded and lost the
reader's place. All swallowed in a capture-phase handler, along with F3/F5/F11
and the rest. `Ctrl+F` is redirected to the palette, because that is what
searching means here. Devtools stay in development and are blocked in a release
build.

One trap worth recording: my first list blocked `⌘⇧D`, `⌘⇧R` and `⌘W` — the
trace console, restart, and the window's own Close. Blocking a shortcut the app
documents is worse than leaving a browser one in place, so the exclusions are
written down in the file.

### One central theme

The bug was mine and precise: the engine persists `preferredTheme` in **each
game's** save store and applies it while booting, and my mirror effect wrote
whatever the engine reported back into the central store. So opening game B
adopted B's old theme, and the app had as many themes as it had games. The first
emission after an engine loads is now ignored — the engine is *told* the theme
on open, and only a change the reader makes afterwards counts.

### Also done

- **Mode badge** in the titlebar. God mode and a trace console change what the
  app is for; a reader who switched it on last week should not have to open
  settings to find out.
- **Debug bar**: drag the top edge to resize (remembered), collapse to a single
  line with the chevron, vertical padding on the header — it had none, which is
  why it read as a seam rather than a bar — and **export the trace** as TSV,
  since a trace that cannot leave the window is no use in a bug report.
- **Settings contrast**: a chip's hint stayed at `--app-label-dim` when the chip
  was selected and filled with the accent, putting dim grey on saturated colour.

### Not done, and why

Seven items. All are real and none are hard; they lost to the tests, which were
the thing you said was broken.

1. **Custom context menus** for the library, the game, settings and the panes.
2. **God mode: apply/cancel with git-style highlighting and one undo.** This is
   the one I would do first — it changes god mode from a live poke into an edit
   you can review, and the yellow/green/none scheme you described is exactly
   right.
3. **God mode: every variable used in `choicescript_stats`.** My parser only
   reads `*stat_chart` rows; variables the stats scene uses in `*if` or `${}`
   are invisible to it. The fix is parsing the whole scene for references, not
   just the chart.
4. **God mode: advanced search** — type filter and regex under a collapsed
   section.
5. **Font weight in settings** for the families that have a range. Eight of the
   bundled families are variable fonts, so the axis is already there.
6. **Achievement conditions in author mode.** Worth saying what this actually
   requires: a `*achievement` declaration carries no condition — achievements
   are granted by `*achieve` elsewhere. So showing "the variable conditions"
   means finding every `*achieve <id>` in the scenes and walking the indentation
   upwards to collect the enclosing `*if`s. Static analysis, very doable, but
   not a fifteen-minute job.

### Verified

- `npm run test:runners` — **92 passed, 0 failed** (library + author: the panel
  opens, quicktest walks the scenes with coverage and passes, randomtest plays
  and passes)
- `npm run test:author` — 33 passed, 0 failed
- `npm run test:webview` — 83 passed, 0 failed
- `npm run test:standalone` — 18 passed, 0 failed
- `npm run test:game` — **78 passed, 0 failed** on Choice of Magics
- theme-scope, register, stale, version — pass

`npm test` now runs six passes.

---

## 2026-09-08 · Session 17 — v0.3.1, the tests and the fonts

### Why the fonts were never working

`engine/theme/themes.css` names families — Iowan Old Style, Optima, Rockwell,
OpenDyslexic — and **the project has never contained a single `@font-face` rule
or one font file**. On any machine without those installed, which is every
Windows machine, each stack fell through to a system default and the typeface
setting did nothing visible. It was not a packaging mistake; there was nothing
to package.

All nine families from the archive are now bundled, subsetted to Latin and Latin
Extended-A plus the punctuation prose actually uses, and converted to woff2:
**13.4 MB of TTF becomes 1.16 MB**, 21 files. Variable fonts are used wherever
the family ships one — Fraunces, Google Sans, Nunito, Nunito Sans, Roboto Slab,
JetBrains Mono — so a full weight range costs one roman and one italic instead
of eight statics.

Three things found on the way in:

- **Fraunces has an optical-size axis from 9 to 144.** Its default instance is a
  display cut, which at 18px reads like a poster. `font-optical-sizing: auto` is
  what keeps body text on the text end of the axis.
- **Sanchez ships no bold**, only regular and italic. Bold is synthesised, with
  Roboto Slab behind it in the stack.
- **The selectors have to be `html body.font-x`**, not `body.font-x`. The
  engine's own stylesheet is injected at runtime, *after* the bundled one, so
  matching its specificity would lose on load order.

**OpenDyslexic is still missing.** It was not in the archive, and the engine's
hint has been naming a font the project never had. Its `@font-face` uses
`local()` so a system install is picked up, and the stack otherwise falls to
Nunito, which of everything bundled has the highest x-height. Send the files and
it is a two-line change.

### Quicktest and randomtest

Upstream ships both; this engine references them — `scene.js` reads
`this.quicktest` and `this.randomtest` and sets `stats.choice_randomtest` — and
ships neither. So they are written here, keeping each one's *idea*:

**Quicktest** is deterministic and about option coverage. Upstream walks the
game taking every option of every choice. Here: a baseline that always takes the
first option, then one run per option discovered, each following the baseline's
decisions to that choice, deviating, and carrying on — which discovers further
choices, which queue in turn. It stops when nothing is untaken, which is
upstream's goal expressed as a halting condition.

**Randomtest** is stochastic and about volume, and the **seed is the whole
point**: a crash on iteration 47 of seed 12345 has to be replayable or it is a
rumour. Each iteration is seeded separately (`seed + run * 7919`) so a single
iteration can be re-run on its own.

Every upstream option is a control: iterations, seed, avoid used options, log
prose, log choices, stop at first failure, loop guard, and what to type when the
story asks for text or a number. Failures are reported **with the path that
produced them**, last twelve decisions shown, so they can be walked by hand.

Both drive the real interpreter through the public API rather than
re-implementing it, which is the only way a pass means anything — and it means
the story visibly plays itself while a run goes. That is documented rather than
hidden; it is also the clearest possible indication of what is being tested.

Two details the engine decided for me: input pendings carry `numeric`,
`minimum` and `maximum`, so nothing has to be inferred (upstream picks the
midpoint for the same reason), and a choice site is identified by the live
Scene's `name:lineNum` rather than by option text — two choices with identical
wording at different points are different sites, which is what coverage has to
mean.

**What neither does: line-level coverage.** That needs the interpreter's own
`localCoverage`, and a number that looks like coverage but is not would be worse
than no number. Named as the next step rather than faked.

### Verified by running, not reasoning

The harness now drives an actual randomtest: two iterations of the fixture game,
through the real engine, waiting on the story rather than on a tick. It asserts
the run finishes, reports screens and option coverage, reaches an ending, and
that the fixture passes. That is the part that cannot be reasoned about.

- `npm run test:author` — **37 passed, 0 failed** (eight new for the runners)
- `npm run test:webview` — **83 passed, 0 failed** (three new: the default face
  is Fraunces, switching typeface switches family, each face resolves to a
  bundled family)
- `npm run test:standalone` — 18 passed, 0 failed
- `npm run test:game` — **75 passed, 0 failed** on Choice of Magics
- theme-scope, register, stale, version — pass

### One thing to hand back rather than decide

impeccable's detector went from 0 findings to 7, all the same one:
`overused-font` on **Fraunces, Lato and Roboto Slab**. Its heuristic is fonts
that signal generic design, and those three are on its list.

They are your explicit choices, so I have not touched them — but it is worth
weighing against the personality you gave me for PRODUCT.md. "Sharp tool,
Linear/Raycast-like" and Lato are not obviously the same instinct. Fraunces in
particular is doing something specific and un-generic; Lato and Roboto Slab are
the two I would question, and they are both fallbacks rather than primaries, so
dropping them costs almost nothing. Your call.

---

## 2026-09-08 · Session 16 — v0.3.0, author mode

Three of the four author-mode features are in. The fourth — quick and random
tests — is deferred on purpose, with a plan, at the bottom.

### The key finding: the interpreter can be traced without touching it

`engine/` is generated, so editing it is off the table. But the engine documents
the way in itself: `engine/core/stats.js` says of its own
`Scene.prototype.stat_chart` override that "randomtest.js already overrides this
same method, so the pattern is sanctioned rather than a fork".

So author mode wraps `Scene.prototype` **at runtime** — `if`, `goto`, `gosub`,
`return`, `goto_scene`, `choice`, `set`, `create`, `temp` — keeping the
originals and restoring them when the mode is switched off. That makes real
tracing possible with no engine change at all.

Two things this also turned up, both in `engine/scene.js`:

- The engine already has a `debugMode` that prints `*if` results through
  `println` — straight into the story text. The intent was there; the surface
  was not.
- Variables live in the global `stats` object and temps in `stats.scene.temps`
  (`:29`, `:72`). Both are plain objects, which is what makes god mode possible
  without an API for it.

**One honest caveat, recorded in the code too:** `*if` conditions are
re-evaluated to learn their result, because the engine's `if` returns nothing and
communicates through `this.indent`. ChoiceScript conditions are expressions, so
evaluating one twice does not change the story — but a condition calling
something with side effects would be counted twice, and an evaluation that
throws is recorded as `unknown` rather than being allowed to break the game.

### God mode

Two views, as asked. **Sheet** is the `*stat_chart` rows from
`choicescript_stats.txt`, parsed off disk, showing the author's display label
*and* the variable name — the label is what the sheet shows, the variable name
is what `*if` reads, and an author debugging a condition needs the second one.
**All** is every variable and temp, with engine bookkeeping behind a toggle,
because a list containing `choice_reuse` and `_looplimit` buries the ten that
matter.

### A real bug, found by a test asserting the wrong thing

I wrote the harness expecting `stats.warmth` to become the number `99`. It
stayed the string `"40"` — and the reason is that **ChoiceScript stores numbers
as strings**: `*create warmth 40` leaves `"40"`, because `tokenizeExpr` hands
back the literal and the comparison operators coerce.

That made my "preserve the type" logic wrong in a subtle way: it preserved
string-ness, which is correct, but it would also have accepted `"abc"` into a
numeric stat and silently turned `*if warmth > 50` into a string comparison. It
now recognises a numeric string as numeric, writes back in the engine's own
representation, and rejects non-numeric input. The assertion was wrong; the code
was wronger.

### The trace console

A drawer under the story, not a third column: trace lines are long and read
badly at 320px. Colour carries the kind and is mixed from the reading theme's
own tokens rather than hardcoded, so it survives Terminal and Nocturne alike.
Filters are subtractive, remembered, and grouped — an `*if`-heavy game emits
hundreds of lines a screen and the useful view is usually "everything except the
`*if`s".

Choices are traced from the front end rather than the interpreter, because the
interpreter sees an index and the front end has the label the reader actually
read, including which options were locked.

### Your three bugs

**Sordwin failed on "rendering bars".** That assertion counts `[role=meter]`
after opening the stats screen — but Sordwin draws its sheet with `*script` and
its own DOM, which is a legitimate thing for a game to do. The engine contract
that matters is that a `*stat_chart` *becomes* a meter, so the assertion now
runs only when the game's stats scene actually contains one, and skips with a
reason otherwise. Same shape as the stats-choice assertion two sessions ago.

**Export validation waited for the button.** Now checked as you type, per field,
in place. The rules are the installers', not mine: a Windows product name
becomes a folder name so `: / \ < > " | ? *` are out, MSI and NSIS both want
three numeric version parts, and an identifier is reverse-DNS with no `.app`
suffix. Build is disabled while anything is invalid.

**No progress in the GUI.** The CLI now numbers its own steps —
`▸ [3/8] compiling` — for two readers at once: a person watching a terminal, and
the dialog, which parses the counter into a progress bar and a "step 3 of 8 —
compiling" line. Parsing its human output beat inventing a second protocol.

### Mode switching

Settings ▸ Mode in the library build. In a standalone build the flag is **baked**
by `cs:export --author` and the setting is absent — an exported story is either
a release build or a testing build, and a reader should not be able to flip a
published story into god mode. There is an "Author build" checkbox in the build
dialog.

### Deferred: quick and random tests

Not started, and the reason is worth stating rather than hiding. This engine
ships **no** quicktest or randomtest — only references to them in comments — so
this is not wiring up an existing runner, it is writing one: a driver that
restarts the game, answers pending choices by policy, detects `*finish` and
error blocks, guards against infinite loops (the engine's own `_looplimit` is
per-label, not per-run), and reports coverage.

That is a session's work on its own, and half of it would be worse than none —
a test runner that reports a false pass is actively harmful. The driver is the
same shape as the harness's play loop, so the groundwork exists.

### Verified

- `npm run test:author` — **29 passed, 0 failed** (new pass: god mode opens,
  lists variables, shows both names, edits write through to the interpreter and
  keep its representation; the console opens, traces the load, then traces a
  choice with its option text and a `*create` with its value)
- `npm run test:standalone` — 18 passed, 0 failed (two new: no god mode and no
  console when author mode is off)
- `npm run test:webview` — 80 passed, 0 failed
- `npm run test:game` — **75 passed, 0 failed** on Choice of Magics
- theme-scope, register, stale, version, detector — pass

`npm test` now runs five passes.

---

## 2026-09-08 · Session 15 — v0.2.5, the startup panic

```
panicked at tauri-2.11.5/src/lib.rs:734:
state() called before manage() for tauri::path::PathResolver
```

Mine, and a plain ordering mistake. `Builder::menu`'s closure runs while the app
is still being assembled — before any plugin or managed state exists — and last
session I put `is_standalone()` inside it, which asks the **path resolver**
where the resources are. The resolver is not there yet, so it panicked before
the window ever opened.

The menu is now built in `setup`, where every plugin and every piece of state is
in place, which is what that hook is for:

```rust
let menu = menu::build(&app.handle().clone())?;
app.handle().set_menu(menu)?;
```

### Verified against the actual crate source rather than assumed

Two things could have made this a second failed startup, so I downloaded
`tauri-2.11.5` and `muda-0.19.3` from crates.io and checked:

1. **`set_menu` on an `AppHandle`.** It is in `shared_app_impl!`, applied to
   both `App<R>` and `AppHandle<R>` under `#[cfg(desktop)]` — and on non-macOS
   it walks existing windows and attaches the menu to any that do not have one.
   So building the menu *after* the window exists is fine, which was the thing
   worth confirming before moving it.
2. **Every accelerator string parses.** The menu had never got as far as being
   constructed, so all fourteen were still untested, and one unparseable string
   fails the whole menu. `muda`'s table takes `"BACKSLASH"`, `"COMMA"`,
   `"DIGIT0"`, `"EQUAL"`, `"MINUS"` and single letters via `"KEYx" | "x"`, and
   `"CMDORCTRL"` is a recognised modifier. All fourteen are good.

One behavioural consequence worth knowing: a bad menu is now a startup *error*
rather than a panic, because `setup` returns `Result`. The message will name the
item.

Also fixed the warning from the same build: `Manager` was unused in `menu.rs`
after `set_library_menu_enabled` was deleted.

### Two things in your log that are not this bug

**The Vite deprecation warnings are back**, naming the `vite:react-babel`
plugin. That is `@vitejs/plugin-react` **v4** — the version whose missing Vite 8
peer range broke `npm install` three sessions ago. `package.json` and
`package-lock.json` both say 6.1.1 here, so your `node_modules` is stale:

```bash
npm install
```

**Your `Cargo.lock` had drifted four releases behind.** `Cargo.toml` said 0.2.4
while the lock still recorded `cs-tauri 0.1.8`. Cargo rewrites it on the next
build so nothing broke, but `check-version.mjs` is the file whose whole job is
noticing this, and it was not looking. It now checks the lock's own entry for
the crate too, reading the crate name from `Cargo.toml` rather than assuming it
— you renamed the crate from `choicescript` to `cs-tauri` and my scripts had not
noticed that either.

Versions are 0.2.5 across `package.json`, `Cargo.toml` and `Cargo.lock`. I
skipped 0.2.4 rather than reusing the number you had already shipped.

### Verified

- `npm run test:webview` — 80 passed, 0 failed
- `npm run test:standalone` — 16 passed, 0 failed
- theme-scope, register, stale, version — pass

### What is still unrun

The app actually starting. Everything above is either checked against crate
source or covered by the harness, but `devtools.rs` has never compiled and the
menu has never been constructed at runtime. If the build gets past those two,
the hammer button on each shelf card is the thing to try.

---

## 2026-09-08 · Session 14 — v0.2.3, the builder as a GUI (development only)

Every game on the shelf now has a hammer button in a dev instance. It opens a
dialog with the CLI's flags as controls and the CLI's output streamed into it —
output folder, app name, version, identifier, portable/NSIS/MSI, icon from the
cover, skip tests.

**It is a front end, not a second builder.** The dialog spawns
`scripts/cs-export.mjs` and reads its stdout and stderr line by line. There is
one builder, and the terminal and the GUI are both ways of starting it. Anything
else and the two would drift the first time a flag changed.

The game is staged as an archive **without your saves** before the build: a
reader exporting a game wants their progress to travel with it, a *build* of
that game does not want the builder's own save file in every copy that ships.
`export_game` and the builder now share one `write_archive` with an
`include_saves` flag.

Streamed rather than collected, because a build takes minutes and a window
showing nothing for minutes is indistinguishable from a hang. Closing the dialog
mid-build leaves it running and says so.

### The gate, and the first attempt at it failing

Two layers:

1. **The interface** is behind `import.meta.env.DEV`, so a production bundle
   does not contain it.
2. **The Rust commands** refuse under `cfg(debug_assertions)`. Belt as well as
   braces because this spawns `node` against a path derived from
   `CARGO_MANIFEST_DIR` — meaningless outside a checkout, and not something to
   leave in a shipped app whatever the interface does.

My first version of layer 1 did not work, and I only know that because I
checked the built bundle instead of trusting the reasoning:

```
build_standalone       in dist: PRESENT
dev_info               in dist: PRESENT
Build an app for       in dist: PRESENT
```

Two mistakes. `isDev()` is a *function call*, which a bundler cannot fold, so
the branch stayed alive; and the dialog was a static import, which keeps a
module in the graph however dead the branch around it is. The fix reads
`import.meta.env.DEV` directly and makes the dialog a dynamic import inside the
folded branch, so the chunk is never emitted:

```
build_standalone       absent
dev_info               absent
BuildAppDialog         absent
cs-export              absent
```

There are four harness assertions on that now — it searches `dist/` for the
command names and the component name — because "it is dev-only" is a claim
about a build artefact, and claims about artefacts should be checked against
artefacts. `dist/` *is* a production bundle when the harness runs, which is
what makes this testable at all.

Also worth noting: the version offered as the default now comes from
`package.json` through a Vite `define`, rather than being a third place a
version number could disagree.

### Verified

- `npm run test:webview` — **80 passed, 0 failed** (four new, all about the
  gate)
- `npm run test:standalone` — 16 passed, 0 failed
- `npm run test:game` — **75 passed, 0 failed** on Choice of Magics
- build, typecheck, theme-scope, register, stale, version, detector — pass

### Uncompiled here, as ever

`devtools.rs` and the refactored `write_archive`. The interesting risk is the
`Box<dyn Read + Send>` the two output streams are merged through; if that
fights the borrow checker, the fallback is one thread per stream with the
concrete types, which is a five-line change.

---

## 2026-09-08 · Session 13 — v0.2.2, five from the first real export

The exported app working is the good news. All five notes are fixed, and two of
them were mine in a way worth naming.

### The icon: the fix was wrong, not just incomplete

Last session I made `--icon` stash `src-tauri/icons/`, let `tauri icon`
overwrite it, then put it back. That is the wrong shape of solution. Anything
between the two halves — a crash, a Ctrl-C, a locked file, a failed compile —
leaves the player wearing a game's cover, and the window for that included a
five-minute cargo build.

It now never touches the shared directory. `tauri icon -o .icons-<slug>`
generates into a directory of its own and the overlay config points
`bundle.icon` at it. There is no window in which the player's icon is wrong,
because it is never written.

And while rewriting it I found the worse version of your bug still in the
error path: a leftover `rmSync(ICONS)` in the `catch`, which would have
**deleted** the app's icon set outright if `tauri icon` had failed. Gone.

### The menu still said "Back to Library"

My fix greyed those items out via a command from the front end. Two things wrong
with that: it ran after the menu was already on screen, and greyed-out is not
absent — a disabled "Back to Library" still tells the reader this app has a
library somewhere.

The menu is now *built* differently. Rust checks for the `standalone.json`
resource while constructing the menu (`library::is_standalone`), and in a
standalone build File contains only Close — no "Open Game…", no "Back to
Library". The `set_library_menu_enabled` command is deleted; there is nothing
left for it to do.

### ⌘⇧S did nothing, and I put that hint there

The palette has advertised `⌘⇧S` for the stats screen since the session I built
it, and **nothing was ever listening for it**. I wrote the hint from the label I
wanted rather than from a binding that existed, which is the kind of thing that
makes a keyboard-first app feel unreliable.

Both ends exist now: a "Stats Screen" item in the Game menu with
`CmdOrCtrl+Shift+S`, and `mod+shift+s` in the front end's own key map so it
works whether or not the native menu is behaving. The Game menu also got
reordered — save, restore, then stats and achievements, then restart on its own
past a separator, since it is the one item that discards progress.

There is a harness assertion for it now: dispatch Ctrl+Shift+S, expect the
overlay to be `stats`. Every other advertised shortcut was already in the key
map; this was the only one that was fiction.

### The window title

`document.title` names the *document*. The native window keeps whatever
`productName` it was built with, which is why the library build said
"ChoiceScript Player" with Sordwin open and an exported story showed its product
name in Alt-Tab.

`setWindowTitle()` sets both, since both are read in different places — the
document title is what a screen reader announces, the window title is what the
taskbar and window switcher show. In a standalone build it is set from the
exporter's marker file *before the engine loads*, so the taskbar entry is never
briefly wrong.

### Verified

- `npm run test:webview` — **76 passed, 0 failed** (three new: the document
  title follows the game, the native window title matches it, and Ctrl+Shift+S
  opens the stats screen)
- `npm run test:standalone` — **16 passed, 0 failed** (new: the window is named
  after the story, not the player)
- `npm run test:game` — **71 passed, 0 failed** on Choice of Magics
- `cs:export` end to end, including `--icon` deriving from the 1024×1024 JPEG,
  and `git status` clean on `src-tauri/icons` afterwards — including after the
  run failed at the cargo step, which is the case that mattered

### Still uncompiled here

`is_standalone` and the rebuilt `build()` in `menu.rs`. If the menu fails to
construct, every accelerator goes with it — but the front-end key map now covers
the same bindings independently, which is exactly why that layer exists.

---

## 2026-09-08 · Session 12 — v0.2.1, the export command on a real machine

Your run got four steps in and died on the first spawn. Fixed, plus three more
things the run exposed — two of which would have cost you something.

### `spawnSync npm.cmd EINVAL`

Node's fix for CVE-2024-27980 made `child_process` refuse to spawn a `.cmd` or
`.bat` without `shell: true`. On Windows `npm` *is* `npm.cmd`, so every step in
the script was going to fail on Node 24. It never came up here because this
container is Linux, where `npm` is a real executable.

Turning the shell on was the wrong fix: paths in this command come from you, and
hand-quoting user paths through `cmd.exe` is how quoting bugs are born. So the
script no longer goes through npm at all. Each step resolves the package's own
JS entry point out of its `package.json` `bin` field and runs it on
`process.execPath`:

| Step | Now runs |
| --- | --- |
| `npm run build` | `node scripts/check-stale.mjs`, `node scripts/build-engine.mjs`, `node …/typescript/bin/tsc -b`, `node …/vite/bin/vite.js build` |
| guards | `node check-theme-scope.cjs`, `node scripts/check-register.mjs` |
| harness | `node scripts/test-webview.cjs <your archive>` |
| standalone | `node scripts/test-webview.cjs <your archive> --standalone` |
| rust | `cargo test --manifest-path src-tauri/Cargo.toml` |
| build | `node …/@tauri-apps/cli/tauri.js build --config …` |

No shell, no `.cmd`, no quoting, and one fewer process per step. `cargo` is a
real executable everywhere, so it needs none of this — only an explicit
manifest path, since there is no shell to `cd` with.

`ENOENT` now reports as *"rust: could not run cargo — is it on PATH?"* rather
than a spawn stack trace.

### `--icon` was going to overwrite your icon set

`tauri icon` rewrites `src-tauri/icons/` **in place**. My restore covered the
games folder and the two config files and not the icons — so one `--icon` build
would have replaced the library app's custom icon with a game's cover art,
permanently, and the next ordinary build would have shipped it. The icon set is
stashed and restored with everything else now, and restored again if the tool
fails halfway. Verified with `git status`: byte-for-byte identical afterwards.

### `--icon` was also going to refuse a perfectly good cover

Choice of Magics ships **two** covers: `icon.jpg` at 1024×1024 and `icon.png`
at 192×192. My finder took whichever came first in the archive. Whichever it
took, the answer was wrong — the PNG is far too small, and I had just added a
pre-check that would have rejected the JPEG for not being a PNG.

It now measures every candidate from its own file header — PNG's IHDR, JPEG's
first SOF marker — and picks square first, then largest, then PNG on ties. It
prints what it chose:

```
  icon source: choice-of-magic/icon.jpg (JPEG 1024×1024)
```

And `tauri icon` **accepted the JPEG**, generating the whole set — ICNS, ICO,
every PNG size, the ten Appx logos. So the pre-check now only rejects what is
genuinely unusable: unreadable, non-square, or under 1024px. A 192px cover is
not upscaled, because that would look worse than the app's own icon.

### Verified here

Every step of `cs:export` ran except the compile itself, which needs cargo:
staging, the marker, the config overlay, all five test steps against your actual
archive (68 passed for the game, 15 for the standalone interface), the icon
derivation, and restore — confirmed clean by `git status` on `src-tauri/icons`
and `src-tauri/games`.

- `npm run test:webview` — 73 passed, 0 failed
- `npm run test:standalone` — 15 passed, 0 failed
- build, typecheck, theme-scope, register, stale, version — pass

### Try again

```bash
npm run cs:export -- --game choice-of-magics.cszip --out dist-apps/choice-of-magics \
  --portable --nsis --icon
```

It should now get as far as cargo. If the compile fails it will be one of the
uncompiled Rust bits from the last few sessions — `app_mode`,
`set_library_menu_enabled` or `export_game` — and each is a single function.

---

## 2026-09-08 · Session 11 — v0.2.0, one game as its own app

### The shape of it

A standalone app is **not a fork**. It is this app with one archive in
`src-tauri/games/` and one extra resource file, `standalone.json`. The mode is a
runtime answer from Rust (`app_mode`), not a compile-time flag.

That choice is the whole design, and it buys three things:

1. One codebase and one binary. There is no second frontend to keep in step,
   which is the failure mode every "export as app" feature eventually has.
2. **Both modes are testable from the ordinary build.** `npm run test:standalone`
   mocks that single answer and gets the real single-game interface — 15
   assertions, no Rust compile, no second bundle.
3. The GUI version later is the same code path with a button in front of it.

### The CLI

```bash
npm run cs:export -- --game sordwin.cszip --out dist-apps/sordwin \
  --portable --nsis --msi
```

`stories/` is the inbox; bare names resolve against it. `--location` and
`--output` are accepted as aliases for `--game` and `--out`, because that is
what your message used and muscle memory outlives docs.

Name, version and identifier come from the game itself — `*title` and `*author`
out of `startup.txt` — so the installer says *Sordwin: The Evertree Saga*, not
*ChoiceScript Player*. `--name`, `--version` and `--identifier` override.
`--icon` runs the game's own cover art through `tauri icon`, and says so and
carries on if the cover is not a large square PNG.

Beyond what you asked for, and each for a reason:

- **Tests run against the archive being shipped**, not the fixture. The webview
  harness is pointed at the actual `.cszip`, so a game that cannot be unpacked
  or played fails the build rather than shipping. Then the theme and register
  guards, then `cargo test`.
- **`BUILD.json`** beside the artefacts: title, author, version, scene count,
  platform, player version, and a short sha256 per file. A build you can
  identify six months later.
- **No `.cszip` association** in a standalone build. A single-game app has
  nothing to do with someone else's archive.
- **Exactly one game ships.** The staged `games/` folder is emptied first; a
  stray second archive would be imported on first run and the "standalone" app
  would open with two games in it.
- **The workspace is restored in a `finally`**, and on SIGINT/SIGTERM, because
  the compile takes minutes and Ctrl-C is likely.
- `--portable` assembles a tree with the executable, `games/`, `standalone.json`
  and the icons beside it, which is where Tauri resolves resources for an
  unpackaged binary. The executable is globbed rather than named, since Tauri
  derives the binary name from `productName`.

### Two bugs, both found by running it

**The archive can live in the folder being stashed.** `src-tauri/games/` is
where a bundled game already sits, so `--game src-tauri/games/x.cszip` is the
obvious first thing to type — and staging moves that whole directory aside,
pulling the source out from under the copy. It now reads the bytes before
touching anything. The first run failed exactly this way, and the `finally`
restored the tree correctly while doing so, which was the other thing worth
knowing.

**`--portable` alone still needs a compile.** Without any `--bundles` Tauri
builds every default installer; with `--no-bundle` it compiles and stops. The
flag is passed only when no installer was asked for.

### The mode in the interface

Standalone removes rather than replaces. No shelf, no file input, no drop
target, no back button; the palette and the menu bar *drop* those commands
rather than greying them out, because an inert menu item is a lie about what the
app can do. `set_library_menu_enabled` handles the native side. The sidebar's
back button becomes the author's name.

Boot order matters: nothing renders until the mode is known. A shelf that
flashes up for one frame in a single-game app is worse than a moment of nothing.

### Verified

- `npm run test:standalone` — **15 passed, 0 failed** (no shelf, no import
  affordance, the game opens itself, its title in the titlebar, no library route
  in the sidebar or the palette)
- `npm run test:webview` — **73 passed, 0 failed**
- `npm run test:game` — **68 passed, 0 failed** on Choice of Magics
- `cs:export` — staging, marker, config overlay and restore all verified by
  running it; the compile step is the only part that cannot run here, for want
  of cargo
- build, typecheck, theme-scope, register, stale, version, detector — pass

### Next

Run it on Windows for real: `npm run cs:export -- --game choice-of-magics.cszip
--out dist-apps/com --portable --nsis --icon`. Once that produces an installer
you are happy with, the GUI export button is a thin wrapper — the same
`app_mode` contract, driven from a Rust command instead of a shell.

---

## 2026-09-08 · Session 10b — v0.1.11, the direction your answers implied

"Sharp tool, Linear/Raycast-like" and "avoid Kindle beige" together are a bigger
change than they sound, because the chrome derives from the reading theme — and
the default reading theme was **paperback**, warm stock. The app's first
impression *was* the thing you said to avoid.

### PRODUCT.md

Written, with the register (product), users, personality and anti-references
from your two answers, and accessibility from the README. It records the tension
your answers create rather than smoothing it over: the reading surface is calm
and paper-like because prose demands it, the chrome is a machined instrument,
and the seam between them is the most important line in the design.

Two open questions are parked at the bottom of it, both from "dense, precise":
whether the shelf should default to a list rather than a poster grid, and
whether the palette should switch games given that switching restarts the
process.

### Sharp is geometry and density, not hue

The colour still belongs to whichever theme the reader picks — that was your
earlier instruction and it stands. So the direction lands in form:

- **Default theme is now nocturne.** Deep navy, low glare. Paperback is one
  click away for readers who want paper; the app just no longer opens wearing it.
- **Chrome corners capped at 3px**, independent of the reading surface. The
  softer themes run `--cs-radius` to 8px, which reads as upholstery in a
  toolbar.
- **Density**: control height 26px, macOS titlebar down from 52 to 48.
- **Every number in the chrome is tabular** — counts, scores, times, line
  numbers. Proportional digits make a column of counts wobble, which is exactly
  the imprecision this direction removes.
- **Selection is solid accent**, not a wash. A tool shows state; it does not
  suggest it.
- `.app-btn` gained the states it was missing: `:active` and `:disabled`.

### The command palette — ⌘K

The one feature that makes an app feel like Linear rather than just look like
it. Everything available right now, searchable, grouped, with its shortcut
printed on the row.

It runs the **same handler registry** the menu bar and the titlebar buttons use,
so a command cannot work in one place and not another. Radix underneath, so the
focus trap, Escape, scroll lock and `aria-modal` come along rather than being
reimplemented badly. Only the list behaviour is ours: arrows move a selection
independent of the pointer, hover syncs to it so pointer and keyboard never
disagree about what Enter would run, and the filter is plain substring matching
— fuzzy sounds clever and makes the ordering unpredictable.

Shortcut hints render in platform notation (`⌘⇧F` on macOS, `Ctrl+Shift+F`
elsewhere) from one `keyHint()` helper, and the titlebar shows `⌘K` on the
palette button, because a keyboard-first app that hides its bindings in a menu
nobody opens is a mouse app with accelerators.

### A real bug fell out of this

`src/lib/theme.ts` listed six themes: parchment, nocturne, terminal, **slate,
sepia, high-contrast**. The engine has paperback, terminal, nocturne,
manuscript, newsprint, ember. Three of my ids did not exist and a fourth was
misnamed — so picking Slate, Sepia or High contrast from the library page set a
class nothing styled, and the theme silently did not change. The list is now
copied from `engine/core/settings.js:13` with the engine's own hints, which the
settings chips now show. There is a harness assertion that the applied theme is
one the engine actually has.

### Verified

- `npm run test:webview` — **73 passed, 0 failed** (nine new: the palette has a
  visible control, opens as a labelled dialog, lists the available commands,
  pre-selects the first row, filters, and says so when nothing matches; plus
  chrome geometry is its own and the applied theme is a real one)
- `npm run test:game` — **68 passed, 0 failed** on Choice of Magics
- impeccable detector — **0 findings**
- build, typecheck, theme-scope, register, stale, version — all pass

### Still open

The two questions in PRODUCT.md. And `/impeccable critique` now has real project
context to read, so a proper heuristic review of the reading surface itself —
which this session did not touch — is the natural next pass.

---

## 2026-09-08 · Session 10 — v0.1.10, the design audit, with both skills loaded

Both skills loaded this time. `impeccable`'s setup script blocked immediately —
`NO_PRODUCT_MD` — and its init flow requires an interview before PRODUCT.md can
be written, so that file is not here; the questions are at the bottom of this
entry. DESIGN.md *is* here, because `document` derives it from code that exists
rather than from answers I do not have.

Register: **product**. Design serves the reading; it is not the product. The bar
is earned familiarity, not novelty.

### What the databases actually said

`ui-ux-pro-max --design-system` on the obvious query returned a *Newsletter /
Content First* landing pattern — a marketing answer to a product question, so I
discarded it per the skill's own "if results look off" instruction and queried
the domains directly. That was the useful pass:

- `--domain product "reading app library desktop tool"` → **Book & Reading
  Tracker**: primary style *Swiss Modernism 2.0 + Minimalism*, secondary *E-Ink
  Paper*, palette "warm paper white + ink brown + reading progress green".
- `--domain style` for those two gave the concrete specs: 8px base unit, strict
  grid, single accent, high contrast, minimal decoration (Swiss); paper
  background, high-contrast ink, serif for reading, no gradients (E-Ink).

That is a near-exact description of what `engine/theme/` already is, which
settles the identity question: the palette stays, and impeccable's own rule
agrees (committed brand colours found → identity preservation wins). So the
redesign is the **chrome** becoming Swiss where it was arbitrary, and the
reading surface staying E-Ink where it already was.

### Audit

Measured, not eyeballed. I computed WCAG ratios for every token pair across all
twelve theme variants from the token files, and ran impeccable's own detector
over `src/`.

| # | Dimension | Before | After | Key finding |
| --- | --- | --- | --- | --- |
| 1 | Accessibility | 2 | 4 | `--cs-ink-faint` used for 14px text; fails 4.5:1 in five of six themes |
| 2 | Performance | 3 | 4 | `transition: width` on the achievements meter — layout property, every frame |
| 3 | Responsive | 3 | 4 | fluid `clamp()` heading in product chrome; otherwise structural and sound |
| 4 | Theming | 3 | 4 | tokens everywhere, but no spacing/type/z scales — values invented per component |
| 5 | Anti-patterns | 2 | 4 | 3px left accent border on save rows; hover-lift on shelf cards |
| | **Total** | **13/20** | **20/20** | Acceptable → Excellent |

**Anti-patterns verdict, honestly:** two real tells before this pass. The `3px
border-left` on save rows is the single most recognisable signature of generated
UI, and it was ten competing stripes in a ten-save list. The shelf cards rose
2px with a shadow bloom on hover — decoration standing in for feedback. The
detector found both plus the layout animation; it now returns **0 findings**.

**P1 — contrast.** 10 of 70 token pairs fall below 4.5:1, every one of them
involving `--cs-ink-faint`, and it was carrying 14px text in eleven places
including the input placeholder (which needs the full 4.5:1, not a muted
default). All eleven are `ink-muted` now, which passes in all twelve variants.
`engine/` is generated so the token itself was not touched; it is simply no
longer used for text.

**P1 — no reduced-motion coverage in the chrome.** `index.css` had a block;
`chrome.css`, with every transition I have added over four sessions, had none.

**P2 — four arbitrary z-index values** (5, 20, 40, 60) plus a hard-coded `z-30`
in the Radix dialog, i.e. a stacking order maintained by memory.

**P2 — no scales.** Spacing and type were chosen per component: eleven distinct
paddings and nine font sizes, none of them derived from anything.

**Verified false positive:** the detector flagged `broken-image` at
`library.ts:157`. It was a comment saying `<img src>` — and a stale one, from
the IndexedDB era. Rewritten rather than suppressed.

### What changed

- **8px spacing unit** (`--app-1`…`--app-7`) and a **fixed 1.2 type scale**
  (`--app-text-xs` 11px … `--app-text-2xl` 24px). Fixed, not `clamp()`: a
  heading that shrinks inside a sidebar looks worse rather than better, and this
  is product UI at a consistent DPI. 11px is the floor — the platform label size
  on all three targets.
- **Named z-index ladder**, used by the chrome, the Radix dialog and the toaster.
- **Motion tokens**: ease-out quart, 120ms feedback / 180ms structure, and a
  `prefers-reduced-motion` block that collapses all of it.
- **Save rows** are hairline-separated rows: no stripe, hover and active on the
  surface, and the armed state inverts to accent rather than adding a border.
- **Shelf cards** lost the lift and the shadow; the border and surface carry
  hover and active, which is what every desktop list does.
- **The meter** scales on a transform instead of animating `width`.
- **Skeletons** replace "Reading your games…" and "Reading your saves…" —
  product register asks for skeletons that hold the layout, not spinners in the
  middle of content.
- **Skip link** to the story, which is now a `<main>` landmark. The sidebar,
  both panes and eight controls sit before the prose in tab order; the UX
  database flags exactly this.
- **Accessible names** on the shelf cards ("Play *title* by *author*") — the
  card is a button whose label was previously assembled from four spans.

### Verified

- Detector: **3 findings → 0**
- Contrast: every text-bearing pair ≥4.5:1 across all twelve variants
- `npm run build`, `typecheck`, `check-stale`, `test:version`, `test:theme`,
  `test:register` — pass
- `npm run test:webview` — **64 passed, 0 failed** (six new: the three scales
  are declared, the skip link exists, the story is a `main` landmark, and save
  rows are not accent-striped)
- `npm run test:game` — **53 passed, 0 failed** on Choice of Magics

### What I did not do, and what I need from you

`PRODUCT.md` is missing and I will not synthesize it from a task prompt — init
is explicit that the register, users, personality, anti-references and
accessibility needs get confirmed by you first, and three of those are not
discoverable from the repo. The README covers register, users and accessibility;
personality and anti-references it does not.

This also happens to be the gap that has actually cost us: the library has been
rejected twice and the icon once. That is taste, not effort, and one round of
questions fixes it better than a fourth attempt.

Two questions at the end of this session's message. Once they are answered I can
write PRODUCT.md, and `/impeccable critique` gets a real backlog to work from
instead of my guesses.

---

## 2026-09-08 · Session 9 — v0.1.9, from your screenshot and eleven notes

Pulled `daf32a7`. Your custom icon is untouched — I only removed three files the
last unzip left behind (`Sidebar.tsx`, `StatsPanel.tsx`, `appearance.ts`) and
added them to `check-stale.mjs` so the next unzip says so itself.

### The screenshot was one line of CSS

`.app-shell` is a three-column grid — sidebar, story, panel. With no game open
only `.app-main` exists, and grid put it in **column 1**, which is `auto` and
therefore sized to its content. That is the whole reason the titlebar stopped
at 930px with bare background to the right of it. Each pane now names its
column explicitly, so the width is right at every combination of panes.

### Fonts

Also one line, and the same kind of mistake. `.app-shell` carried
`font-family: var(--app-font-ui)` — and `.app-shell` wraps the reading pane, so
the platform's UI face cascaded straight over the engine's serif for the prose
itself. The stack now sits on the chrome surfaces only, and `.app-reading` asks
for `--cs-font-body` explicitly.

There was a second half to it: `applyTheme()` set a font-size on `<body>` and
never applied the typeface class at all. The engine does neither of those
things — the face is a `font-<id>` class on body (settings.js:80) with legacy
`sans`/`dyslexia` aliases some games check, and zoom is a percentage font-size
on `<html>` (settings.js:105). Setting body's font-size overrode the theme's own
body rule. It now uses exactly the engine's two mechanisms, and mirrors the
typeface back out of engine state alongside theme and zoom.

### The stats screen: found it

Not a routing problem after all, and worse than one.

`Pending.tsx` named its radios `group0` and its ids `opt-0-0`. Nothing in either
name said which channel it belonged to — and the story's choice is still mounted
in the reading pane behind the stats dialog, with those same ids. A
`<label htmlFor="opt-0-0">` resolves to the **first** match in the document. So
clicking an option on Sordwin's stats screen checked the *story's* first radio,
behind the dialog, exactly as you described. The shared radio `name` made the
two groups fight over selection on top of that.

Ids and names now carry the channel (`stats-opt-0-0`), and the digit shortcuts
only answer the topmost surface — one keypress used to select in both. Every
game with a `*choice` in its stats screen had this; Sordwin is just where it was
visible.

The fixture game's stats screen now has a `*choice` in it, so the harness holds
the line: five new assertions check the ids are scoped, the labels point into
the dialog, and answering the sheet leaves the story's selection alone.

### Why the window would not close

`onCloseRequested` cancelled the close, flushed the saves, then called
`destroy()` — and `core:window:allow-destroy` was **not in the capability set**,
so that call was rejected and nothing closed the window it had just stopped from
closing. Alt+F4 went the same way, for the same reason.

The permission is granted, and the handler now falls back: destroy, then close,
then a reload as a last resort. Cancelling a close and then failing to act on it
is the one outcome that traps someone in the app, so it cannot depend on a
single call succeeding.

### The panes

Both edges resize now — the achievements panel has the same grip as the sidebar,
220–520px, remembered separately. The grips themselves were a 6px invisible
strip; they are 9px of hit area with a 2px line that appears on hover, so the
target is comfortable while the seam stays thin. Same treatment for the
horizontal divider, which also grew a slide transition that is switched off
while dragging so the pane cannot lag behind the pointer.

Both sidebar panes scroll now. `.app-sidebar` was missing `min-height: 0` and
`overflow: hidden`, so the pane stack sized itself to its content and the
bodies never got a scrollbar. That is the fourth time this project has hit that
default; every scroller has both properties now.

**This game** was six labelled rows of small grey text, which is exactly as
uninformative as it sounds — nothing stood out, and the numbers a reader
actually glances at were the least visible thing in the panel. They are tiles
now: number first at size, label under it, reflowing from one column to two with
the sidebar's width, and the cover is a proper 3:4 poster rather than a
160px-capped image.

### The library, third attempt

The text ran together — "Sordwin: The Evertree SagaThom Baylay11 scenes" —
because the title and meta lines are `<span>`s inside the card's `<button>` and
I never gave them `display: block`. Fixed, with the spacing and weight
hierarchy that was hiding behind it.

Added the **recently played** rail on the left: the shelf grows but the handful
of games actually being read does not, and a grid gets slower to scan with every
archive. It lists the eight most recent with art and when they were last opened,
and disappears below 780px, where there is not room for both it and a readable
shelf. Opening a game stamps `lastPlayedAt` on its manifest.

Each card also gained an export action beside delete, both in a corner group
that appears on hover and never sits under the click that starts a game.

### Exporting a game with its data

New `.cszip` layout, and imports of ordinary published archives are unaffected:

```
scenes/*.txt                        the game as it ships
<assets>                            its images
choicescript-player/manifest.json   title, author, scene list, achievements
choicescript-player/store.json      saves, achievements, per-game settings
```

Another player ignores the folder and sees a plain game; this one reads it back.
The store is restored under the **new** import's id, so importing the same
export twice gives two independent copies rather than two games writing into one
save file.

It writes to the downloads folder and reports the path, rather than opening a
file dialog — that would mean another plugin and another permission for one
button.

### Focus mode, and the portable zip

Focus mode already hid the titlebar and menu bar as of 0.1.8; nothing new there
this session beyond the grip work. The README is no longer copied into the
portable zip.

### On /impeccable and /ui-ux-pro-max

I did not load either skill this session — the context was largely spent on the
five engine-level bugs above, and reading a design database I would then only
half-use seemed worse than doing the work directly. The design decisions here
are all argued in the code comments and above. Say the word and I will start the
next session with both skills loaded and go through the interface properly with
them.

### Verified

- `npm run build` — clean, 439 kB · CSS 47 kB
- `typecheck`, `check-stale`, `test:version`, `test:theme`, `test:register` — pass
- `npm run test:webview` — **58 passed, 0 failed**
- `npm run test:game` — **53 passed, 0 failed** on Choice of Magics (five
  stats-choice assertions skip: its stats screen has no `*choice`, and an
  assertion about a feature a game does not use must not fail that game)

`export_game`, the archive changes and the capability additions are uncompiled
here as always. If `export_game` fails to build it is one function and nothing
else depends on it.

---

## 2026-09-08 · Session 8 — v0.1.8, five items

### The icon is back

Reverted to the session-4 drawing, byte for byte. The "crisper" one traded the
gradient and the four-node figure for something heavier that read worse at every
size above 32px. Your call was right.

### The stats screen: no, it is not possible

You asked directly, so here is the direct answer, and it is no.

A stats screen is a ChoiceScript *scene*. It can hold `*stat_chart`, `*if`, and
in Sordwin a `*choice` the reader answers. The engine runs it by raising
`bus.statsMode`, and while that flag is up **every** block it emits routes to the
stats channel (`bus.js:74`). Answering a stats choice needs the flag up.
Advancing the story needs it down. One flag, two mutually exclusive
requirements — so a live sheet beside a usable story is not something this engine
can be asked for, whatever the interface looks like. My snapshot-and-close
version was working around that and losing; the sheet printing itself into the
prose was the same constraint showing through.

So the stats screen is a dialog again, and the side panel now holds
**achievements**, which have no such problem: `state.achievements` is derived
state rather than a rendered channel, so it updates live and never touches the
interpreter. Earned and locked lists, points, hidden count, and a progress meter
using the same `role="meter"` the stat bars use.

The scroll failure in the panel was the flexbox trap again — `.app-inspector`
and `.app-inspector-body` were missing `min-height: 0`, so the body refused to
shrink below its content and never scrolled. Third time I have hit that in this
project; it is fixed on every scroller now.

### The sidebar, split

Two panes with a draggable divider: **This game** on top, **Saves** underneath.
The ratio is remembered, the divider takes arrow keys as well as a pointer, and
either pane collapses to just its header — which is why the headers stay when
collapsed, since that is what you click to bring one back. Dragging the divider
un-collapses, because a drag is an instruction about sizes.

Saves in the sidebar: a name field and a Save button wired to `cs.save()`, then
the list — autosaves marked, with the time and line. **Loading takes two
clicks.** It discards everything since that save, and one stray click is not an
acceptable price for that in a story measured in hours. The list re-reads as the
story moves, so the rolling autosave appears in it as it is written.

### The library, again

Cover-led this time. A game is recognised by its art long before its title is
read, and the covers are the only thing on that screen the author made — so
they are 3:4 posters, `auto-fill` on a clamped minimum so the shelf reflows
continuously rather than at three chosen widths. Games without art get their
initial at the same size, so a mixed shelf still lines up.

The whole card starts the game; a Play button inside a clickable card was two
targets for one action. Delete moved to a corner overlay that appears on hover
and still needs two clicks. Under 430px the poster becomes a thumbnail beside
the text and the grid drops to one column. A filter field appears once there are
more than five games and not before.

### Focus mode

It now hides the titlebar as well as the panes — leaving it behind was half a
focus mode — and hides the native menu bar through a new Rust command, since the
bar belongs to the window and CSS cannot reach it. macOS needs no command there:
its system menu hides itself in fullscreen.

With the titlebar gone there has to be a way out that does not require knowing
about Escape, so there is a faint exit button in the corner that comes up to
full opacity on hover. Escape still works.

### Verified

- `npm run build` — clean, 434 kB
- `npm run typecheck`, `check-stale`, `test:version`, `test:theme`,
  `test:register` — all pass
- `npm run test:webview` — **50 passed, 0 failed**
- `npm run test:game` — **50 passed, 0 failed** on Choice of Magics

Eight new assertions: both sidebar sections present, the divider, saving offered
in the sidebar, collapsing keeping the header, achievements docking without a
dialog, the story surviving beside them, and stats opening as a dialog *and not*
as a panel — that last one is the regression guard for this session's main
finding.

`menu.rs` gained `set_menu_visible` and is still uncompiled here. If it fails,
the front end already tolerates its absence: focus mode would keep the menu bar
and lose nothing else.

---

## 2026-09-08 · Session 7 — v0.1.7, nineteen reported problems

Everything on the list is addressed. The root causes are more interesting than
the fixes in about half of them.

### The three that were one bug each

**Nothing scrolled when a passage overflowed.** `.app-reading` is a flex child,
and a flex child defaults to `min-height: auto` — it refuses to shrink below its
content, so the pane grew past the window instead of scrolling inside it. One
line (`min-height: 0`) on `.app-main` and `.app-reading`. This is the single
most common flexbox trap there is and I walked into it.

**Focus mode left half the window white.** It hid the panes but never made the
window bigger, so the reading column sat stranded in the middle of a
now-unpainted shell — the white was the transparent root I had introduced for
vibrancy. Focus mode now calls `setFullscreen(true)`, the measure widens to
84ch instead of staying at 66, and the transparency is gone entirely (see the
theme change below), so there is nothing unpainted left to show through.

**The rubber-band flash.** Overscrolling past either end exposed that same
transparent root as a white band. `overscroll-behavior: none` on `html`, `body`
and the reading pane refuses the gesture instead of trying to paint through it.

### The stats sheet in the middle of the page

This one was my design being wrong rather than a slip. The panel ran the stats
scene, copied the blocks out, and closed the overlay immediately to lower the
engine's stats flag. But `showStats()` sets `bus.statsMode`, every block routes
to the stats channel while it is up (bus.js:74), and **the scene is still
emitting when the close lands** — so the remainder arrived as story blocks and
the character sheet appeared in the prose.

The panel now leaves the overlay open and renders the live channel. Nothing
races the engine. The cost is honest and visible: the story cannot take input
while the sheet is open, for that same routing reason, so the reading pane is
marked inert and the choices dim. The harness asserts both halves.

### One theme, not two

You were right and I was overthinking it. The chrome tokens now *derive* from
the engine's theme — `--app-chrome` is `var(--cs-paper-raised)`, `--app-border`
is `var(--cs-rule)` — so picking a reading theme repaints the whole window. The
separate Window control is gone, and so is `appearance.ts`.

They had to move from `:root` into a `body` rule to do it, which is the same
trap `index.css` documents at length: the engine declares `--cs-*` on `<body>`,
custom properties only inherit downward, and at `:root` they would have resolved
to their fallbacks silently forever. `check-register.mjs` is rewritten to guard
that instead of the old separation.

The library page had no engine and therefore no theme at all, so `lib/theme.ts`
now holds the choice, applies it to `<body>` the way the engine does, and hands
it to the engine when a game opens. Settings on the library page offers exactly
theme and text size — restart, save and restore are not there, because there is
no game to act on.

### Stuck on "Unpacking bundled game…"

A good bug. StrictMode mounts, the import starts, the component unmounts (my
cleanup set `live = false`), and it remounts — the second mount saw a
module-level "already started" flag and skipped, while the first mount's
completion was discarded because `live` was false. The label was never cleared
and the library never refreshed. That is why it sat there through gameplay and
why your own import appeared to fix it.

The flag is now a promise: every mount awaits the same work and every one of
them sees the result. Clearing the busy label is no longer gated on the mount
being alive, because a label this component put on screen has to come off it.

### Keyboard

Two causes, both fixed. `CmdOrCtrl+Plus` and `CmdOrCtrl+,` are not parseable
accelerators, and **one bad string fails the whole menu**, taking every other
shortcut with it silently. Symbol keys are now written as key codes — `Equal`,
`Minus`, `Digit0`, `Backslash`, `Comma`.

And the shortcuts are handled a second time in the front end
(`lib/desktop/menu.ts`), dispatching into the same handler registry the menu
uses. A menu that fails to build, or a webview that swallows a combination,
no longer means a keyboard that does nothing. Keys are only swallowed when
something is actually listening, so `⌘S` on the library page does not silently
eat the keystroke.

Game-only items are disabled rather than left enabled and inert:
`set_game_menu_enabled` walks the menu by id and toggles them as the game opens
and closes.

### The library, and not switching games mid-story

The library is a page now: a reflowing shelf of cards with cover, author, scene
and achievement counts, when it was added, Play and a two-step Delete, an empty
state that explains itself, and the window-wide drop target. It themes with
everything else.

Once a game is open the sidebar becomes that game — cover, author, screens
read, achievements, points — with **Library** at the top to go back. The list of
other games is deliberately not there: the engine holds one game at a time and
cannot be re-pointed in place, so a list would have offered a choice that costs
a reload, one stray click from a reader's place in a ten-hour story.

### The rest

- **Sidebar resizes** by dragging its trailing edge, 180–460 px, remembered in
  localStorage, and nudgeable with the arrow keys because a mouse-only resize is
  not a resize for everyone. Width is written to the DOM rather than through
  React state, so a drag costs a style recalculation instead of a render.
- **Author under the title**, both lines ellipsised independently.
- **Sidebar text wraps.** An ellipsis in the middle of a title is worth nothing;
  two lines are worth two lines.
- **Autosaves, three deep, oldest evicted.** The engine keeps one restore point
  and the stats screen overwrites it constantly, so there was nothing to step
  back to. The app writes a real slot at each screen through `cs.save()` — so it
  appears in the saves list with proper metadata — then prunes its own slots to
  three. Pruning edits `save_list` directly because the API has no delete; that
  is safe here and nowhere else, since this app owns the store implementation
  and only touches slots it created.
- **The icon.** It was one 1024px drawing shrunk down, and the soft gradient
  plus thin strokes turned to mush small. Every size is now drawn at its own
  size, supersampled 8×, with heavier strokes and a simplified two-node figure
  at 48px and below. The `.ico` carries ten resolutions instead of seven.
- **Responsive.** Minimum window is 460×400 now rather than 720×520. The shelf
  is `auto-fill` with a minimum rather than hand-picked breakpoints; the measure
  and page padding are `clamp()`; below 860px the sidebar floats over the story
  instead of squeezing it; below 620px button labels drop and the icons stay.

### The close error

```
Failed to unregister class Chrome_WidgetWin_0. Error = 1411
```

Not ours, and not a failure. That is Chromium's own window-class teardown log
inside WebView2, printed on the way out after the window is already gone —
error 1411 is "class does not exist", i.e. it was already unregistered. It
appears in plain Electron and WebView2 apps too. Nothing in the app can suppress
it and nothing leaks because of it.

I did remove one thing that could have made shutdown genuinely messy: the save
flush on close called `window.destroy()` while the flush was still settling.
That path is unchanged in behaviour but no longer has vibrancy teardown racing
it, since the effects call is gone.

### Verified

- `npm run build` — clean, 429 kB
- `npm run typecheck` — clean
- `test:version`, `test:theme`, `test:register`, `check-stale` — pass
- `npm run test:webview` — **47 passed, 0 failed**
- `npm run test:game` — **47 passed, 0 failed** on Choice of Magics

Nine new assertions cover this session: the author line under the title, the
sidebar becoming the game panel, no game list while playing, the way back to the
shelf, the sheet docking without a duplicate dialog, the story going inert while
it is open and taking input again after, and the chrome deriving from the theme.

Still no Rust toolchain here, so `menu.rs` and the new
`set_game_menu_enabled` are uncompiled. If that command is the thing that
fails, it is one function and the front end already tolerates its absence.

---

## 2026-09-08 · Session 7b — The same request, and the trap in applying it

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
