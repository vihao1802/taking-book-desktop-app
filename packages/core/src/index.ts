export type { BookFile, Annotation, AnnotationColor, BookStatus, CreateAnnotationInput, DayMinutes, LastPosition, OpenFileResult, ReadMode, ReadingStats, Theme } from './models';
export { err, isErr, isOk, ok, unwrapOr, type Result } from './result';
export type { SqlDriver, SqlRunResult, SqlValue } from './sql';
export { deleteFile, filesSchema, getFileZoom, getLastPosition, listFiles, saveLastPosition, setFileFavorite, setFilePageCount, setFileStatus, setFileTags, setFileTitle, setFileZoom, upsertFile, type UpsertFileInput } from './filesRepository';
export {
  annotationsSchema,
  applyRecordAnnotations,
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  listAnnotationsForSync,
  setAnnotationNote,
  tombstoneAnnotationsForFile,
} from './annotationsRepository';
export {
  computeCurrentStreak,
  computeLongestStreak,
  computeReadingStats,
  dayOffset,
  getDailyReadingMinutes,
  readingSessionsSchema,
  recordReadingSession,
} from './readingSessionsRepository';
export { getSetting, getTheme, setSetting, setTheme, settingsSchema } from './settingsRepository';
export { createSha256Hasher, sha256Hex, type Sha256Hasher } from './sha256';
export { normalizePosition, progressFraction } from './position';
export {
  extractLines,
  filterBoilerplateParagraphs,
  paragraphsFromLines,
  reflowPage,
  type ReflowLine,
  type ReflowOptions,
  type ReflowParagraph,
  type ReflowTextItem,
} from './reflow';
export {
  defaultStamp,
  migrateFilesSchema,
  applySyncRecords,
  listRecordsForSync,
  type ApplySyncCounts,
} from './sync/syncRepository';
export { emptyManifest, parseManifest, serializeManifest } from './sync/manifest';
export { isNewerThan, mergeRecords, pickWinner } from './sync/merge';
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
