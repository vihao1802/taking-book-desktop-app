import { contextBridge, ipcRenderer } from 'electron';
import type { ReaderApi } from './shared/types';

const api: ReaderApi = {
  openFile: () => ipcRenderer.invoke('files:open'),
  getLastPosition: (id) => ipcRenderer.invoke('files:last-position:get', id),
  saveLastPosition: (id, page, position) =>
    ipcRenderer.invoke('files:last-position:set', id, page, position),
  listFiles: () => ipcRenderer.invoke('files:list'),
  setFileStatus: (id, status) => ipcRenderer.invoke('files:status:set', id, status),
  setFileTags: (id, tags) => ipcRenderer.invoke('files:tags:set', id, tags),
  getTheme: () => ipcRenderer.invoke('settings:theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:theme:set', theme),
};

contextBridge.exposeInMainWorld('api', api);
