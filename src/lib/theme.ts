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
export function applyTheme() {
  const id = getTheme();
  const body = document.body;
  for (const cls of [...body.classList]) {
    if (cls.startsWith('theme-')) body.classList.remove(cls);
  }
  body.classList.add(`theme-${id}`);
  body.style.setProperty('--cs-zoom', String(getZoom()));
  body.style.fontSize = `calc(var(--cs-size-body, 1.125rem) * ${getZoom()})`;
}
