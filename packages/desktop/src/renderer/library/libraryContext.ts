import { createContext } from 'react';
import type { ImportSummary } from '@taking-book/core';
import type { BookFile, BookStatus, CloudAccount, SyncSummary } from '../../shared/types';

export interface SyncState {
  syncing: boolean;
  last: SyncSummary | null;
  error: string | null;
}

export interface LibraryContextValue {
  files: BookFile[];
  error: string | null;
  busy: boolean;
  account: CloudAccount | null;
  connecting: boolean;
  sync: SyncState;
  /** Runs the Add PDF dialog and import; resolves to null when cancelled or failed (the error is set instead). */
  addFiles: () => Promise<ImportSummary | null>;
  /** Imports dropped file paths (Drop import) and reports them in the import notice; never opens a Book. */
  importPaths: (paths: string[]) => Promise<void>;
  /** The outcome of the latest import, shown in the import notice until dismissed. */
  importNotice: ImportSummary | null;
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
