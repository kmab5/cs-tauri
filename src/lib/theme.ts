/**
 * Theme and text size, before there is an engine.
 *
 * The engine owns these once a game is running, and persists them in its own
 * per-game store. But the library page has no engine, so it had no way to
 * theme itself — and a reader who set a theme in one game found the shelf still
 * in the default palette.
 *
 * So the preference is kept here, applied directly to <body> the same way the
 * engine applies it, and handed to the engine when a game starts. One value,
 * two appliers, no second source of truth.
 */
export interface ThemeChoice {
  id: string;
  label: string;
  hint?: string;
}

/**
 * The engine's six, copied from `engine/core/settings.js:13` — ids and hints
 * both. Three of the ids in the previous version of this list (slate, sepia,
 * high-contrast) did not exist in the engine at all, so picking them from the
 * library page set a class nothing styled and the theme silently did not
 * change. The engine exposes the same list at runtime through `cs.themes()`,
 * which is what the in-game settings dialog uses; this copy exists only for the
 * library page, where there is no engine yet.
 */
export const THEMES: ThemeChoice[] = [
  { id: 'paperback', label: 'Paperback', hint: 'Warm stock, ink indigo' },
  { id: 'terminal', label: 'Terminal', hint: 'Phosphor green on black' },
  { id: 'nocturne', label: 'Nocturne', hint: 'Deep navy, low glare' },
  { id: 'manuscript', label: 'Manuscript', hint: 'High-contrast parchment' },
  { id: 'newsprint', label: 'Newsprint', hint: 'Flat grey, plain white' },
  { id: 'ember', label: 'Ember', hint: 'Dark slate, warm amber' },
];

/**
 * The weight range each packaged face can actually take.
 *
 * Eight of the bundled families are variable fonts, so their whole range is
 * one file and a slider is honest. Lato, Kanit, Sanchez and OpenDyslexic ship
 * statics, so they get the two weights that exist rather than a slider that
 * quietly synthesises everything in between.
 */
export const FACE_WEIGHTS: Record<string, { min: number; max: number; step: number }> = {
  serif: { min: 300, max: 900, step: 25 },
  sans: { min: 300, max: 800, step: 25 },
  humanist: { min: 400, max: 700, step: 300 },
  slab: { min: 400, max: 700, step: 300 },
  mono: { min: 300, max: 800, step: 25 },
  dyslexia: { min: 400, max: 700, step: 300 },
};

const THEME_KEY = 'cs-app-theme';
const WEIGHT_KEY = 'cs-app-weight';
const ZOOM_KEY = 'cs-app-zoom';
const FACE_KEY = 'cs-app-face';

export function getFace(): string {
  return localStorage.getItem(FACE_KEY) || 'serif';
}

export function setFace(id: string) {
  localStorage.setItem(FACE_KEY, id);
}

/** Per-face, because 500 in Fraunces is not 500 in JetBrains Mono. */
export function getWeight(face = getFace()): number {
  const stored = Number(localStorage.getItem(`${WEIGHT_KEY}-${face}`));
  const range = FACE_WEIGHTS[face];
  if (!range) return 400;
  return Number.isFinite(stored) && stored >= range.min && stored <= range.max ? stored : 400;
}

export function setWeight(value: number, face = getFace()) {
  localStorage.setItem(`${WEIGHT_KEY}-${face}`, String(value));
}

/**
 * Nocturne by default, not the warm stock.
 *
 * The chrome derives from the reading theme, so the default theme is also the
 * app's first impression — and a warm paper default made the whole window read
 * as a beige e-reader, which is the one thing this is meant not to look like.
 * Nocturne is dark, low-glare and neutral; every other theme is one click away
 * for readers who want the paper.
 */
export function getTheme(): string {
  return localStorage.getItem(THEME_KEY) || 'nocturne';
}

export function setTheme(id: string) {
  localStorage.setItem(THEME_KEY, id);
}

export function getZoom(): number {
  const stored = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 1;
}

export function setZoom(value: number) {
  localStorage.setItem(ZOOM_KEY, String(value));
}

/**
 * Applies the stored choice to the document.
 *
 * The engine names its theme classes `theme-<id>` on <body> and its zoom as a
 * font-size multiplier, so matching that exactly means the two cannot disagree
 * about what "nocturne" looks like.
 */
/**
 * Applies the stored choice to the document, by exactly the mechanisms the
 * engine uses.
 *
 * That matters more than it sounds. The typeface is a `font-<id>` class on
 * <body> (settings.js:80) with legacy `sans`/`dyslexia` aliases some games
 * check, and the zoom is a percentage font-size on <html> (settings.js:105) —
 * *not* a font-size on body, which is what an earlier version of this function
 * set. Setting body's font-size directly overrode the theme's own body rule and
 * took the reading face down with it, which is why the prose came out in the
 * platform's UI font.
 */
export function applyTheme() {
  const body = document.body;

  for (const cls of [...body.classList]) {
    if (cls.startsWith('theme-') || cls.startsWith('font-')) body.classList.remove(cls);
  }
  body.classList.remove('sans', 'dyslexia');
  body.classList.add(`theme-${getTheme()}`);

  const face = getFace();
  if (face && face !== 'serif') body.classList.add(`font-${face}`);
  if (face === 'sans' || face === 'dyslexia') body.classList.add(face);

  document.documentElement.style.fontSize = `${getZoom() * 100}%`;

  /*
   * The weight goes on a variable the reading surface reads, not on body's
   * font-weight directly: headings and bold spans have their own weights and
   * should shift with the setting rather than be flattened by it.
   */
  body.style.setProperty('--cs-weight-body', String(getWeight(face)));
}
