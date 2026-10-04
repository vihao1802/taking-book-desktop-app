/// <reference types="vite/client" />
import type { ReaderApi } from '@taking-book/renderer';

declare global {
  interface ImportMetaEnv {
    /** The Google OAuth client (type "TVs and Limited Input devices") baked in at build time; both unset disables sync. */
    readonly VITE_TB_GDRIVE_CLIENT_ID?: string;
    readonly VITE_TB_GDRIVE_CLIENT_SECRET?: string;
  }

  interface Window {
    api: ReaderApi;
  }
}

export {};
