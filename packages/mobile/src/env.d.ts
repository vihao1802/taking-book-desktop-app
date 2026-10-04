/// <reference types="vite/client" />
import type { ReaderApi } from '@taking-book/renderer';

declare global {
  interface Window {
    api: ReaderApi;
  }
}

export {};
