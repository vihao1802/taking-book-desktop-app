import {
  createAnnotationService,
  createLibraryService,
  createSettingsService,
  type AnnotationService,
  type HashedTextStore,
  type ImportProgress,
  type LibraryService,
  type SettingsService,
  type SqlDriver,
} from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';
import type { AppUpdates } from './app-updates';
import type { AutoSyncEvents } from './auto-sync';
import type { BookFiles } from './book-files';
import type { CloudSync } from './cloud-sync';
import { createInMemoryReaderApi } from './in-memory-reader-api';

/** What the mobile reader API is built from: the core services over one database. */
export interface MobileServices {
  library: LibraryService;
  annotations: AnnotationService;
  settings: SettingsService;
}

/** The platform pieces the core services need and core cannot supply itself. */
export interface MobileServiceOptions {
  deviceId: string;
  generateUid: () => string;
  systemLocale: string;
  coverStore: HashedTextStore;
  reflowStore: HashedTextStore;
  log?: (message: string) => void;
}

/**
 * Creates the core services over the started database.
 *
 * @param db The started database.
 * @param options This device's id, uid and locale sources, and the cover and reflow stores.
 * @returns The services the mobile reader API calls into.
 */
export function createMobileServices(db: SqlDriver, options: MobileServiceOptions): MobileServices {
  const getDeviceId = (): Promise<string> => Promise.resolve(options.deviceId);
  return {
    library: createLibraryService(db, {
      getDeviceId,
      coverStore: options.coverStore,
      reflowStore: options.reflowStore,
      log: options.log,
    }),
    annotations: createAnnotationService(db, { getDeviceId, generateUid: options.generateUid }),
    settings: createSettingsService(db, { getSystemLocale: () => options.systemLocale }),
  };
}

/**
 * The Android reader API. Everything the library, annotations and settings
 * services cover goes through them; features the Android app does not have yet
 * keep the in-memory defaults, and every capability stays off.
 *
 * @param services The core services over the app database.
 * @param bookFiles Adding Books and finding their files on this device.
 * @param updates The update check and opening its download in the browser.
 * @param cloud Google Drive sign-in and sync, and the notice that an automatic sync finished.
 * @returns A reader API for the shared renderer.
 */
export function createMobileReaderApi({ library, annotations, settings }: MobileServices, bookFiles: BookFiles, updates: AppUpdates, cloud: CloudSync & AutoSyncEvents): ReaderApi {
  const progressListeners = new Set<(progress: ImportProgress) => void>();
  const reportProgress = (progress: ImportProgress): void => progressListeners.forEach((listener) => listener(progress));
  return {
    ...createInMemoryReaderApi(),
    openFile: () => bookFiles.addFromPicker(reportProgress),
    onImportProgress: (listener) => {
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },
    checkFileReadable: (filePath) => bookFiles.checkReadable(filePath),
    getDocumentUrl: (filePath) => bookFiles.getDocumentUrl(filePath),
    listFiles: () => library.listBooks(),
    deleteFile: (id) => library.deleteBook(id),
    setFileStatus: (id, status) => library.setStatus(id, status),
    setFileTags: (id, tags) => library.setTags(id, tags),
    setFileTitle: (id, title) => library.setTitle(id, title),
    setFileFavorite: (id, favorite) => library.setFavorite(id, favorite),
    getLastPosition: (id) => library.getLastPosition(id),
    saveLastPosition: (id, page, position, mode) => library.saveLastPosition(id, { page, position, mode }),
    getFileZoom: (id, mode) => library.getZoom(id, mode),
    setFileZoom: (id, zoom, mode) => library.setZoom(id, zoom, mode),
    setFilePageCount: (id, pageCount) => library.setPageCount(id, pageCount),
    getCoverData: (hash) => library.getCover(hash),
    saveCoverData: (hash, dataUrl) => library.saveCover(hash, dataUrl),
    getReflowCache: (hash) => library.getReflowCache(hash),
    saveReflowCache: (hash, entry) => library.saveReflowCache(hash, entry),
    listAnnotations: (fileHash) => annotations.list(fileHash),
    listLibraryAnnotations: () => annotations.listLibrary(),
    createAnnotation: (fileHash, input) => annotations.create(fileHash, input),
    saveNoteDraft: (fileHash, draft) => annotations.saveDraft(fileHash, draft),
    savePageNote: (fileHash, input) => annotations.savePageNote(fileHash, input),
    saveNoteText: (id, text) => annotations.saveNote(id, text),
    deleteNote: (id) => annotations.deleteNote(id),
    setAnnotationColor: (id, color) => annotations.setColor(id, color),
    setAnnotationPageAnchor: (id, anchor) => annotations.setPageAnchor(id, anchor),
    setAnnotationReflowAnchor: (id, anchor) => annotations.setReflowAnchor(id, anchor),
    deleteAnnotation: (id) => annotations.delete(id),
    getTheme: () => settings.getTheme(),
    setTheme: (theme) => settings.setTheme(theme),
    getSidebarWidth: () => settings.getSidebarWidth(),
    setSidebarWidth: (width) => settings.setSidebarWidth(width),
    getNotesSidebarWidth: () => settings.getNotesSidebarWidth(),
    setNotesSidebarWidth: (width) => settings.setNotesSidebarWidth(width),
    getTargetLanguage: () => settings.getTargetLanguage(),
    setTargetLanguage: (code) => settings.setTargetLanguage(code),
    ...updates,
    ...cloud,
    recordReadingSession: (fileId, minutes) => settings.recordReadingSession(fileId, minutes),
  };
}
