import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native modules must not be bundled: their `.node` bindings are loaded
      // via dynamic require at runtime (and asar-unpacked when packaged).
      external: ['better-sqlite3'],
    },
  },
});
