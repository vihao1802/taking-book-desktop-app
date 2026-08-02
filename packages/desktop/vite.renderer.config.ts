import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // `@taking-book/core` is rebuilt before every start; pre-bundling it would
    // leave a stale cache (missing new exports) once its dist changes, which
    // crashes the renderer with a blank window. Serve it from source instead.
    exclude: ['@taking-book/core'],
  },
});
