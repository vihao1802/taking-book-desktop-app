import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isOk } from '@taking-book/core';
import type { BookFile, BookStatus, CloudAccount } from '../../shared/types';
import {
  LibraryContext,
  type LibraryContextValue,
  type SyncState,
} from './libraryContext';

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<BookFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [sync, setSync] = useState<SyncState>({ syncing: false, last: null, error: null });

  const refresh = useCallback(async () => {
    const result = await window.api.listFiles();
    if (isOk(result)) setFiles(result.data);
    else setError(result.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.api.getCloudAccount().then((result) => {
      if (isOk(result)) setAccount(result.data);
    });
  }, []);

  const addFiles = useCallback(async (): Promise<BookFile[]> => {
    setBusy(true);
    try {
      const result = await window.api.openFile();
      if (!isOk(result)) {
        setError(result.error);
        return [];
      }
      if (result.data) {
        await refresh();
        return result.data.files;
      }
      return [];
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const connectCloud = useCallback(async () => {
    setConnecting(true);
    try {
      const result = await window.api.connectCloud();
      if (isOk(result)) {
        setAccount(result.data);
        setSync({ syncing: false, last: null, error: null });
      } else {
        setSync({ syncing: false, last: null, error: result.error });
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectCloud = useCallback(async () => {
    const result = await window.api.disconnectCloud();
    if (isOk(result)) {
      setAccount(null);
      setSync({ syncing: false, last: null, error: null });
    } else {
      setSync({ syncing: false, last: null, error: result.error });
    }
  }, []);

  const setStatus = useCallback(async (id: number, status: BookStatus) => {
    const result = await window.api.setFileStatus(id, status);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }, []);

  const setTags = useCallback(async (id: number, tags: string[]) => {
    const result = await window.api.setFileTags(id, tags);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, tags } : f)));
  }, []);

  const setFavorite = useCallback(async (id: number, favorite: boolean) => {
    const result = await window.api.setFileFavorite(id, favorite);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, favorite } : f)));
  }, []);

  const removeFile = useCallback(async (id: number) => {
    const result = await window.api.deleteFile(id);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const runSync = useCallback(async () => {
    setSync({ syncing: true, last: null, error: null });
    const result = await window.api.runSync();
    if (isOk(result)) {
      setSync({ syncing: false, last: result.data, error: null });
      await refresh();
    } else {
      setSync({ syncing: false, last: null, error: result.error });
    }
  }, [refresh]);

  const value: LibraryContextValue = {
    files,
    error,
    busy,
    account,
    connecting,
    sync,
    addFiles,
    setStatus,
    setTags,
    setFavorite,
    removeFile,
    connectCloud,
    disconnectCloud,
    runSync,
    refresh,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
