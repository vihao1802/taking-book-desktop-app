import { useCallback, useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { BookFile, BookStatus, SyncSummary } from '../../shared/types';

export interface SyncState {
  syncing: boolean;
  last: SyncSummary | null;
  error: string | null;
}

export function useLibrary() {
  const [files, setFiles] = useState<BookFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncFolder, setSyncFolderState] = useState<string | null>(null);
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
    window.api.getSyncFolder().then((result) => {
      if (isOk(result)) setSyncFolderState(result.data);
    });
  }, []);

  const addFile = useCallback(async (): Promise<BookFile | null> => {
    setBusy(true);
    try {
      const result = await window.api.openFile();
      if (!isOk(result)) {
        setError(result.error);
        return null;
      }
      if (result.data) await refresh();
      return result.data?.file ?? null;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

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

  const removeFile = useCallback(async (id: number) => {
    const result = await window.api.deleteFile(id);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const chooseSyncFolder = useCallback(async () => {
    const result = await window.api.chooseSyncFolder();
    if (isOk(result)) {
      setSyncFolderState(result.data);
      if (result.data) setSync({ syncing: false, last: null, error: null });
    } else {
      setSync({ syncing: false, last: null, error: result.error });
    }
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

  return {
    files,
    error,
    busy,
    syncFolder,
    sync,
    addFile,
    setStatus,
    setTags,
    removeFile,
    chooseSyncFolder,
    runSync,
    refresh,
  };
}
