import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The shared renderer is compiled from source. The aliases point at its real
// path because a symlinked workspace package under node_modules would be
// treated as a prebuilt dependency and skip the React transform.
// pdf.js is the legacy build because the Android WebView can be older than the
// one the default build targets (it calls URL.parse and Promise.try, which
// WebView 124 lacks); the legacy build carries its own polyfills in the page
// and in the worker.
// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  resolve: {
    alias: [
      { find: /^pdfjs-dist\/build\/pdf\.worker\.mjs/, replacement: 'pdfjs-dist/legacy/build/pdf.worker.mjs' },
      { find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' },
      { find: '@taking-book/renderer/main', replacement: path.resolve(__dirname, '../renderer/src/main.tsx') },
      { find: '@taking-book/renderer', replacement: path.resolve(__dirname, '../renderer/src/index.ts') },
      { find: '@taking-book/core', replacement: path.resolve(__dirname, '../core/src/index.ts') },
      { find: '@', replacement: path.resolve(__dirname, '../renderer/src') },
    ],
  },
  optimizeDeps: {
    exclude: ['@taking-book/core', 'pdfjs-dist'],
  },
});
