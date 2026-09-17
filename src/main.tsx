/* First, before React or the engine: installs the webview polyfills, the
   external-link handler, the file-backed save store and the chrome
   appearance. */
import './lib/desktop';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Toaster } from './components/ui/toaster';
import { ContextMenuProvider } from './features/menu/ContextMenu';
import { hasTauri } from './lib/desktop';
import './index.css';

const root = createRoot(document.getElementById('root')!);

/*
 * `npm run dev` serves this bundle over http so Tauri can load it, which means
 * the same URL opens in an ordinary browser — where there is no IPC bridge and
 * nothing works. Saying so here beats failing inside an invoke with no
 * explanation.
 */
if (!hasTauri()) {
  root.render(
    <div className="app-measure py-10 font-ui">
      <h1 className="m-0 text-lg font-medium">Open this in the desktop app</h1>
      <p className="mt-2 text-sm text-ink-muted">
        This is the window contents of the ChoiceScript desktop app, not a website. It needs the
        app&rsquo;s IPC bridge to reach your games on disk. Run <code>npm run tauri:dev</code>{' '}
        instead of visiting this URL.
      </p>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <ContextMenuProvider>
        <App />
        <Toaster />
      </ContextMenuProvider>
    </StrictMode>,
  );
}
