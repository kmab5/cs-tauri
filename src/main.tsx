/* First, before React or the engine: installs the webview polyfills, the
   external-link handler and the file-backed save store. Inert on the web. */
import './lib/desktop';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Toaster } from './components/ui/toaster';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
);
