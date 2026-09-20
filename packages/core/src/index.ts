export type { BookFile, Annotation, AnnotationColor, BookMinutes, BookStatus, CreateAnnotationInput, DayMinutes, LastPosition, OpenFileResult, ReadMode, ReadingStats, Theme } from './models';
export { err, isErr, isOk, ok, unwrapOr, type Result } from './result';
export type { SqlDriver, SqlRunResult, SqlValue } from './sql';
export { deleteFile, filesSchema, getFileZoom, getLastPosition, listFiles, saveLastPosition, setFileFavorite, setFilePageCount, setFileStatus, setFileTags, setFileTitle, setFileZoom, upsertFile, type UpsertFileInput } from './filesRepository';
export {
  annotationsSchema,
  applyRecordAnnotations,
  createAnnotation,
  deleteAnnotation,
  getAnnotation,
  listAnnotations,
  listAnnotationsForSync,
  listLibraryAnnotations,
  migrateAnnotationsSchema,
  setAnnotationColor,
  setAnnotationNote,
  setAnnotationPageAnchor,
  setAnnotationReflowAnchor,
  type CreateAnnotationOptions,
  type PageAnchor,
  type ReflowAnchor,
} from './annotationsRepository';
export { deriveAnnotationUid, resolveAnnotationUid, type AnnotationUidGenerator } from './annotationUid';
export { deleteNote, saveNoteDraft, saveNoteText, savePageNote, type NoteAnchor, type NoteDraft, type PageNoteInput } from './notesRepository';
export {
  computeCurrentStreak,
  computeLongestStreak,
  computeReadingStats,
  dayOffset,
  getDailyReadingMinutes,
  getReadingMinutesByBook,
  readingSessionsSchema,
  recordReadingSession,
} from './readingSessionsRepository';
export { findNearestNote, locateNote, type NoteLocation } from './noteJump';
export { hasNoteText, isPageNote, listLibraryNotes, listNotes, type BookNotes, type ListLibraryNotesOptions, type ListNotesOptions } from './notes';
export {
  getNotesSidebarWidth,
  getSetting,
  getSidebarWidth,
  getTheme,
  setNotesSidebarWidth,
  setSetting,
  setSidebarWidth,
  setTheme,
  settingsSchema,
} from './settingsRepository';
export { createSha256Hasher, sha256Hex, type Sha256Hasher } from './sha256';
export { normalizePosition, progressFraction } from './position';
export { sortByRecentlyRead } from './recentlyRead';
export {
  detectShortcutPlatform,
  formatShortcutLabel,
  resolveReaderShortcut,
  type KeyInput,
  type ReaderShortcutAction,
  type ResolveShortcutOptions,
  type ShortcutPlatform,
} from './readerShortcuts';
export { findMatchesInTexts, findTextMatches, type IndexedTextMatch, type TextMatch } from './textSearch';
export {
  ZOOM_PRESETS,
  clampZoomPercent,
  multiplierToPercent,
  nextPresetPercent,
  parseCustomZoomPercent,
  percentToMultiplier,
  previousPresetPercent,
  stepZoomMultiplier,
} from './zoom';
export {
  REFLOW_TARGET_FONT_SIZE,
  assignImagePositions,
  dominantFontSize,
  extractLines,
  filterBoilerplateParagraphs,
  fontStyleFromName,
  isMonospaceFont,
  normalizeReflowSizes,
  getParagraphTextAlign,
  paragraphsFromLines,
  reflowPage,
  type PositionedReflowImage,
  type ReflowImage,
  type ReflowLine,
  type ReflowOptions,
  type ReflowParagraph,
  type ReflowRun,
  type ReflowTextItem,
} from './reflow';
export {
  offsetForPageLocation,
  pageIndexAtOffset,
  pageLocationAtOffset,
  type PageLocation,
} from './reflowPages';
export {
  REFLOW_CACHE_VERSION,
  parseReflowCache,
  serializeReflowCache,
  type ReflowCacheEntry,
} from './reflowCache';
export {
  defaultStamp,
  migrateFilesSchema,
  applySyncRecords,
  listRecordsForSync,
  type ApplySyncCounts,
} from './sync/syncRepository';
export { emptyManifest, parseManifest, serializeManifest } from './sync/manifest';
export { isNewerThan, mergeAnnotations, mergeRecords, pickWinner } from './sync/merge';
export { syncLibrary, type SyncLibraryOptions } from './sync/syncLibrary';
export type { SyncAnnotation, SyncManifest, SyncRecord, SyncStamp, SyncStorage, SyncSummary } from './sync/types';
export {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  parseTokenResponse,
  refreshAccessToken,
  type CloudAccount,
  type CloudProvider,
  type CloudToken,
  type OAuthClientConfig,
  type OAuthHttpClient,
  type OAuthTokenResponse,
} from './sync/cloud';
export { deriveCodeChallenge, generateCodeVerifier } from './sync/pkce';
