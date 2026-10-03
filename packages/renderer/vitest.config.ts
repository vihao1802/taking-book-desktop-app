import { defineConfig } from 'vitest/config';
import path from 'path';

// Mirrors the desktop Vite build's aliases so component tests can import `@/…` modules.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@taking-book/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
