/**
 * Taking the browser out of the webview.
 *
 * WebView2 and WKWebView ship a browser's keyboard, and most of it is nonsense
 * in an app: Ctrl+J opened a downloads panel, Ctrl+P offered to print the story,
 * Ctrl+F opened a find bar that cannot see past the current screen, Ctrl+R
 * reloaded and lost the reader's place. None of those are features here, and
 * several of them look like bugs.
 *
 * Every combination below is swallowed before the engine sees it. The ones with
 * a real equivalent are redirected to it rather than simply blocked — Ctrl+F is
 * the palette, because that is what searching means in this app, and Ctrl+P is
 * nothing because a ChoiceScript game is not a document.
 *
 * Devtools stay reachable in a development build and are blocked in a release
 * one: `import.meta.env.DEV` is a compile-time constant, so the release bundle
 * does not contain the exception.
 */
const BLOCKED = new Set([
  'mod+j', // downloads
  'mod+p', // print
  'mod+f', // find bar
  'mod+g', // find again
  'mod+shift+g',
  'mod+u', // view source
  'mod+h', // history
  'mod+d', // bookmark
  'mod+e', // search
  'mod+n', // new window
  'mod+shift+n',
  'mod+t', // new tab
  'mod+r', // reload — the one that silently loses a reader's place
  'mod+shift+p',
  'mod+shift+o',
  'mod+shift+b',
]);

/*
 * Deliberately *not* blocked, because the app claims them itself and this
 * handler runs first: ⌘⇧D (trace console), ⌘⇧R (restart the game), ⌘⇧T,
 * ⌘⇧A (achievements), ⌘⇧L (library), ⌘W (the window's own Close, which the
 * native menu owns on macOS). Blocking a combination the app uses is worse
 * than leaving a browser one in place — it breaks a documented shortcut
 * silently, which is exactly the class of bug this file is here to fix.
 */

/** Function keys a browser claims that an app has no use for. */
const BLOCKED_KEYS = new Set(['F3', 'F5', 'F6', 'F7', 'F11']);

const DEV_ONLY = new Set(['f12', 'mod+shift+i', 'mod+shift+j', 'mod+shift+c']);

function combo(e: KeyboardEvent): string {
  const mod = e.ctrlKey || e.metaKey ? 'mod+' : '';
  const shift = e.shiftKey ? 'shift+' : '';
  const alt = e.altKey ? 'alt+' : '';
  return `${mod}${alt}${shift}${e.key.toLowerCase()}`;
}

export function installBrowserKeyBlocker(onFind?: () => void) {
  document.addEventListener(
    'keydown',
    (e) => {
      const key = combo(e);

      if (DEV_ONLY.has(key)) {
        /* Devtools: allowed while developing, gone from a release build. */
        if (!import.meta.env.DEV) e.preventDefault();
        return;
      }

      /* Ctrl+F means "find" to everyone; in this app the thing you are looking
         for is a command or a game, so it opens the palette. */
      if (key === 'mod+f' && onFind) {
        e.preventDefault();
        onFind();
        return;
      }

      if (BLOCKED.has(key) || BLOCKED_KEYS.has(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    /* Capture, so it lands before the engine's own handlers and before the
       webview's defaults. */
    true,
  );

  /* A browser's other reflexes: dragging a file onto the window used to have
     the webview navigate to it, and the middle-click autoscroll cursor has no
     meaning here either. */
  for (const type of ['dragover', 'drop'] as const) {
    window.addEventListener(
      type,
      (e) => {
        /* The library's own drop target calls preventDefault itself; this is
           the fallback for everywhere else, where a drop would navigate. */
        if (!e.defaultPrevented) e.preventDefault();
      },
      false,
    );
  }
}
