import type { AddCustomSoundsSummary, Annotation, AvailableUpdate, AnnotationColor, BookFile, BookMinutes, BookStatus, CloudAccount, CreateAnnotationInput, CustomSound, FocusPreferences, ImportProgress, ImportSummary, LastPosition, NoteAnchor, NoteDraft, PageNoteInput, ReadMode, PageAnchor, Quiz, QuizAnswerInput, QuizAttempt, QuizAttemptAnswer, QuizQuestion, QuizScopePage, ReadingStats, ReflowAnchor, ReflowCacheEntry, Result, SyncSummary, Theme, Translation } from '@taking-book/core';

/** Contract exposed on window.api by the preload bridge. */
export interface ReaderApi {
  /** The OS regional-format locale (e.g. `en-GB`) for showing dates and times; null when unknown. */
  systemLocale: string | null;
  /** Shows the Add PDF dialog and imports the chosen files; null when the dialog was cancelled. */
  openFile(): Promise<Result<ImportSummary | null>>;
  /** Imports Books from file and folder paths the reader dropped onto the window (Drop import). */
  importPaths(paths: string[]): Promise<Result<ImportSummary>>;
  /** Listens for how far a running import (Add PDF or Drop import) has got; returns the unsubscribe. */
  onImportProgress(listener: (progress: ImportProgress) => void): () => void;
  /** The on-disk path of a dropped file; an empty string when it has none. */
  getPathForFile(file: File): string;
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
  /** The Target language in effect: the reader's choice, else the default from the system language. */
  getTargetLanguage(): Promise<Result<string>>;
  /** Saves the reader's Target language; an unsupported code is rejected. */
  setTargetLanguage(code: string): Promise<Result<void>>;
  /** The Focus controls' remembered sound, volume and timer length, with defaults for anything missing or invalid. */
  getFocusPreferences(): Promise<Result<FocusPreferences>>;
  /** Saves the given Focus choices and leaves the others as they were; an invalid value is rejected. */
  setFocusPreferences(preferences: Partial<FocusPreferences>): Promise<Result<void>>;
  /** Whether an AI provider API key is saved (ADR-0007); the key itself is never sent back. */
  hasAiApiKey(): Promise<Result<boolean>>;
  /** Saves (or replaces) the AI provider API key; an empty key is rejected. */
  setAiApiKey(key: string): Promise<Result<void>>;
  /** Removes the saved AI provider API key. */
  clearAiApiKey(): Promise<Result<void>>;
  /** Every Custom sound on this device, in the order they were added. */
  listCustomSounds(): Promise<Result<CustomSound[]>>;
  /** Asks the reader to pick audio files and adds them as Custom sounds; null when the picker was cancelled. */
  addCustomSounds(): Promise<Result<AddCustomSoundsSummary | null>>;
  /** Renames a Custom sound; the error is worded for the reader. */
  renameCustomSound(contentHash: string, name: string): Promise<Result<void>>;
  /** Removes a Custom sound and its stored audio copy. */
  deleteCustomSound(contentHash: string): Promise<Result<void>>;
  /** Translates selected text into the Target language in effect; the error is worded for the reader. */
  translate(text: string): Promise<Result<Translation>>;
  getCloudAccount(): Promise<Result<CloudAccount | null>>;
  connectCloud(): Promise<Result<CloudAccount>>;
  disconnectCloud(): Promise<Result<void>>;
  runSync(): Promise<Result<SyncSummary>>;
  /** A newer release to offer, or null when this is the latest version. */
  checkForUpdate(): Promise<Result<AvailableUpdate | null>>;
  /** Opens a release download in the browser; only this app's GitHub release links are accepted. */
  openUpdateDownload(url: string): Promise<Result<void>>;
  /** Opens the list of all releases in the browser. */
  openReleasesPage(): Promise<Result<void>>;
  /** The version of the running app, e.g. "1.3.1". */
  getAppVersion(): Promise<Result<string>>;
  isFullScreen(): Promise<Result<boolean>>;
  toggleFullScreen(): Promise<Result<boolean>>;
  /** Subscribes to full-screen changes (including menu/F11); returns an unsubscribe function. */
  onFullScreenChange(listener: (fullScreen: boolean) => void): () => void;
  /**
   * Generates and stores a Quiz for a Book (ADR-0007). `pages` is the caller's
   * already-extracted text for candidate pages; the scope actually sent to the
   * AI provider never extends past `lastPage`. The error is worded for the reader.
   */
  generateQuiz(input: {
    fileHash: string;
    title: string;
    lastPage: number;
    scopeStartPage?: number;
    size?: number;
    pages: QuizScopePage[];
  }): Promise<Result<Quiz>>;
  /** A Book's Quizzes, most recently generated first. */
  listQuizzes(fileHash: string): Promise<Result<Quiz[]>>;
  /** Scores and stores one Quiz attempt. */
  submitQuizAttempt(quizId: number, fileHash: string, answers: QuizAnswerInput[]): Promise<Result<QuizAttempt>>;
  /** A Book's Quiz attempts, most recent first. */
  listQuizAttempts(fileHash: string): Promise<Result<QuizAttempt[]>>;
}

export type { Annotation, AnnotationColor, BookFile, BookMinutes, BookStatus, CloudAccount, CreateAnnotationInput, LastPosition, NoteAnchor, ImportProgress, ImportSummary, NoteDraft, PageNoteInput, Quiz, QuizAnswerInput, QuizAttempt, QuizAttemptAnswer, QuizQuestion, QuizScopePage, ReadMode, ReadingStats, Result, SyncSummary, Theme, Translation };
