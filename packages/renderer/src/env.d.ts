/// <reference types="vite/client" />
import type { ReaderApi } from '@/reader-api';

declare global {
  interface Window {
    api: ReaderApi;
  }
}

export {};
