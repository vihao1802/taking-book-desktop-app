import { createContext } from 'react';
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
  addFiles: () => Promise<BookFile[]>;
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
