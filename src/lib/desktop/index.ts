/**
 * The platform layer.
 *
 * Imported once, first, from `main.tsx`: installs the webview polyfills, the
 * external-link handler and the file-backed save store, applies the stored
 * theme, and marks the document with the platform so CSS can branch on it.
 */
import { installPolyfills } from './polyfills';
import { installLinkHandler } from './links';
import { installFileStore } from './store';
import { applyTheme } from '../theme';

export type Platform = 'macos' | 'windows' | 'linux';

/**
 * Whether the Tauri IPC bridge is present.
 *
 * The app is a desktop application and everything below assumes the bridge is
 * there. This exists for exactly one reason: `npm run dev` serves the same
 * bundle over http, so opening that URL in an ordinary browser would otherwise
 * fail deep inside an invoke with nothing to explain why. `main.tsx` checks it
 * once and says so plainly.
 */
export const hasTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let cached: Platform | null = null;

/**
 * Derived from the user agent rather than `@tauri-apps/plugin-os`, which would
 * be another plugin, another permission and an async call, all to answer a
 * question that only decides which font stack and titlebar inset to use.
 */
export function platform(): Platform {
  if (cached) return cached;
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(ua)) cached = 'macos';
  else if (/Windows/.test(ua)) cached = 'windows';
  else cached = 'linux';
  return cached;
}

if (hasTauri()) {
  installPolyfills();
  installLinkHandler();
  installFileStore();
  /* Before React paints: the library page has no engine to theme it, so the
     stored choice is applied to <body> here. */
  applyTheme();
}

if (typeof document !== 'undefined') {
  document.documentElement.dataset.platform = platform();
}
