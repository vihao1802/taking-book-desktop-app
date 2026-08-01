import { useCallback, useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { BookFile, BookStatus } from '../../shared/types';

export function useLibrary() {
  const [files, setFiles] = useState<BookFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await window.api.listFiles();
    if (isOk(result)) setFiles(result.data);
    else setError(result.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return { files, error, busy, addFile, setStatus, setTags, refresh };
}
