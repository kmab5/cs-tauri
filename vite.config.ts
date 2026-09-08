import { defineConfig } from 'vite';
// v6, not v4. The pinned v4 declares no peer range for Vite 8, so a clean
// `npm install` fails on it outright; v6 is oxc-based, which also removes the
// two deprecation warnings the Babel plugin printed on every dev start.
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Tailwind v4 is a Vite plugin now: no postcss.config, no tailwind.config.
  plugins: [react(), tailwindcss()],
  // import.meta.url rather than __dirname: Vite's native config loader does not
  // provide CommonJS globals, and warns that it will stop working.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },

  // Relative base. The webview serves the bundle from a custom protocol root,
  // and relative URLs resolve there on every platform.
  base: './',

  // Tauri owns the terminal during `tauri dev`; clearing it hides the Rust
  // build output.
  clearScreen: false,

  server: {
    port: 5173,
    // Tauri waits for this exact port. Silently moving to 5174 would leave it
    // waiting forever.
    strictPort: true,
    watch: {
      // src-tauri/target holds the DLL cargo is writing while the app runs.
      // Watching it makes Vite die with EBUSY on Windows the moment a rebuild
      // touches choicescript_lib.dll, which takes `tauri dev` down with it.
      ignored: ['**/src-tauri/**'],
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    outDir: 'dist',
    // Only two engines ever run this: WebView2 and WKWebView. There is no
    // reason to ship transpiler output for browsers nobody will use.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
