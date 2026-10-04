export type { BookFile, Annotation, AnnotationColor, BookMinutes, BookStatus, CreateAnnotationInput, DayMinutes, LastPosition, ReadMode, ReadingStats, Theme } from './models';
export { err, isErr, isOk, ok, unwrapOr, type Result } from './result';
export type { SqlDriver, SqlRunResult, SqlValue } from './sql';
export { deleteFile, filesSchema, getFileZoom, getLastPosition, getLiveFileByHash, listFiles, saveLastPosition, setFileFavorite, setFilePageCount, setFileStatus, setFileTags, setFileTitle, setFileZoom, upsertFile, type UpsertFileInput } from './filesRepository';
export { importBooks, type ImportBooksOptions, type ImportFileSystem, type ImportProgress, type ImportSummary, type SkippedImport, type SkipReason } from './importBooks';
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
  getEffectiveTargetLanguage,
  getNotesSidebarWidth,
  getFocusPreferences,
  getSetting,
  getSidebarWidth,
  getTargetLanguage,
  getTheme,
  setNotesSidebarWidth,
  setFocusPreferences,
  setSetting,
  setSidebarWidth,
  setTargetLanguage,
  setTheme,
  settingsSchema,
} from './settingsRepository';
export {
  DEFAULT_TARGET_LANGUAGE,
  SUPPORTED_LANGUAGES,
  getLanguageName,
  isSupportedLanguage,
  resolveTargetLanguage,
  type SupportedLanguage,
} from './translation/languages';
export {
  MAX_TRANSLATION_LENGTH,
  TRANSLATION_FAILED_MESSAGE,
  TRANSLATION_TIMEOUT_MS,
  translateText,
  type EngineTranslation,
  type TranslateTextOptions,
  type Translation,
  type TranslationEngine,
  type TranslationEngineFailure,
  type TranslationFailureKind,
} from './translation/translate';
export { createSha256Hasher, sha256Hex, type Sha256Hasher } from './sha256';
export { normalizePosition, progressFraction } from './position';
export { sortByRecentlyRead } from './recentlyRead';
export {
  RECENTLY_ADDED_LIMIT,
  arrangeHome,
  isBeingRead,
  type FeaturedBook,
  type HomeArrangement,
} from './homeArrangement';
export { formatLastRead } from './lastRead';
export { formatGreetingDateTime, formatLocalMinute, getGreeting, getTimeOfDay, msUntilNextMinute, type TimeOfDay } from './greeting';
export {
  detectShortcutPlatform,
  formatShortcutLabel,
  resolveReaderShortcut,
  type KeyInput,
  type ReaderShortcutAction,
  type ResolveShortcutOptions,
  type ShortcutPlatform,
} from './readerShortcuts';
export {
  buildSearchIndex,
  findMatchesInIndex,
  findMatchesInTexts,
  findTextMatches,
  type IndexedTextMatch,
  type SearchIndex,
  type TextMatch,
} from './textSearch';
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
  type ReflowRunStyle,
  type ReflowTextItem,
} from './reflow';
export { assignCodeColors, isPlainInk, type ColoredText } from './reflowColors';
export {
  PAGE_PROBE_PX,
  offsetForPageLocation,
  pageIndexAtOffset,
  pageIndexAtScroll,
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
  type ConnectOptions,
  type DeviceCodePrompt,
  type OAuthClientConfig,
  type OAuthHttpClient,
  type OAuthTokenResponse,
} from './sync/cloud';
export {
  GOOGLE_DEVICE_CODE_URL,
  GOOGLE_DEVICE_FLOW_SCOPES,
  GOOGLE_TOKEN_URL,
  ensureFreshToken,
  parseDeviceCodeResponse,
  signInWithDeviceFlow,
  type DeviceCodeGrant,
  type DeviceFlowConfig,
  type DeviceFlowError,
  type DeviceFlowFailureKind,
  type DeviceFlowOptions,
  type EnsureFreshTokenOptions,
} from './sync/googleDeviceFlow';
export { deriveCodeChallenge, generateCodeVerifier } from './sync/pkce';
export { processPagesInOrder, type ProcessPagesOptions } from './pageProcessing';
export {
  AMBIENT_SOUNDS,
  DEFAULT_AMBIENT_VOLUME,
  DEFAULT_FOCUS_MINUTES,
  FOCUS_MAX_MINUTES,
  FOCUS_MIN_MINUTES,
  FOCUS_PRESET_MINUTES,
  INITIAL_FOCUS_STATE,
  applyFocusAction,
  formatFocusTimeLeft,
  getAmbientSound,
  getFocusTimeLeftMs,
  isFocusActive,
  parseFocusMinutes,
  resolveFocusPreferences,
  type AmbientSound,
  type AmbientSoundKind,
  type AmbientSoundState,
  type FocusAction,
  type FocusEffect,
  type FocusError,
  type FocusPreferences,
  type FocusState,
  type FocusTimer,
  type FocusTransition,
  type StoredFocusPreferences,
} from './focus';
export {
  MAX_CUSTOM_SOUND_BYTES,
  MAX_CUSTOM_SOUND_NAME_LENGTH,
  createCustomSound,
  defaultCustomSoundName,
  getCustomSoundHash,
  listAmbientSounds,
  parseCustomSoundName,
  resolveSoundChoice,
  validateCustomSoundFile,
  type CustomSound,
  type CustomSoundError,
} from './custom-sounds';
export {
  addCustomSound,
  customSoundsSchema,
  deleteCustomSound,
  listCustomSounds,
  renameCustomSound,
  type AddedCustomSound,
} from './customSoundsRepository';
export {
  addCustomSounds,
  type AddCustomSoundsSummary,
  type AddedCustomSoundFile,
  type CustomSoundFileSystem,
  type RejectedCustomSound,
} from './addCustomSounds';
export { crossfadeLoop } from './loop-crossfade';
export {
  checkForUpdate,
  compareVersions,
  findAvailableUpdate,
  parseLatestRelease,
  pickDownloadAsset,
  type AvailableUpdate,
  type CheckForUpdateOptions,
  type LatestRelease,
  type ReleaseAsset,
  type UpdateTarget,
} from './updates';
export type {
  Quiz,
  QuizAnswerInput,
  QuizAttempt,
  QuizAttemptAnswer,
  QuizQuestion,
  QuizQuestionType,
} from './quiz/models';
export {
  DEFAULT_QUIZ_SCOPE_PAGES,
  DEFAULT_QUIZ_SIZE,
  QUIZ_SIZES,
  isQuizSize,
  resolveQuizScope,
  type QuizScope,
  type QuizSize,
} from './quiz/quizScope';
export {
  createQuizProviderEngine,
  type AiProviderKind,
  type QuizProviderEngine,
  type QuizProviderFailure,
  type QuizProviderFailureKind,
  type QuizProviderQuestion,
  type QuizProviderRequest,
  type QuizScopePage,
} from './quiz/quizProvider';
export { validateQuizQuestions } from './quiz/validateQuizQuestions';
export { GEMINI_MODEL, GEMINI_TIMEOUT_MS, createGeminiProvider, type FetchLike } from './quiz/geminiProvider';
export { scoreAnswers, totalCorrect } from './quiz/quizScoring';
export { missedQuestions, type QuizMissedQuestion } from './quiz/quizReview';
export {
  createQuiz,
  findQuizForRequest,
  getQuiz,
  listQuizAttemptsForBook,
  listQuizzesForBook,
  quizSchema,
  saveQuizAttempt,
} from './quiz/quizRepository';
export {
  INVALID_KEY_MESSAGE,
  MISSING_KEY_MESSAGE,
  NO_TEXT_MESSAGE,
  generateQuiz,
  submitQuizAttempt,
  type GenerateQuizOptions,
  type SubmitQuizAttemptOptions,
} from './quiz/quizService';
export { acknowledgeQuizPrivacyNotice, getQuizPrivacyNoticeAcknowledged } from './quiz/privacyNotice';
