/**
 * Everything that is true only when the app is running inside Tauri.
 *
 * Imported once, first, from `main.tsx`. On the web every export here is inert,
 * so the static build is unaffected: `isDesktop()` is false and nothing is
 * installed.
 */
import { installPolyfills } from './polyfills';
import { installLinkHandler } from './links';
import { installFileStore } from './store';

export type Platform = 'macos' | 'windows' | 'linux' | 'web';

/**
 * Tauri injects `__TAURI_INTERNALS__` before any application script runs, so
 * this is safe to call at module scope. The older `__TAURI__` global is only
 * present when `withGlobalTauri` is set, which we do not use.
 */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let cached: Platform | null = null;

/**
 * Derived from the user agent rather than `@tauri-apps/plugin-os`, which would
 * be another plugin, another permission and an async call, all to answer a
 * question that only decides which font stack and titlebar inset to use.
 */
export function platform(): Platform {
  if (cached) return cached;
  if (!isDesktop()) return (cached = 'web');
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(ua)) cached = 'macos';
  else if (/Windows/.test(ua)) cached = 'windows';
  else cached = 'linux';
  return cached;
}

/**
 * `data-shell` and `data-platform` on <html> let CSS branch without a runtime
 * check in every component, and let the chrome register key its titlebar inset
 * and font stack off one attribute.
 */
function markDocument() {
  const root = document.documentElement;
  root.dataset.shell = isDesktop() ? 'desktop' : 'web';
  root.dataset.platform = platform();
}

if (isDesktop()) {
  installPolyfills();
  installLinkHandler();
  installFileStore();
  markDocument();
} else if (typeof document !== 'undefined') {
  markDocument();
}
