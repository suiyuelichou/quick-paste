import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { duplicateCount, exportLibrary, MAX_IMPORT_BYTES, parseLibrary } from '../shared/library'
import type { AppData, ImportPreview, LibraryData } from '../shared/types'
import type { DataStore } from './store'

export function setupLibraryIpc(store: DataStore, broadcast: (data: AppData) => void): void {
  let pending: { token: string; library: LibraryData } | null = null
  let importing = false
  ipcMain.handle('library:export', async (event, groupId?: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent) throw new Error('管理窗口已关闭')
    const payload = JSON.stringify(exportLibrary(store.snapshot(), groupId), null, 2)
    const result = await dialog.showSaveDialog(parent, { title: '导出文本库', defaultPath: 'Quick-Paste-library.json', filters: [{ name: 'JSON 文本库', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return false
    const temporary = `${result.filePath}.${randomUUID()}.tmp`
    try { await writeFile(temporary, payload, 'utf8'); await rename(temporary, result.filePath) }
    finally { await unlink(temporary).catch(() => undefined) }
    return true
  })
  ipcMain.handle('library:preview', async (event): Promise<ImportPreview | null> => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent) throw new Error('管理窗口已关闭')
    pending = null
    const result = await dialog.showOpenDialog(parent, { title: '导入文本库或模板包', properties: ['openFile'], filters: [{ name: 'JSON 文本库', extensions: ['json'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const file = result.filePaths[0]
    if ((await stat(file)).size > MAX_IMPORT_BYTES) throw new Error('文件不能超过 10 MiB')
    const contents = await readFile(file)
    if (contents.byteLength > MAX_IMPORT_BYTES) throw new Error('文件不能超过 10 MiB')
    let raw: unknown
    try { raw = JSON.parse(contents.toString('utf8').replace(/^\uFEFF/, '')) }
    catch { throw new Error('无法解析 JSON，请检查文件格式') }
    const library = parseLibrary(raw)
    pending = { token: randomUUID(), library }
    return { token: pending.token, name: basename(file), total: library.snippets.length,
      duplicates: duplicateCount(store.snapshot(), library),
      groups: library.groups.map((group) => ({ name: group.name, count: library.snippets.filter((item) => item.groupId === group.id).length })) }
  })
  ipcMain.handle('library:import', async (_event, token: string, duplicates: 'skip' | 'keep') => {
    if (importing || !pending || token !== pending.token) throw new Error('导入预览已失效，请重新选择文件')
    importing = true
    try {
      const result = await store.importLibrary(pending.library, duplicates)
      pending = null
      broadcast(store.snapshot())
      return result
    } finally { importing = false }
  })
  ipcMain.handle('backup:list', () => store.listBackups())
  ipcMain.handle('backup:restore', async (_event, id: string) => {
    const data = await store.restoreBackup(id); broadcast(data); return data
  })
  ipcMain.handle('onboarding:complete', async (_event, withSamples: boolean) => {
    const data = await store.completeOnboarding(withSamples); broadcast(data); return data
  })
}
