/**
 * The window's title bar, as opposed to the page's.
 *
 * `document.title` names the *document*; the native window keeps whatever
 * `productName` the bundle was built with. So the library build sat there
 * saying "ChoiceScript Player" with Sordwin open in it, and an exported story
 * showed its product name rather than its own title on the taskbar and in the
 * window switcher.
 *
 * Both are set together, because both are visible in different places: the
 * document title is what a screen reader announces, the window title is what
 * Alt-Tab shows.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';

export const APP_NAME = 'ChoiceScript Player';

export function setWindowTitle(title?: string) {
  const text = title?.trim() || APP_NAME;
  document.title = text;
  void getCurrentWindow()
    .setTitle(text)
    .catch(() => {
      /* Without the window:set-title permission the document title still
         changes; nothing else depends on this succeeding. */
    });
}
