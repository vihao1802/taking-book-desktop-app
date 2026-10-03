import { defineConfig } from 'vitest/config';
import path from 'path';

// Mirrors the renderer's aliases so component tests can import `@/…` modules.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@taking-book/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
