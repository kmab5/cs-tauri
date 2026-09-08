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
}

/** The engine's six. It exposes the same list at runtime via cs.themes(). */
export const THEMES: ThemeChoice[] = [
  { id: 'parchment', label: 'Parchment' },
  { id: 'nocturne', label: 'Nocturne' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'slate', label: 'Slate' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'high-contrast', label: 'High contrast' },
];

const THEME_KEY = 'cs-app-theme';
const ZOOM_KEY = 'cs-app-zoom';
const FACE_KEY = 'cs-app-face';

export function getFace(): string {
  return localStorage.getItem(FACE_KEY) || 'serif';
}

export function setFace(id: string) {
  localStorage.setItem(FACE_KEY, id);
}

export function getTheme(): string {
  return localStorage.getItem(THEME_KEY) || THEMES[0].id;
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
}
