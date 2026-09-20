import type { Annotation, AnnotationColor, BookFile, BookMinutes, BookStatus, CloudAccount, CreateAnnotationInput, LastPosition, NoteAnchor, NoteDraft, OpenFileResult, PageNoteInput, ReadMode, PageAnchor, ReadingStats, ReflowAnchor, ReflowCacheEntry, Result, SyncSummary, Theme } from '@taking-book/core';

/** Contract exposed on window.api by the preload bridge. */
export interface ReaderApi {
  openFile(): Promise<Result<OpenFileResult | null>>;
  deleteFile(id: number): Promise<Result<void>>;
  /** Whether a book's stored file can still be read; the error says why not, in words fit to show the reader. */
  checkFileReadable(filePath: string): Promise<Result<void>>;
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
  /** Live annotations of every book in the library, for the Notes view. */
  listLibraryAnnotations(): Promise<Result<Annotation[]>>;
  createAnnotation(fileHash: string, input: CreateAnnotationInput): Promise<Result<Annotation>>;
  saveNoteDraft(fileHash: string, draft: NoteDraft): Promise<Result<Annotation>>;
  savePageNote(fileHash: string, input: PageNoteInput): Promise<Result<Annotation>>;
  /** Saves the text of a Note; empty text on a Highlight removes only the text (see core `saveNoteText`). */
  saveNoteText(id: number, text: string): Promise<Result<Annotation>>;
  /** Deletes a Note: the Highlight stays with its text removed, or null when a Page note was deleted entirely. */
  deleteNote(id: number): Promise<Result<Annotation | null>>;
  setAnnotationColor(id: number, color: AnnotationColor): Promise<Result<Annotation>>;
  /** Fills in the page anchor of an annotation that was made in reflow view; an anchor already set is kept. */
  setAnnotationPageAnchor(id: number, anchor: PageAnchor): Promise<Result<Annotation>>;
  /** Fills in the reflow anchor of an annotation that was made in page view; an anchor already set is kept. */
  setAnnotationReflowAnchor(id: number, anchor: ReflowAnchor): Promise<Result<Annotation>>;
  deleteAnnotation(id: number): Promise<Result<void>>;
  getTheme(): Promise<Result<Theme>>;
  setTheme(theme: Theme): Promise<Result<void>>;
  getSidebarWidth(): Promise<Result<number | null>>;
  setSidebarWidth(width: number): Promise<Result<void>>;
  getNotesSidebarWidth(): Promise<Result<number | null>>;
  setNotesSidebarWidth(width: number): Promise<Result<void>>;
  getCloudAccount(): Promise<Result<CloudAccount | null>>;
  connectCloud(): Promise<Result<CloudAccount>>;
  disconnectCloud(): Promise<Result<void>>;
  runSync(): Promise<Result<SyncSummary>>;
  isFullScreen(): Promise<Result<boolean>>;
  toggleFullScreen(): Promise<Result<boolean>>;
  /** Subscribes to full-screen changes (including menu/F11); returns an unsubscribe function. */
  onFullScreenChange(listener: (fullScreen: boolean) => void): () => void;
}

export type { Annotation, AnnotationColor, BookFile, BookMinutes, BookStatus, CloudAccount, CreateAnnotationInput, LastPosition, NoteAnchor, NoteDraft, OpenFileResult, PageNoteInput, ReadMode, ReadingStats, Result, SyncSummary, Theme };
