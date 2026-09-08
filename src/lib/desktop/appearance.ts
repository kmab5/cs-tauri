/**
 * Chrome appearance, following the operating system.
 *
 * Deliberately separate from the reading theme. A player who reads in sepia
 * has said something about prose, not about window frames, and a sidebar that
 * turns sepia with them stops looking like part of the desktop.
 *
 * Auto is the default. The override is kept in localStorage rather than the
 * engine's store because it belongs to the application, not to any one game.
 */
export type Appearance = 'light' | 'dark' | 'auto';

const KEY = 'cs-app-appearance';

function query(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
}

export function getAppearance(): Appearance {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'auto';
}

function apply() {
  const preference = getAppearance();
  const dark = preference === 'auto' ? (query()?.matches ?? false) : preference === 'dark';
  document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
}

export function setAppearance(preference: Appearance) {
  if (preference === 'auto') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, preference);
  apply();
}

export function installAppearance() {
  apply();
  /* Both sources: the media query is what the webview knows, and it is the one
     that fires on a live OS appearance change. */
  query()?.addEventListener('change', apply);
}
