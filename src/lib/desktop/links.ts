/**
 * External links open in the player's own browser.
 *
 * A `*link` in a game is an ordinary anchor. Left alone in a webview it
 * navigates the window away from the application, and there is no back button
 * to return with — the game, and any unsaved progress, is gone. The engine
 * expands bbcode links into the block HTML we render, so this has to be caught
 * at the document level rather than in a component.
 */
import { openUrl } from '@tauri-apps/plugin-opener';

function externalHref(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a');
  const href = anchor?.getAttribute('href');
  if (!anchor || !href) return null;
  if (href.startsWith('#') || href.startsWith('javascript:')) return null;
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.origin === window.location.origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function installLinkHandler() {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const href = externalHref(event.target);
      if (!href) return;
      event.preventDefault();
      void openUrl(href).catch(() => {
        /* nothing useful to tell the player; the click simply does nothing */
      });
    },
    true,
  );
}
