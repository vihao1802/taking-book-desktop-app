import { createContext } from 'react';
import type { DeviceCodePrompt, ImportProgress, ImportSummary } from '@taking-book/core';
import type { BookFile, BookStatus, CloudAccount, SyncSummary } from '@/reader-api';

export interface SyncState {
  syncing: boolean;
  last: SyncSummary | null;
  error: string | null;
}

export interface LibraryContextValue {
  files: BookFile[];
  /** False until the first library load settles, so an empty `files` is not yet a truly empty library. */
  loaded: boolean;
  error: string | null;
  busy: boolean;
  account: CloudAccount | null;
  connecting: boolean;
  /** The sign-in code to enter on Google's page while connecting; null when none is waiting. */
  deviceCode: DeviceCodePrompt | null;
  sync: SyncState;
  /** Runs the Add PDF dialog and import; resolves to null when cancelled or failed (the error is set instead). */
  addFiles: () => Promise<ImportSummary | null>;
  /** Imports dropped file paths (Drop import) and reports them in the import notice; never opens a Book. */
  importPaths: (paths: string[]) => Promise<void>;
  /** The outcome of the latest import, shown in the import notice until dismissed. */
  importNotice: ImportSummary | null;
  /** How far the running import has got, shown in the import notice until the outcome replaces it; null when none runs. */
  importProgress: ImportProgress | null;
  dismissImportNotice: () => void;
  setStatus: (id: number, status: BookStatus) => Promise<void>;
  setTags: (id: number, tags: string[]) => Promise<void>;
  setTitle: (id: number, title: string) => Promise<void>;
  setFavorite: (id: number, favorite: boolean) => Promise<void>;
  removeFile: (id: number) => Promise<void>;
  connectCloud: () => Promise<void>;
  disconnectCloud: () => Promise<void>;
  runSync: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const LibraryContext = createContext<LibraryContextValue | null>(null);
