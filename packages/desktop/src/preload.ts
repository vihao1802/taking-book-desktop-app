import { contextBridge, ipcRenderer } from 'electron';
import type { ReaderApi } from './shared/types';

const api: ReaderApi = {
  openFile: () => ipcRenderer.invoke('files:open'),
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
  setAnnotationReflowAnchor: (id, anchor) => ipcRenderer.invoke('annotations:reflowAnchor:set', id, anchor),
  deleteAnnotation: (id) => ipcRenderer.invoke('annotations:delete', id),
  getTheme: () => ipcRenderer.invoke('settings:theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:theme:set', theme),
  getSidebarWidth: () => ipcRenderer.invoke('settings:sidebarWidth:get'),
  setSidebarWidth: (width) => ipcRenderer.invoke('settings:sidebarWidth:set', width),
  getNotesSidebarWidth: () => ipcRenderer.invoke('settings:notesSidebarWidth:get'),
  setNotesSidebarWidth: (width) => ipcRenderer.invoke('settings:notesSidebarWidth:set', width),
  getCloudAccount: () => ipcRenderer.invoke('cloud:status'),
  connectCloud: () => ipcRenderer.invoke('cloud:connect'),
  disconnectCloud: () => ipcRenderer.invoke('cloud:disconnect'),
  runSync: () => ipcRenderer.invoke('sync:run'),
  isFullScreen: () => ipcRenderer.invoke('window:fullscreen:get'),
  toggleFullScreen: () => ipcRenderer.invoke('window:fullscreen:toggle'),
  onFullScreenChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, fullScreen: boolean): void =>
      listener(fullScreen);
    ipcRenderer.on('window:fullscreen:changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen:changed', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
