import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // Tailwind v4 is a Vite plugin now: no postcss.config, no tailwind.config.
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false },
  // Relative base so the build works from a subpath (GitHub Pages project
  // sites, for one) as well as from a domain root.
  base: './',
  server: { port: 5173 },
});
