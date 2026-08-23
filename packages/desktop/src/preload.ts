import { contextBridge, ipcRenderer } from 'electron';
import type { ReaderApi } from './shared/types';

const api: ReaderApi = {
  openFile: () => ipcRenderer.invoke('files:open'),
  deleteFile: (id) => ipcRenderer.invoke('files:delete', id),
  getLastPosition: (id) => ipcRenderer.invoke('files:last-position:get', id),
  saveLastPosition: (id, page, position, mode) =>
    ipcRenderer.invoke('files:last-position:set', id, page, position, mode),
  setFilePageCount: (id, pageCount) => ipcRenderer.invoke('files:page-count:set', id, pageCount),
  listFiles: () => ipcRenderer.invoke('files:list'),
  setFileStatus: (id, status) => ipcRenderer.invoke('files:status:set', id, status),
  setFileTags: (id, tags) => ipcRenderer.invoke('files:tags:set', id, tags),
  setFileTitle: (id, title) => ipcRenderer.invoke('files:title:set', id, title),
  setFileFavorite: (id, favorite) => ipcRenderer.invoke('files:favorite:set', id, favorite),
  recordReadingSession: (fileId, minutes) => ipcRenderer.invoke('sessions:record', fileId, minutes),
  getReadingStats: () => ipcRenderer.invoke('stats:get'),
  listAnnotations: (fileHash) => ipcRenderer.invoke('annotations:list', fileHash),
  createAnnotation: (fileHash, input) => ipcRenderer.invoke('annotations:create', fileHash, input),
  setAnnotationNote: (id, note) => ipcRenderer.invoke('annotations:note:set', id, note),
  deleteAnnotation: (id) => ipcRenderer.invoke('annotations:delete', id),
  getTheme: () => ipcRenderer.invoke('settings:theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:theme:set', theme),
  getCloudAccount: () => ipcRenderer.invoke('cloud:status'),
  connectCloud: () => ipcRenderer.invoke('cloud:connect'),
  disconnectCloud: () => ipcRenderer.invoke('cloud:disconnect'),
  runSync: () => ipcRenderer.invoke('sync:run'),
};

contextBridge.exposeInMainWorld('api', api);
