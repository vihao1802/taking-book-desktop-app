import { DEFAULT_FOCUS_MINUTES, DEFAULT_TARGET_LANGUAGE, err, ok, type Result, type Theme } from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';

const NOT_AVAILABLE_YET = 'This is not available in the Android app yet.';
// Only shown by the Focus controls, which this app hides, so the value is a placeholder.
const PLACEHOLDER_FOCUS_VOLUME = 0.5;
// The real version arrives with the update check, which this app does not have yet.
const UNKNOWN_APP_VERSION = '0.0.0';

function unavailable<T>(): Promise<Result<T>> {
  return Promise.resolve(err(NOT_AVAILABLE_YET));
}

function done<T>(data: T): Promise<Result<T>> {
  return Promise.resolve(ok(data));
}

/**
 * The reader API for everything the Android app does not do yet: the Library is
 * empty and only the Theme, sidebar widths and Target language are remembered,
 * until the app restarts. The SQLite-backed adapter spreads this and overrides
 * what the core services cover, so each later ticket replaces stubs here.
 *
 * @returns A reader API with every capability off.
 */
export function createInMemoryReaderApi(): ReaderApi {
  let theme: Theme = 'system';
  let sidebarWidth: number | null = null;
  let notesSidebarWidth: number | null = null;
  let targetLanguage = DEFAULT_TARGET_LANGUAGE;

  return {
    capabilities: {
      quiz: false,
      focusTimer: false,
      ambientSound: false,
      statistics: false,
      dropImport: false,
      fullScreen: false,
    },
    systemLocale: typeof navigator === 'undefined' ? null : navigator.language,
    openFile: () => unavailable(),
    importPaths: () => unavailable(),
    onImportProgress: () => () => undefined,
    getPathForFile: () => '',
    getDocumentUrl: () => '',
    deleteFile: () => unavailable(),
    checkFileReadable: () => unavailable(),
    getLastPosition: () => done(null),
    saveLastPosition: () => done(undefined),
    getCoverData: () => done(null),
    saveCoverData: () => done(undefined),
    getReflowCache: () => done(null),
    saveReflowCache: () => done(undefined),
    setFilePageCount: () => done(undefined),
    getFileZoom: () => done(null),
    setFileZoom: () => done(undefined),
    listFiles: () => done([]),
    setFileStatus: () => unavailable(),
    setFileTags: () => unavailable(),
    setFileTitle: () => unavailable(),
    setFileFavorite: () => unavailable(),
    recordReadingSession: () => done(undefined),
    getReadingStats: () =>
      done({ series: [], currentStreak: 0, longestStreak: 0, totalMinutes: 0, minutesToday: 0, books: [] }),
    listAnnotations: () => done([]),
    listLibraryAnnotations: () => done([]),
    createAnnotation: () => unavailable(),
    saveNoteDraft: () => unavailable(),
    savePageNote: () => unavailable(),
    saveNoteText: () => unavailable(),
    deleteNote: () => unavailable(),
    setAnnotationColor: () => unavailable(),
    setAnnotationPageAnchor: () => unavailable(),
    setAnnotationReflowAnchor: () => unavailable(),
    deleteAnnotation: () => unavailable(),
    getTheme: () => done(theme),
    setTheme: (next) => {
      theme = next;
      return done(undefined);
    },
    getSidebarWidth: () => done(sidebarWidth),
    setSidebarWidth: (width) => {
      sidebarWidth = width;
      return done(undefined);
    },
    getNotesSidebarWidth: () => done(notesSidebarWidth),
    setNotesSidebarWidth: (width) => {
      notesSidebarWidth = width;
      return done(undefined);
    },
    getTargetLanguage: () => done(targetLanguage),
    setTargetLanguage: (code) => {
      targetLanguage = code;
      return done(undefined);
    },
    getFocusPreferences: () => done({ soundId: null, volume: PLACEHOLDER_FOCUS_VOLUME, minutes: DEFAULT_FOCUS_MINUTES }),
    setFocusPreferences: () => unavailable(),
    hasAiApiKey: () => done(false),
    setAiApiKey: () => unavailable(),
    clearAiApiKey: () => unavailable(),
    listCustomSounds: () => done([]),
    addCustomSounds: () => unavailable(),
    renameCustomSound: () => unavailable(),
    deleteCustomSound: () => unavailable(),
    translate: () => unavailable(),
    getCloudAccount: () => done(null),
    connectCloud: () => unavailable(),
    onDeviceCode: () => () => undefined,
    disconnectCloud: () => unavailable(),
    runSync: () => unavailable(),
    checkForUpdate: () => done(null),
    openUpdateDownload: () => unavailable(),
    openReleasesPage: () => unavailable(),
    getAppVersion: () => done(UNKNOWN_APP_VERSION),
    isFullScreen: () => done(false),
    toggleFullScreen: () => done(false),
    onFullScreenChange: () => () => undefined,
    generateQuiz: () => unavailable(),
    listQuizzes: () => done([]),
    getQuiz: () => unavailable(),
    submitQuizAttempt: () => unavailable(),
    listQuizAttempts: () => done([]),
    getQuizPrivacyNoticeAcknowledged: () => done(false),
    acknowledgeQuizPrivacyNotice: () => unavailable(),
  };
}
