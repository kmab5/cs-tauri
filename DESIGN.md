# DESIGN.md

The visual system of ChoiceScript Player, as built. Written from the code, not
ahead of it — every value here is in `src/styles/chrome.css`, `src/index.css` or
`engine/theme/`, and `npm test` fails if the two disagree.

**Register: product.** The design serves the reading, it is not the product. The
bar is earned familiarity: a reader fluent in desktop apps should sit down and
trust it, and the tool should disappear into the story.

## The two surfaces

| | Reading surface | Chrome |
| --- | --- | --- |
| Tokens | `--cs-*` | `--app-*` |
| Owned by | the engine (`engine/theme/`) | `src/styles/chrome.css` |
| Follows | the reader's chosen theme, all six | the same theme, derived |
| Style lane | E-Ink / Paper | Swiss Modernism 2.0 |
| Face | the theme's serif | platform UI sans |

`--app-*` derives from `--cs-*` — `--app-chrome` is `var(--cs-paper-raised)`,
`--app-border` is `var(--cs-rule)` — so one theme paints the whole window. That
derivation is why the chrome tokens are declared inside a `body` rule: the
engine declares `--cs-*` on `<body>` and custom properties only inherit
downward. At `:root` they would resolve to their fallbacks, silently, forever.
`npm run test:register` enforces it.

## Colour

Restrained, per the product register. The accent carries primary actions,
current selection and state — never decoration.

Six themes ship: parchment, manuscript, newsprint, ember, nocturne, terminal,
each with a light/dark counterpart via the engine's `nightmode` / `whitemode`
classes. Semantic roles only; no component holds a raw hex.

| Role | Token | Chrome alias |
| --- | --- | --- |
| Page | `--cs-paper` | `--app-chrome-elev` |
| Panel | `--cs-paper-raised` | `--app-chrome` |
| Sunken | derived | `--app-chrome-sunken` |
| Body text | `--cs-ink` | `--app-label` |
| Secondary text | `--cs-ink-muted` | `--app-label-dim` |
| Hairline | `--cs-rule` | `--app-border` |
| Accent | `--cs-accent` | `--app-accent` |
| On accent | `--cs-accent-ink` | `--app-accent-fg` |

**Contrast.** Every pair that carries text at 14px or below clears 4.5:1 in all
twelve theme variants; verified by computing the ratios from the token files
rather than by eye. `--cs-ink-faint` clears it in only seven of twelve, so it is
not used for text — it was, in eleven places, and those are now `ink-muted`.

## Typography

One family per surface, no display/body pairing. Prose keeps the theme's serif
(`--cs-font-body`); the chrome takes the platform's UI face — SF Pro Text on
macOS, Segoe UI Variable on Windows, Inter/Cantarell on Linux — because that is
what makes a window look like it belongs to the desktop it runs on.

Fixed rem scale, ~1.2 ratio. Not `clamp()`: a heading that shrinks inside a
sidebar looks worse, not better, and readers sit at a consistent DPI.

| Token | Size | Used for |
| --- | --- | --- |
| `--app-text-xs` | 11px | uppercase section labels, tile captions |
| `--app-text-sm` | 12px | metadata, timestamps |
| `--app-text-md` | 13px | controls, body of the chrome |
| `--app-text-lg` | 15px | panel titles |
| `--app-text-xl` | 19px | — |
| `--app-text-2xl` | 24px | the library heading |

11px is the floor. It is the platform label size on all three targets; below
that nothing is legible at arm's length.

Prose measure is capped at `--cs-measure` (66ch), widening to 84ch in focus
mode. The reader also has a dyslexia-friendly face and four text sizes through
the engine's own settings.

## Spacing

One 8px unit, mathematically: `--app-1` 4px through `--app-7` 48px. Rhythm comes
from varying which step is used, not from inventing values between them.

## Layout

A three-column grid — sidebar, story, panel — each pane naming its own column
so the width is correct at every combination of panes. Flex inside each column,
grid across them; every flex chain that scrolls carries `min-height: 0`, which
is the default that has bitten this project four times.

Responsive behaviour is structural rather than fluid: below 1100px the
achievements panel is a dialog instead of a pane, below 860px the sidebar floats
over the story, below 780px the recently-played rail goes, below 620px control
labels drop and their icons stay, below 430px the shelf is one column and the
posters become thumbnails. The shelf itself is `auto-fill` on a clamped minimum,
so it reflows continuously between those points.

Minimum window: 460×400.

## Components

Every interactive element carries default, hover, active, focus-visible,
disabled and selected. One button shape (`.app-btn`), one input shape
(`.app-input`), one row shape (`.app-save`, `.lib-recent`), one card shape
(`.lib-card`). Cards are used once — the shelf, where the cover *is* the
content — and never nested.

- **Loading** is skeletons that hold the layout, not spinners in the middle of
  content.
- **Empty states** teach the interface: the empty shelf says what a
  ChoiceScript archive is and offers the file picker.
- **Destructive actions** take two clicks rather than a confirm dialog. Delete
  removes files; loading a save discards hours.
- **Modals** are a last resort. The stats screen is one, and only because the
  engine cannot run an interactive stats scene beside a live story.

## Motion

Ease-out quart (`--app-ease`), 120ms for feedback and 180ms for structure. No
bounce, no elastic: overshoot in a panel divider reads as a bug.

Motion conveys state and nothing else. There is no page-load choreography, no
scroll-reveal, and no hover lift on the shelf cards — a card that rises on hover
is decoration standing in for feedback.

Nothing animates a layout property. The achievements meter scales on a
transform; the pane divider animates `flex-grow` and switches that off entirely
while dragging, so the pane cannot lag a frame behind the pointer.

`prefers-reduced-motion: reduce` collapses every transition in both the reading
surface and the chrome to ~0ms and stops the skeleton pulse.

## Z-index

A named ladder, no arbitrary values: `--z-base` 1, `--z-sticky` 10, `--z-grip`
20, `--z-scrim` 30, `--z-modal` 40, `--z-toast` 50, `--z-tooltip` 60. The Radix
dialog and the toaster read from the same tokens.

## Accessibility

Target WCAG 2.1 AA.

- Choices are native radios in a labelled group, with ids and radio names
  scoped per channel so the story's and the stats screen's cannot collide.
- Stat bars and the achievements meter are `role="meter"` with `aria-valuenow`.
- Touch targets are 44px under `(pointer: coarse)` and 28px under a cursor,
  which clears WCAG 2.2's 24px minimum for pointer input.
- Focus is always visible: a 2px accent ring, never removed.
- A skip link jumps past the shelf, the panes and the toolbar to the story,
  which is a `<main>` landmark.
- Dialogs come from Radix: focus trap, Escape, `aria-modal`.
- No icon-only control without an `aria-label`; no emoji used as an icon.

## Guards

`npm test` runs, in order: the build, version agreement, `check-theme-scope`
(tokens resolve against the live theme), `check-register` (chrome tokens stay in
body scope), the webview harness (64 assertions), and `cargo test`.
