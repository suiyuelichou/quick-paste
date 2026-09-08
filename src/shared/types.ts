export const DEFAULT_HOTKEY = 'Ctrl+Alt+Space'
export const DEFAULT_HOTKEY_MODE: HotkeyMode = 'toggle'
export const DATA_VERSION = 4

export type HotkeyMode = 'toggle' | 'hold'

export interface Snippet {
  id: string
  content: string
  groupId: string
  favorite: boolean
  order: number
  useCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: string
  name: string
  order: number
}

export interface Settings {
  hotkey: string
  hotkeyMode: HotkeyMode
  openAtLogin: boolean
  dataVersion: number
  onboardingCompleted?: boolean
}

export interface AppData {
  snippets: Snippet[]
  groups: Group[]
  settings: Settings
}

export interface SnippetInput {
  id?: string
  content: string
  groupId: string
  favorite: boolean
}

export interface PasteResult {
  ok: boolean
  code?: 'target_missing' | 'elevated_target' | 'focus_failed' | 'input_failed' | 'helper_failed'
  message?: string
}

export interface SettingsUpdateResult {
  ok: boolean
  settings: Settings
  message?: string
}

export type UpdatePhase = 'unsupported' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  progress?: number
  message: string
}

export interface LibraryData {
  groups: Group[]
  snippets: Snippet[]
}

export interface ImportPreview {
  token: string
  name: string
  groups: { name: string; count: number }[]
  total: number
  duplicates: number
}

export interface BackupInfo {
  id: string
  createdAt: string
  snippetCount: number
  groupCount: number
}

export interface QuickPasteApi {
  getData(): Promise<AppData>
  exportLibrary(groupId?: string): Promise<boolean>
  previewImport(): Promise<ImportPreview | null>
  applyImport(token: string, duplicates: 'skip' | 'keep'): Promise<{ added: number; skipped: number }>
  listBackups(): Promise<BackupInfo[]>
  restoreBackup(id: string): Promise<AppData>
  completeOnboarding(withSamples: boolean): Promise<AppData>
  saveSnippet(input: SnippetInput): Promise<AppData>
  deleteSnippet(id: string): Promise<AppData>
  reorderSnippets(groupId: string, orderedIds: string[]): Promise<AppData>
  pasteSnippet(id: string): Promise<PasteResult>
  createGroup(name: string): Promise<AppData>
  renameGroup(id: string, name: string): Promise<AppData>
  deleteGroup(id: string): Promise<AppData>
  reorderGroups(orderedIds: string[]): Promise<AppData>
  updateSettings(patch: Partial<Pick<Settings, 'hotkey' | 'hotkeyMode' | 'openAtLogin'>>): Promise<SettingsUpdateResult>
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): Promise<UpdateState>
  hidePicker(): Promise<void>
  openManager(section?: 'snippets' | 'settings'): Promise<void>
  onDataChanged(callback: (data: AppData) => void): () => void
  onPickerShown(callback: () => void): () => void
  onManagerNavigate(callback: (section: 'snippets' | 'settings') => void): () => void
  onUpdateState(callback: (state: UpdateState) => void): () => void
}
