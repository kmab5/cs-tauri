# ChoiceScript — Vite Front End

React 18 · TypeScript · Vite 5 · **Tailwind CSS 4** · Radix UI · **Motion** ·
**Sonner**

A complete ChoiceScript player as a **static site**. No server, no database,
no API. Games, saves and settings live on the device; the engine runs in the
browser, as it always has.

## The design

Built against `PRODUCT.md`: a **split register**. The reading surface is
product register — it recedes so the author's prose is the only thing with
presence. The chrome is brand register — it carries the identity and is
allowed to be felt. The sharpest constraint is the anti-reference: *nothing
that removes the game feel*. Interactive fiction is a game, and an interface
that presents it as a document with buttons attached has failed.

What that produced:

- **A sticky title bar with named controls.** Stats, Saves, Achievements and
  Settings keep their labels — labels carry meaning that icons only gesture at.
  The bar stays put, because in a 3–10 hour game you should never scroll back
  to find the stats button. Its separating hairline appears only once you have
  scrolled, so the bar is weightless at the top of a screen and grounded once
  there is text behind it.
- **The title recedes.** It is set in small UI type in muted ink, because it is
  the author's, not a product banner.
- **The choice is the moment the game happens**, so it gets the most attention:
  a rail that fills on intent, spring physics on press, and a numeral naming
  the keyboard shortcut the engine already assigns. It stays
  select-then-confirm — a mis-tap that silently branches the story is far worse
  than one extra tap.
- **Achievements are announced.** `*achieve` fires 330 times across the sample
  corpus and previously surfaced nowhere. Unacknowledged unlocks were the
  clearest case of "removes the game feel" in the build.
- **Stat bars grow to their value**, so the number is legible as motion before
  you read it.
- **Dialogs settle rather than slide.** A short travel with a long ease-out
  reads as a panel arriving and coming to rest, which is calmer than a drawer
  being pulled up from the edge of the screen.

## Why these libraries

Each earns its place against the brief rather than being modern for its own
sake:

| Library | What it buys |
|---|---|
| **Tailwind v4** | CSS-first `@theme`, so the palette maps directly onto the engine's CSS variables with no config file and no second source of truth |
| **Motion** | spring physics on the choice press — the tactile part of "tactile game HUD" |
| **Sonner** | achievement toasts, styled from the engine tokens so they re-theme too |
| *(none)* | archive reading and storage use native `DecompressionStream` and IndexedDB |

## Run it

No server. None.

```
npm install
npm run dev            # http://localhost:5173
```

`npm run build` produces a `dist/` folder of static files. That is the whole
application: the front end, the ChoiceScript engine, and the theme stylesheet.

## Updating an existing checkout

Unzipping over an old copy leaves behind files that no longer exist upstream.
`package.json` gets replaced, the orphan does not, and the build fails on an
import for a dependency that is no longer installed.

Either replace the directory outright, or delete the known orphans:

```
rm -f src/components/ui/sheet.tsx src/features/Hud.tsx src/lib/api.ts \
      tailwind.config.js postcss.config.js e2e-test.js
```

`npm run build` checks for these first and tells you exactly what to remove.

## Deploy it

Anywhere that serves static files. All of these are free:

| Host | Notes |
|---|---|
| **Cloudflare Pages** | unlimited bandwidth, no cold starts, global edge — the pick |
| **Netlify** / **Vercel** | 100 GB/month free, nicer preview deploys. Vercel detects Vite automatically — no `vercel.json` needed; output is `dist`. |
| **GitHub Pages** | fine for a public repo; `base: './'` is already set for project sites |

**Render is the wrong shape.** Its free web service sleeps after 15 minutes and
takes ~50 s to wake. Its static tier works, but you would be choosing it over
better static hosts for no reason.

There is no database to provision, no environment variable to set, no cold
start, and no egress bill.

## Where everything lives

| Concern | Where |
|---|---|
| Game archives | unpacked in the browser, `DecompressionStream` — no library |
| Scenes and assets | **IndexedDB** on the device |
| Saves and settings | localStorage, namespaced per game |
| Interpretation | the browser, as it always was |
| Server | a static file host |

### Why the engine cannot run on a server

It is worth being explicit, because the opposite arrangement seems obvious.
Published games run `*script` blocks containing arbitrary JavaScript that
manipulates the live DOM — Choice of Magic builds its stat bars with
`document.getElementById('text').appendChild(...)`. An interpreter in Node has
no DOM to reach into, so every game doing that would break.

Interpretation has always been client-side. Once games and saves are also
client-side, nothing is left for a backend to do.

### How the engine reads scenes with no network

`scene.js` consults a global `allScenes` before any fetch — the same mechanism
compiled single-file games use. `openGame()` fills it by running
`new Scene().loadLines(text)` over each stored scene, exactly as `compile.js`
does, because that is what populates `labels` for `*goto`.

Assets are Blobs, served to `<img>` through `URL.createObjectURL`.

## Trade-offs, accepted deliberately

- **Safari evicts IndexedDB after seven days** without interaction, unless the
  site is installed to the home screen. Chrome and Firefox do not. The app calls
  `navigator.storage.persist()` on import, which is what makes an installed PWA
  exempt.
- **Games are per-device.** No sync, no shared library across phone and laptop.
  That is inherent to client-side storage.

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

## The typed contract

`src/lib/choicescript.ts` is the whole backend contract as TypeScript: block
kinds, pending kinds, state, and every method. Type-checking against it is how
you know you are using the documented API rather than reaching into the engine.

It earns its keep — `tsc` caught a real bug during development, where
`useEffect(refresh)` returned the chainable API and React would have treated it
as a cleanup function.

## Structure

```
src/
  lib/choicescript.ts   the contract, as types
  lib/api.ts            backend client: upload, list, assets, engine bundle
  lib/utils.ts          cn() helper
  components/ui/        Button, Sheet (vaul), Dialog, Input, Progress, Card, Toaster
  features/
    Library.tsx         upload + game list
    Player.tsx          subscribes to the engine, renders state
    Blocks.tsx          block rendering, incl. the mandatory legacyNode mount
    Pending.tsx         choices, page breaks, text input
    Overlays.tsx        stats, saves, settings, achievements, menu
    Hud.tsx             the floating thumb-zone control bar
    useAchievementToasts.ts   announces unlocks as they happen
```

## The five obligations

Every front end must do these. See `API.md` in the backend package.

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
   authored `*script` appends are intercepted before the engine writes. This
   app renders into `.cs-text`.
5. **Answer `state.pending` with the matching verb** — `cs.chooseGroups`,
   `cs.next`, `cs.submitInput` — not a callback from state.

## Accessibility

WCAG 2.1 AA: choices are native radios in a labelled group, stat bars are
`role="meter"` with `aria-valuenow`, every control clears 44×44 px via
`min-h-touch`, focus is visible, dialogs come from Radix (focus trap, Escape,
`aria-modal`), and `prefers-reduced-motion` is respected.

## Testing

Everything runs on Windows, macOS and Linux — no shell, no `zip` binary, no
`/tmp`. The e2e harness builds its archive in JavaScript and ships a small
sample game, so it needs no arguments and no external game to run.

```
npm run typecheck
node ../vite-e2e-test.js                                  # sample game
node ../vite-e2e-test.js /path/to/game/mygame             # any game
```

The e2e harness serves the built app from the backend, uploads a game archive,
and plays it.
