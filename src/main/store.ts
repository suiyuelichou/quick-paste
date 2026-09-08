import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DATA_VERSION, DEFAULT_HOTKEY, DEFAULT_HOTKEY_MODE, type AppData, type BackupInfo, type LibraryData, type Settings, type SnippetInput } from '../shared/types'
import { parseLibrary } from '../shared/library'
import { isValidHotkey } from '../shared/search'
import { hotkeyVirtualKeyGroups, isHotkeyMode } from '../shared/hotkey'
import { sampleLibrary } from '../shared/samples'

const clone = <T>(value: T): T => structuredClone(value)
const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'
const backupName = /^\d{13}-[a-f0-9-]{36}\.json$/
const MAX_BACKUPS = 10

export function createInitialData(): AppData {
  return {
    snippets: [], groups: [{ id: randomUUID(), name: '默认分组', order: 0 }],
    settings: { hotkey: DEFAULT_HOTKEY, hotkeyMode: DEFAULT_HOTKEY_MODE, openAtLogin: false, dataVersion: DATA_VERSION, onboardingCompleted: false }
  }
}

export class DataStore {
  private data: AppData = createInitialData()
  private saveQueue: Promise<unknown> = Promise.resolve()
  private readonly backupDirectory: string
  private lastBackupTime = 0
  recoveryMessage: string | null = null

  constructor(private readonly filePath: string) { this.backupDirectory = `${filePath}.backups` }

  async load(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    let source: string | undefined
    try { source = await readFile(this.filePath, 'utf8') }
    catch (error) { if (!missing(error)) throw error }
    if (source !== undefined) {
      try {
        const raw = JSON.parse(source)
        if (raw?.settings?.dataVersion > DATA_VERSION) throw new Error('NEWER_DATA')
        this.data = this.migrate(raw)
        return
      } catch (error) {
        if ((error as Error).message === 'NEWER_DATA') throw new Error('数据由较新版本创建，请升级 Quick Paste 后重试')
        // Read/write failures never reset the library; only invalid data is quarantined.
        await rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`)
      }
    }
    const backups = await this.listBackups()
    if (backups.length) {
      this.data = this.migrate(JSON.parse(await readFile(join(this.backupDirectory, backups[0].id), 'utf8')))
      await this.writeAtomic(this.filePath, JSON.stringify(this.data, null, 2))
      this.recoveryMessage = '原数据文件缺失或损坏，已恢复最近的有效备份。损坏文件已保留，请检查文本库。'
    } else if (source !== undefined) {
      throw new Error('数据文件损坏且没有有效备份。原文件已保留为 .corrupt 文件，请恢复导出的 JSON 后重新启动。')
    } else {
      await this.writeAtomic(this.filePath, JSON.stringify(this.data, null, 2))
    }
  }

  snapshot(): AppData { return clone(this.data) }
  async flush(): Promise<void> { await this.saveQueue }

  private transact(change: (draft: AppData) => void, backup = true): Promise<AppData> {
    const operation = this.saveQueue.catch(() => undefined).then(async () => {
      const draft = clone(this.data)
      change(draft)
      if (backup) await this.backupCurrent()
      await this.writeAtomic(this.filePath, JSON.stringify(draft, null, 2))
      this.data = draft
      if (backup) await this.pruneBackups().catch(() => undefined)
      return this.snapshot()
    })
    this.saveQueue = operation
    return operation
  }

  saveSnippet(input: SnippetInput): Promise<AppData> {
    const values = clone(input)
    return this.transact((data) => {
      if (typeof values.content !== 'string' || !values.content.trim()) throw new Error('文本内容不能为空')
      if (values.content.length > 100000) throw new Error('单条文本不能超过 100000 个字符')
      if (!data.groups.some((group) => group.id === values.groupId)) throw new Error('所选分组不存在')
      const now = new Date().toISOString()
      const existing = values.id ? data.snippets.find((item) => item.id === values.id) : undefined
      if (values.id && !existing) throw new Error('原文本已不存在，请新建文本后保存草稿')
      if (existing) {
        if (existing.groupId !== values.groupId) existing.order = this.nextOrder(data, values.groupId)
        Object.assign(existing, { content: values.content, groupId: values.groupId, favorite: !!values.favorite, updatedAt: now })
      } else {
        if (data.snippets.length >= 10000) throw new Error('最多支持 10000 条文本')
        data.snippets.push({ id: randomUUID(), content: values.content, groupId: values.groupId, favorite: !!values.favorite,
          order: this.nextOrder(data, values.groupId), useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now })
      }
    })
  }

  deleteSnippet(id: string): Promise<AppData> {
    return this.transact((data) => { data.snippets = data.snippets.filter((item) => item.id !== id) })
  }

  reorderSnippets(groupId: string, orderedIds: string[]): Promise<AppData> {
    return this.transact((data) => {
      const items = data.snippets.filter((item) => item.groupId === groupId)
      this.validateOrder(items.map((item) => item.id), orderedIds)
      const positions = new Map(orderedIds.map((id, index) => [id, index]))
      items.forEach((item) => { item.order = positions.get(item.id)! })
    })
  }

  async markUsed(id: string): Promise<void> {
    await this.transact((data) => {
      const item = data.snippets.find((snippet) => snippet.id === id)
      if (item) { item.useCount++; item.lastUsedAt = new Date().toISOString() }
    }, false)
  }

  createGroup(name: string): Promise<AppData> {
    return this.transact((data) => {
      if (data.groups.length >= 1000) throw new Error('最多支持 1000 个分组')
      const clean = this.validateGroupName(data, name)
      data.groups.push({ id: randomUUID(), name: clean, order: Math.max(-1, ...data.groups.map((group) => group.order)) + 1 })
    })
  }

  renameGroup(id: string, name: string): Promise<AppData> {
    return this.transact((data) => {
      const group = data.groups.find((item) => item.id === id)
      if (!group) throw new Error('分组不存在')
      group.name = this.validateGroupName(data, name, id)
    })
  }

  deleteGroup(id: string): Promise<AppData> {
    return this.transact((data) => {
      if (data.groups.length <= 1) throw new Error('至少需要保留一个分组')
      if (!data.groups.some((group) => group.id === id)) return
      const fallback = [...data.groups].sort((a, b) => a.order - b.order).find((group) => group.id !== id)!
      let nextOrder = this.nextOrder(data, fallback.id)
      data.snippets.filter((item) => item.groupId === id).sort((a, b) => a.order - b.order).forEach((item) => {
        item.groupId = fallback.id; item.order = nextOrder++
      })
      data.groups = data.groups.filter((group) => group.id !== id)
    })
  }

  reorderGroups(orderedIds: string[]): Promise<AppData> {
    return this.transact((data) => {
      this.validateOrder(data.groups.map((group) => group.id), orderedIds)
      const positions = new Map(orderedIds.map((id, index) => [id, index]))
      data.groups.forEach((group) => { group.order = positions.get(group.id)! })
    })
  }

  updateSettings(patch: Partial<Pick<Settings, 'hotkey' | 'hotkeyMode' | 'openAtLogin'>>): Promise<AppData> {
    return this.transact((data) => {
      if (patch.hotkey !== undefined) {
        if (typeof patch.hotkey !== 'string' || !isValidHotkey(patch.hotkey)) throw new Error('快捷键不合法')
        data.settings.hotkey = patch.hotkey
      }
      if (patch.hotkeyMode !== undefined) {
        if (!isHotkeyMode(patch.hotkeyMode)) throw new Error('快捷键交互模式不合法')
        data.settings.hotkeyMode = patch.hotkeyMode
      }
      if (patch.openAtLogin !== undefined) {
        if (typeof patch.openAtLogin !== 'boolean') throw new Error('开机启动设置不合法')
        data.settings.openAtLogin = patch.openAtLogin
      }
    })
  }

  async importLibrary(incoming: LibraryData, duplicates: 'skip' | 'keep'): Promise<{ added: number; skipped: number }> {
    if (duplicates !== 'skip' && duplicates !== 'keep') throw new Error('请选择重复项处理方式')
    const library = parseLibrary(incoming)
    let result = { added: 0, skipped: 0 }
    await this.transact((data) => { result = this.merge(data, library, duplicates) })
    return result
  }

  completeOnboarding(withSamples: boolean): Promise<AppData> {
    return this.transact((data) => {
      if (withSamples === true) this.merge(data, sampleLibrary, 'skip')
      data.settings.onboardingCompleted = true
    })
  }

  async listBackups(): Promise<BackupInfo[]> {
    let names: string[]
    try { names = await readdir(this.backupDirectory) }
    catch (error) { if (missing(error)) return []; throw error }
    const entries: BackupInfo[] = []
    for (const id of names.filter((name) => backupName.test(name)).sort().reverse()) {
      try {
        const data = this.migrate(JSON.parse(await readFile(join(this.backupDirectory, id), 'utf8')))
        entries.push({ id, createdAt: new Date(Number(id.slice(0, 13))).toISOString(), snippetCount: data.snippets.length, groupCount: data.groups.length })
      } catch { /* A damaged backup is never offered for restoration. */ }
    }
    return entries
  }

  restoreBackup(id: string): Promise<AppData> {
    if (typeof id !== 'string' || !backupName.test(id)) return Promise.reject(new Error('备份标识无效'))
    // Read inside the queue so a concurrent save cannot prune the selected file mid-restore.
    const operation = this.saveQueue.catch(() => undefined).then(async () => {
      const restored = this.migrate(JSON.parse(await readFile(join(this.backupDirectory, id), 'utf8')))
      restored.settings = clone(this.data.settings)
      await this.backupCurrent()
      await this.writeAtomic(this.filePath, JSON.stringify(restored, null, 2))
      this.data = restored
      await this.pruneBackups().catch(() => undefined)
      return this.snapshot()
    })
    this.saveQueue = operation
    return operation
  }

  private merge(data: AppData, incoming: LibraryData, duplicates: 'skip' | 'keep'): { added: number; skipped: number } {
    const groupMap = new Map<string, string>()
    for (const group of [...incoming.groups].sort((a, b) => a.order - b.order)) {
      let target = data.groups.find((item) => item.name.toLocaleLowerCase('zh-CN') === group.name.toLocaleLowerCase('zh-CN'))
      if (!target) {
        target = { id: randomUUID(), name: group.name, order: Math.max(-1, ...data.groups.map((item) => item.order)) + 1 }
        data.groups.push(target)
      }
      groupMap.set(group.id, target.id)
    }
    let added = 0; let skipped = 0
    const now = new Date().toISOString()
    for (const item of [...incoming.snippets].sort((a, b) => a.order - b.order)) {
      const groupId = groupMap.get(item.groupId)!
      if (duplicates === 'skip' && data.snippets.some((current) => current.groupId === groupId && current.content === item.content)) { skipped++; continue }
      data.snippets.push({ ...item, id: randomUUID(), groupId, order: this.nextOrder(data, groupId), useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now })
      added++
    }
    if (data.groups.length > 1000 || data.snippets.length > 10000) throw new Error('合并后超出容量：最多 1000 个分组和 10000 条文本')
    return { added, skipped }
  }

  private nextOrder(data: AppData, groupId: string): number {
    return Math.max(-1, ...data.snippets.filter((item) => item.groupId === groupId).map((item) => item.order)) + 1
  }

  private validateOrder(current: string[], incoming: string[]): void {
    if (!Array.isArray(incoming) || incoming.length !== current.length || new Set(incoming).size !== current.length || incoming.some((id) => !current.includes(id))) throw new Error('列表已变化，请重试排序')
  }

  private validateGroupName(data: AppData, name: string, currentId?: string): string {
    if (typeof name !== 'string' || !name.trim()) throw new Error('分组名称不能为空')
    const clean = name.trim()
    if (clean.length > 100) throw new Error('分组名称不能超过 100 个字符')
    if (data.groups.some((item) => item.id !== currentId && item.name.toLocaleLowerCase('zh-CN') === clean.toLocaleLowerCase('zh-CN'))) throw new Error('分组名称已存在')
    return clean
  }

  private migrate(raw: unknown): AppData {
    const library = parseLibrary(raw)
    const settings = (raw as Partial<AppData>).settings
    if (settings && settings.dataVersion > DATA_VERSION) throw new Error('数据版本过新')
    const hotkey = typeof settings?.hotkey === 'string' && isValidHotkey(settings.hotkey) ? settings.hotkey : DEFAULT_HOTKEY
    const hotkeyMode = isHotkeyMode(settings?.hotkeyMode) && (settings.hotkeyMode !== 'hold' || hotkeyVirtualKeyGroups(hotkey)) ? settings.hotkeyMode : DEFAULT_HOTKEY_MODE
    return { ...library, settings: {
      hotkey, hotkeyMode,
      openAtLogin: settings?.openAtLogin === true, dataVersion: DATA_VERSION,
      onboardingCompleted: typeof settings?.onboardingCompleted === 'boolean' ? settings.onboardingCompleted : library.snippets.length > 0
    } }
  }

  private async backupCurrent(): Promise<void> {
    await mkdir(this.backupDirectory, { recursive: true })
    this.lastBackupTime = Math.max(Date.now(), this.lastBackupTime + 1)
    await this.writeAtomic(join(this.backupDirectory, `${this.lastBackupTime}-${randomUUID()}.json`), JSON.stringify(this.data, null, 2))
  }

  private async pruneBackups(): Promise<void> {
    const names = (await readdir(this.backupDirectory)).filter((name) => backupName.test(name)).sort().reverse()
    await Promise.all(names.slice(MAX_BACKUPS).map((name) => unlink(join(this.backupDirectory, name))))
  }

  private async writeAtomic(path: string, payload: string): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`
    try { await writeFile(temporary, payload, 'utf8'); await rename(temporary, path) }
    finally { await unlink(temporary).catch(() => undefined) }
  }
}
