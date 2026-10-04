import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isOk, type DeviceCodePrompt, type ImportProgress, type ImportSummary, type Result } from '@taking-book/core';
import type { BookFile, BookStatus, CloudAccount, RemoteOnlyBook } from '@/reader-api';
import {
  LibraryContext,
  type LibraryContextValue,
  type SyncState,
} from './libraryContext';

/** Shown once per launch until the reader reconnects; it contains "reconnect" so the Library offers the Reconnect button. */
const RECONNECT_NOTICE =
  'Reconnect Google Drive once to keep syncing: this sign-in was made by an earlier version of Taking Book.';

interface LibraryProviderProps {
  children: ReactNode;
  /** Called when files shared from another app arrived, so the app can show the Library, where the outcome is reported. */
  onSharedFilesReceived?: () => void;
}

export function LibraryProvider({ children, onSharedFilesReceived }: LibraryProviderProps) {
  const [files, setFiles] = useState<BookFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteOnly, setRemoteOnly] = useState<ReadonlyMap<string, RemoteOnlyBook>>(new Map());
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importNotice, setImportNotice] = useState<ImportSummary | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deviceCode, setDeviceCode] = useState<DeviceCodePrompt | null>(null);
  const [sync, setSync] = useState<SyncState>({ syncing: false, last: null, error: null });

  const refresh = useCallback(async () => {
    const result = await window.api.listFiles();
    if (isOk(result)) setFiles(result.data);
    else setError(result.error);
    const missing = await window.api.getRemoteOnlyBooks();
    if (isOk(missing)) setRemoteOnly(new Map(missing.data.map((book) => [book.hash, book])));
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => window.api.onImportProgress(setImportProgress), []);

  useEffect(() => window.api.onDeviceCode(setDeviceCode), []);

  // A sync the platform ran by itself can bring Books, so show them and the outcome like a manual sync.
  useEffect(
    () =>
      window.api.onSyncComplete((result) => {
        if (!isOk(result)) return;
        setSync({ syncing: false, last: result.data, error: null });
        void refresh();
      }),
    [refresh],
  );

  useEffect(() => {
    window.api.getCloudAccount().then((result) => {
      if (!isOk(result)) return;
      setAccount(result.data);
      if (result.data?.needsReconnect) {
        setSync({ syncing: false, last: null, error: RECONNECT_NOTICE });
      }
    });
  }, []);

  // Every way of adding Books shows the spinner, refreshes the library and reports the outcome alike.
  const runImport = useCallback(
    async (importBooks: () => Promise<Result<ImportSummary | null>>): Promise<ImportSummary | null> => {
      setBusy(true);
      // A new import replaces the previous outcome, so its count is not shown beside a stale summary.
      setImportNotice(null);
      try {
        const result = await importBooks();
        if (!isOk(result)) {
          setError(result.error);
          return null;
        }
        if (!result.data) return null;
        await refresh();
        setImportNotice(result.data);
        return result.data;
      } finally {
        setImportProgress(null);
        setBusy(false);
      }
    },
    [refresh],
  );

  // Pulled on mount as well as on notification: a share that started the app, or arrived while a Book was open, has no listener yet.
  const importSharedFiles = useCallback(async () => {
    let received = false;
    await runImport(async () => {
      const result = await window.api.importSharedFiles();
      received = !isOk(result) || result.data !== null;
      return result;
    });
    if (received) onSharedFilesReceived?.();
  }, [runImport, onSharedFilesReceived]);

  useEffect(() => {
    void importSharedFiles();
    return window.api.onSharedFiles(() => void importSharedFiles());
  }, [importSharedFiles]);

  const addFiles = useCallback(() => runImport(() => window.api.openFile()), [runImport]);

  const importPaths = useCallback(
    async (paths: string[]) => {
      await runImport(() => window.api.importPaths(paths));
    },
    [runImport],
  );

  const dismissImportNotice = useCallback(() => setImportNotice(null), []);

  const connectCloud = useCallback(async () => {
    setConnecting(true);
    try {
      const result = await window.api.connectCloud();
      if (isOk(result)) {
        setAccount(result.data);
        setSync({ syncing: false, last: null, error: null });
        const syncResult = await window.api.runSync();
        if (isOk(syncResult)) {
          setSync({ syncing: false, last: syncResult.data, error: null });
          await refresh();
        } else {
          setSync({ syncing: false, last: null, error: syncResult.error });
        }
      } else {
        setSync({ syncing: false, last: null, error: result.error });
      }
    } finally {
      setDeviceCode(null);
      setConnecting(false);
    }
  }, [refresh]);

  const downloadNow = useCallback(
    async (file: BookFile) => {
      setDownloadingHash(file.hash);
      setError(null);
      try {
        const result = await window.api.downloadBookNow(file.hash);
        if (!isOk(result)) setError(`Couldn't download “${file.title}”. ${result.error}`);
        await refresh();
      } finally {
        setDownloadingHash(null);
      }
    },
    [refresh],
  );

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

  const setTitle = useCallback(async (id: number, title: string) => {
    const result = await window.api.setFileTitle(id, title);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, title } : f)));
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
    loaded,
    error,
    remoteOnly,
    downloadingHash,
    downloadNow,
    busy,
    account,
    connecting,
    deviceCode,
    sync,
    addFiles,
    importPaths,
    importNotice,
    importProgress,
    dismissImportNotice,
    setStatus,
    setTags,
    setTitle,
    setFavorite,
    removeFile,
    connectCloud,
    disconnectCloud,
    runSync,
    refresh,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
