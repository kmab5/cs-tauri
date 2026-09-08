# PRODUCT.md

## Register

**Product.** The design serves the reading; it is not the product. Correct any
line below — this was written from one interview round plus the repo, and it is
the file every other design decision gets checked against.

## What it is

A desktop player for ChoiceScript games — the engine behind Choice of Games'
interactive fiction. Games arrive as archives, are unpacked to plain files on
the reader's own machine, and are played offline. No account, no sync, no
network access at all: the content security policy forbids it.

## Who uses it

People who read interactive fiction on a computer, in sessions measured in
hours rather than minutes. Two things follow from that:

- **They are readers first.** Prose is the product; every pixel of interface is
  overhead that has to justify itself.
- **They keep a library.** Games accumulate, and saves matter — a bad ending
  eight hours in is a real loss, which is why the app autosaves three deep and
  why loading a save takes two clicks.

Secondary: ChoiceScript **authors** testing their own games, who need the
engine's real behaviour rather than a friendly approximation, and who care that
`*script`, `*text_image` and interactive stats screens work exactly as
published.

## Personality

**Sharp tool.** Dense, precise, keyboard-first. The reference points are Linear
and Raycast, not an e-reader: a command palette rather than a chrome bar of
buttons, real shortcuts printed where the actions are, tabular numbers, 3px
corners, hairlines, no soft shadows, no motion that is not feedback.

The tension this creates is deliberate and worth stating: the *reading surface*
is calm and paper-like, because prose demands it, while the *chrome around it*
is a machined instrument. Those are two registers in one window, and the seam
between them is the most important line in the design.

## Anti-references

- **Reading-app clichés.** No Kindle beige as the default face of the app, no
  faux page curls, no paper textures, no drop caps, no skeuomorphic shelves.
  The engine's warm themes exist for readers who want them; the app does not
  open in one. Nocturne is the default for exactly this reason.
- Web-app SaaS decoration: pill buttons, soft shadows, card grids as a default
  layout, gradient anything.
- Accent-striped list rows, hover lifts, and the other tells of generated UI.

## Strategic design principles

1. **The prose has the floor.** Chrome recedes; focus mode removes it entirely.
2. **The keyboard is the primary input.** Everything reachable by pointer is
   reachable by key, through one shared handler registry — palette, menu bar and
   toolbar cannot disagree.
3. **Nothing leaves the machine.** Files on disk, readable in a text editor,
   exportable with their saves.
4. **The engine's behaviour is the contract.** Where the interpreter constrains
   the interface — an interactive stats screen cannot run beside a live story —
   the interface changes, not the engine.
5. **Destructive things take two clicks.** Deleting removes files; loading
   discards hours.
6. **Accessibility is a floor, not a feature.** WCAG 2.1 AA, verified in the
   build rather than asserted.

## Accessibility needs

WCAG 2.1 AA throughout. Native form controls, `role="meter"` on stat bars,
44px touch targets under `(pointer: coarse)` and 26–28px under a cursor
(clearing WCAG 2.2's 24px minimum), visible focus rings, a skip link to the
story, and every text pair at 4.5:1 or better across all twelve theme variants.
The engine also offers a dyslexia-friendly face and four text sizes.

## Standalone builds

An author or a curator can ship one story as its own app: same player, shelf
removed, the game's name on the window and the installer. `npm run cs:export`
is the CLI; the GUI equivalent — an export button beside a game — is the next
step, and it will call the same code path.

This is why the library/standalone distinction is a runtime fact rather than a
build flag: one codebase, one binary, two modes, both tested.

## Open questions

- Is the shelf's poster grid right, or should the library default to a dense
  list with a grid toggle? "Dense, precise" argues for the list.
- Should the palette also switch games, given that switching restarts the
  process?
