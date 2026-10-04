import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@taking-book/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@taking-book/renderer': path.resolve(__dirname, '../renderer/src/index.ts'),
    },
  },
});
