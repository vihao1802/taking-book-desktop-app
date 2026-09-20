import type { Annotation, AnnotationColor, BookFile, BookMinutes, BookStatus, CloudAccount, CreateAnnotationInput, LastPosition, OpenFileResult, ReadMode, ReadingStats, ReflowCacheEntry, Result, SyncSummary, Theme } from '@taking-book/core';

/** Contract exposed on window.api by the preload bridge. */
export interface ReaderApi {
  openFile(): Promise<Result<OpenFileResult | null>>;
  deleteFile(id: number): Promise<Result<void>>;
  getLastPosition(id: number): Promise<Result<LastPosition | null>>;
  saveLastPosition(id: number, page: number, position: number, mode: ReadMode): Promise<Result<void>>;
  getCoverData(hash: string): Promise<Result<string | null>>;
  saveCoverData(hash: string, dataUrl: string): Promise<Result<void>>;
  getReflowCache(hash: string): Promise<Result<ReflowCacheEntry | null>>;
  saveReflowCache(hash: string, entry: ReflowCacheEntry): Promise<Result<void>>;
  setFilePageCount(id: number, pageCount: number): Promise<Result<void>>;
  getFileZoom(id: number, mode: ReadMode): Promise<Result<number | null>>;
  setFileZoom(id: number, zoom: number, mode: ReadMode): Promise<Result<void>>;
  listFiles(): Promise<Result<BookFile[]>>;
  setFileStatus(id: number, status: BookStatus): Promise<Result<void>>;
  setFileTags(id: number, tags: string[]): Promise<Result<void>>;
  setFileTitle(id: number, title: string): Promise<Result<void>>;
  setFileFavorite(id: number, favorite: boolean): Promise<Result<void>>;
  recordReadingSession(fileId: number, minutes: number): Promise<Result<void>>;
  getReadingStats(): Promise<Result<ReadingStats>>;
  listAnnotations(fileHash: string): Promise<Result<Annotation[]>>;
  createAnnotation(fileHash: string, input: CreateAnnotationInput): Promise<Result<Annotation>>;
  setAnnotationNote(id: number, note: string | null): Promise<Result<Annotation>>;
  deleteAnnotation(id: number): Promise<Result<void>>;
  getTheme(): Promise<Result<Theme>>;
  setTheme(theme: Theme): Promise<Result<void>>;
  getCloudAccount(): Promise<Result<CloudAccount | null>>;
  connectCloud(): Promise<Result<CloudAccount>>;
  disconnectCloud(): Promise<Result<void>>;
  runSync(): Promise<Result<SyncSummary>>;
  isFullScreen(): Promise<Result<boolean>>;
  toggleFullScreen(): Promise<Result<boolean>>;
  /** Subscribes to full-screen changes (including menu/F11); returns an unsubscribe function. */
  onFullScreenChange(listener: (fullScreen: boolean) => void): () => void;
}

export type { Annotation, AnnotationColor, BookFile, BookMinutes, BookStatus, CloudAccount, CreateAnnotationInput, LastPosition, OpenFileResult, ReadMode, ReadingStats, Result, SyncSummary, Theme };
