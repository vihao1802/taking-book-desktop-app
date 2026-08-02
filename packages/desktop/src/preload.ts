import { contextBridge, ipcRenderer } from 'electron';
import type { ReaderApi } from './shared/types';

const api: ReaderApi = {
  openFile: () => ipcRenderer.invoke('files:open'),
  deleteFile: (id) => ipcRenderer.invoke('files:delete', id),
  getLastPosition: (id) => ipcRenderer.invoke('files:last-position:get', id),
  saveLastPosition: (id, page, position) =>
    ipcRenderer.invoke('files:last-position:set', id, page, position),
  listFiles: () => ipcRenderer.invoke('files:list'),
  setFileStatus: (id, status) => ipcRenderer.invoke('files:status:set', id, status),
  setFileTags: (id, tags) => ipcRenderer.invoke('files:tags:set', id, tags),
  getTheme: () => ipcRenderer.invoke('settings:theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:theme:set', theme),
  getSyncFolder: () => ipcRenderer.invoke('settings:sync-folder:get'),
  setSyncFolder: (folderPath) => ipcRenderer.invoke('settings:sync-folder:set', folderPath),
  chooseSyncFolder: () => ipcRenderer.invoke('settings:sync-folder:choose'),
  runSync: () => ipcRenderer.invoke('sync:run'),
};

contextBridge.exposeInMainWorld('api', api);
