import { contextBridge, ipcRenderer } from 'electron'
import type { AppData, QuickPasteApi, Settings, SnippetInput, UpdateState } from '../shared/types'

const api: QuickPasteApi = {
  getData: () => ipcRenderer.invoke('data:get'),
  exportLibrary: (groupId) => ipcRenderer.invoke('library:export', groupId),
  previewImport: () => ipcRenderer.invoke('library:preview'),
  applyImport: (token, duplicates) => ipcRenderer.invoke('library:import', token, duplicates),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (id) => ipcRenderer.invoke('backup:restore', id),
  completeOnboarding: (withSamples) => ipcRenderer.invoke('onboarding:complete', withSamples),
  saveSnippet: (input: SnippetInput) => ipcRenderer.invoke('snippet:save', input),
  deleteSnippet: (id: string) => ipcRenderer.invoke('snippet:delete', id),
  reorderSnippets: (groupId: string, ids: string[]) => ipcRenderer.invoke('snippet:reorder', groupId, ids),
  pasteSnippet: (id: string) => ipcRenderer.invoke('snippet:paste', id),
  createGroup: (name: string) => ipcRenderer.invoke('group:create', name),
  renameGroup: (id: string, name: string) => ipcRenderer.invoke('group:rename', id, name),
  deleteGroup: (id: string) => ipcRenderer.invoke('group:delete', id),
  reorderGroups: (ids: string[]) => ipcRenderer.invoke('group:reorder', ids),
  updateSettings: (patch: Partial<Pick<Settings, 'hotkey' | 'openAtLogin'>>) => ipcRenderer.invoke('settings:update', patch),
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  hidePicker: () => ipcRenderer.invoke('picker:hide'),
  openManager: (section = 'snippets') => ipcRenderer.invoke('manager:open', section),
  onDataChanged: (callback: (data: AppData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AppData): void => callback(data)
    ipcRenderer.on('data:changed', listener)
    return () => ipcRenderer.removeListener('data:changed', listener)
  },
  onPickerShown: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('picker:shown', listener)
    return () => ipcRenderer.removeListener('picker:shown', listener)
  },
  onManagerNavigate: (callback: (section: 'snippets' | 'settings') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, section: 'snippets' | 'settings'): void => callback(section)
    ipcRenderer.on('manager:navigate', listener)
    return () => ipcRenderer.removeListener('manager:navigate', listener)
  },
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  }
}

contextBridge.exposeInMainWorld('quickPaste', api)
