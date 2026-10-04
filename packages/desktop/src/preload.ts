import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { readSystemLocaleArgument } from './shared/system-locale';
import type { DeviceCodePrompt } from '@taking-book/core';
import type { ImportProgress, ReaderApi } from '@taking-book/renderer';

const api: ReaderApi = {
  capabilities: {
    quiz: true,
    focusTimer: true,
    ambientSound: true,
    statistics: true,
    dropImport: true,
    fullScreen: true,
  },
  systemLocale: readSystemLocaleArgument(process.argv),
  openFile: () => ipcRenderer.invoke('files:open'),
  importPaths: (paths) => ipcRenderer.invoke('files:import', paths),
  // File.path is gone from Electron; webUtils only works in the preload, so it is wrapped here.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getDocumentUrl: (filePath) => `appfile://doc/${encodeURIComponent(filePath)}`,
  deleteFile: (id) => ipcRenderer.invoke('files:delete', id),
  checkFileReadable: (filePath) => ipcRenderer.invoke('files:check-readable', filePath),
  getLastPosition: (id) => ipcRenderer.invoke('files:last-position:get', id),
  saveLastPosition: (id, page, position, mode) =>
    ipcRenderer.invoke('files:last-position:set', id, page, position, mode),
  getCoverData: (hash) => ipcRenderer.invoke('covers:get', hash),
  saveCoverData: (hash, dataUrl) => ipcRenderer.invoke('covers:save', hash, dataUrl),
  getReflowCache: (hash) => ipcRenderer.invoke('reflow:get', hash),
  saveReflowCache: (hash, entry) => ipcRenderer.invoke('reflow:save', hash, entry),
  setFilePageCount: (id, pageCount) => ipcRenderer.invoke('files:page-count:set', id, pageCount),
  getFileZoom: (id, mode) => ipcRenderer.invoke('files:zoom:get', id, mode),
  setFileZoom: (id, zoom, mode) => ipcRenderer.invoke('files:zoom:set', id, zoom, mode),
  listFiles: () => ipcRenderer.invoke('files:list'),
  setFileStatus: (id, status) => ipcRenderer.invoke('files:status:set', id, status),
  setFileTags: (id, tags) => ipcRenderer.invoke('files:tags:set', id, tags),
  setFileTitle: (id, title) => ipcRenderer.invoke('files:title:set', id, title),
  setFileFavorite: (id, favorite) => ipcRenderer.invoke('files:favorite:set', id, favorite),
  recordReadingSession: (fileId, minutes) => ipcRenderer.invoke('sessions:record', fileId, minutes),
  getReadingStats: () => ipcRenderer.invoke('stats:get'),
  listAnnotations: (fileHash) => ipcRenderer.invoke('annotations:list', fileHash),
  listLibraryAnnotations: () => ipcRenderer.invoke('annotations:listLibrary'),
  createAnnotation: (fileHash, input) => ipcRenderer.invoke('annotations:create', fileHash, input),
  saveNoteDraft: (fileHash, draft) => ipcRenderer.invoke('annotations:draft:save', fileHash, draft),
  savePageNote: (fileHash, input) => ipcRenderer.invoke('annotations:pageNote:save', fileHash, input),
  saveNoteText: (id, text) => ipcRenderer.invoke('annotations:note:save', id, text),
  deleteNote: (id) => ipcRenderer.invoke('annotations:note:delete', id),
  setAnnotationColor: (id, color) => ipcRenderer.invoke('annotations:color:set', id, color),
  setAnnotationPageAnchor: (id, anchor) => ipcRenderer.invoke('annotations:pageAnchor:set', id, anchor),
  setAnnotationReflowAnchor: (id, anchor) => ipcRenderer.invoke('annotations:reflowAnchor:set', id, anchor),
  deleteAnnotation: (id) => ipcRenderer.invoke('annotations:delete', id),
  getTheme: () => ipcRenderer.invoke('settings:theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:theme:set', theme),
  getSidebarWidth: () => ipcRenderer.invoke('settings:sidebarWidth:get'),
  setSidebarWidth: (width) => ipcRenderer.invoke('settings:sidebarWidth:set', width),
  getNotesSidebarWidth: () => ipcRenderer.invoke('settings:notesSidebarWidth:get'),
  setNotesSidebarWidth: (width) => ipcRenderer.invoke('settings:notesSidebarWidth:set', width),
  getTargetLanguage: () => ipcRenderer.invoke('settings:targetLanguage:get'),
  setTargetLanguage: (code) => ipcRenderer.invoke('settings:targetLanguage:set', code),
  getFocusPreferences: () => ipcRenderer.invoke('settings:focus:get'),
  setFocusPreferences: (preferences) => ipcRenderer.invoke('settings:focus:set', preferences),
  hasAiApiKey: () => ipcRenderer.invoke('settings:aiKey:has'),
  setAiApiKey: (key) => ipcRenderer.invoke('settings:aiKey:set', key),
  clearAiApiKey: () => ipcRenderer.invoke('settings:aiKey:clear'),
  translate: (text) => ipcRenderer.invoke('translate:text', text),
  getCloudAccount: () => ipcRenderer.invoke('cloud:status'),
  connectCloud: () => ipcRenderer.invoke('cloud:connect'),
  onCloudDeviceCode: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, prompt: DeviceCodePrompt): void => listener(prompt);
    ipcRenderer.on('cloud:deviceCode', handler);
    return () => ipcRenderer.removeListener('cloud:deviceCode', handler);
  },
  disconnectCloud: () => ipcRenderer.invoke('cloud:disconnect'),
  runSync: () => ipcRenderer.invoke('sync:run'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  openUpdateDownload: (url) => ipcRenderer.invoke('update:download', url),
  openReleasesPage: () => ipcRenderer.invoke('update:releases'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  isFullScreen: () => ipcRenderer.invoke('window:fullscreen:get'),
  toggleFullScreen: () => ipcRenderer.invoke('window:fullscreen:toggle'),
  onImportProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ImportProgress): void => listener(progress);
    ipcRenderer.on('files:import:progress', handler);
    return () => ipcRenderer.removeListener('files:import:progress', handler);
  },
  listCustomSounds: () => ipcRenderer.invoke('sounds:custom:list'),
  addCustomSounds: () => ipcRenderer.invoke('sounds:custom:add'),
  renameCustomSound: (contentHash, name) => ipcRenderer.invoke('sounds:custom:rename', contentHash, name),
  deleteCustomSound: (contentHash) => ipcRenderer.invoke('sounds:custom:delete', contentHash),
  onFullScreenChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, fullScreen: boolean): void =>
      listener(fullScreen);
    ipcRenderer.on('window:fullscreen:changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen:changed', handler);
  },
  generateQuiz: (input) => ipcRenderer.invoke('quiz:generate', input),
  listQuizzes: (fileHash) => ipcRenderer.invoke('quiz:list', fileHash),
  getQuiz: (quizId) => ipcRenderer.invoke('quiz:get', quizId),
  submitQuizAttempt: (quizId, fileHash, answers) =>
    ipcRenderer.invoke('quiz:attempt:save', quizId, fileHash, answers),
  listQuizAttempts: (fileHash) => ipcRenderer.invoke('quiz:attempts:list', fileHash),
  getQuizPrivacyNoticeAcknowledged: () => ipcRenderer.invoke('quiz:privacy:get'),
  acknowledgeQuizPrivacyNotice: () => ipcRenderer.invoke('quiz:privacy:ack'),
};

contextBridge.exposeInMainWorld('api', api);
