// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataStore } from './store'
import { DATA_VERSION } from '../shared/types'
import { sampleLibrary } from '../shared/samples'

const temporaryPaths: string[] = []
afterEach(async () => Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

async function makeStore(): Promise<{ store: DataStore; file: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'quick-paste-test-'))
  temporaryPaths.push(directory)
  const file = join(directory, 'data.json')
  const store = new DataStore(file)
  await store.load()
  return { store, file }
}

describe('DataStore', () => {
  it('首次创建默认分组并将数据写入 JSON', async () => {
    const { store, file } = await makeStore()
    expect(store.snapshot().groups).toHaveLength(1)
    expect(JSON.parse(await readFile(file, 'utf8')).settings.dataVersion).toBe(DATA_VERSION)
    expect(store.snapshot().settings.hotkeyMode).toBe('toggle')
  })

  it('新增、更新、排序并删除文本', async () => {
    const { store } = await makeStore()
    const groupId = store.snapshot().groups[0].id
    await store.saveSnippet({ content: '第一条', groupId, favorite: false })
    await store.saveSnippet({ content: '第二条', groupId, favorite: true })
    const [first, second] = store.snapshot().snippets
    await store.reorderSnippets(groupId, [second.id, first.id])
    expect(store.snapshot().snippets.find((item) => item.id === second.id)?.order).toBe(0)
    await store.saveSnippet({ id: first.id, content: '已修改的新正文', groupId, favorite: true })
    expect(store.snapshot().snippets.find((item) => item.id === first.id)?.content).toBe('已修改的新正文')
    await store.deleteSnippet(second.id)
    expect(store.snapshot().snippets.map((item) => item.id)).toEqual([first.id])
  })

  it('只在成功调用 markUsed 后记录使用次数', async () => {
    const { store } = await makeStore()
    const groupId = store.snapshot().groups[0].id
    await store.saveSnippet({ content: '正文', groupId, favorite: false })
    const id = store.snapshot().snippets[0].id
    expect(store.snapshot().snippets[0].useCount).toBe(0)
    await store.markUsed(id)
    expect(store.snapshot().snippets[0].useCount).toBe(1)
    expect(store.snapshot().snippets[0].lastUsedAt).not.toBeNull()
  })

  it('删除分组时将其中条目迁移到保留分组', async () => {
    const { store } = await makeStore()
    await store.createGroup('工作')
    const [, work] = store.snapshot().groups
    await store.saveSnippet({ content: '你好', groupId: work.id, favorite: false })
    await store.deleteGroup(work.id)
    const snapshot = store.snapshot()
    expect(snapshot.groups).toHaveLength(1)
    expect(snapshot.snippets[0].groupId).toBe(snapshot.groups[0].id)
  })

  it('加载旧数据时保留正文并移除标题字段', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-paste-test-'))
    temporaryPaths.push(directory)
    const file = join(directory, 'data.json')
    await writeFile(file, JSON.stringify({
      groups: [{ id: 'g1', name: '默认分组', order: 0 }],
      snippets: [{ id: 's1', title: '旧标题', content: '保留的正文', groupId: 'g1', favorite: false, order: 0, useCount: 0, lastUsedAt: null, createdAt: '', updatedAt: '' }],
      settings: { hotkey: 'Ctrl+Alt+Space', openAtLogin: false, dataVersion: 1 }
    }), 'utf8')
    const store = new DataStore(file)
    await store.load()
    expect(store.snapshot().snippets[0].content).toBe('保留的正文')
    expect(store.snapshot().snippets[0]).not.toHaveProperty('title')
    expect(store.snapshot().settings.dataVersion).toBe(DATA_VERSION)
    expect(store.snapshot().settings.hotkeyMode).toBe('toggle')
    await store.renameGroup('g1', '新分组')
    expect(JSON.parse(await readFile(file, 'utf8')).settings.dataVersion).toBe(DATA_VERSION)
  })

  it('写入失败不更改内存和磁盘，解除故障后可继续保存且不产生重复条目', async () => {
    const { store, file } = await makeStore()
    const groupId = store.snapshot().groups[0].id
    await store.saveSnippet({ content: '原内容', groupId, favorite: false })
    const before = store.snapshot()
    await rename(file, `${file}.saved`)
    // A directory at the destination forces the final atomic rename to fail.
    const { mkdir, rmdir } = await import('node:fs/promises')
    await mkdir(file)
    await expect(store.saveSnippet({ content: '新内容', groupId, favorite: false })).rejects.toThrow()
    expect(store.snapshot()).toEqual(before)
    expect(JSON.parse(await readFile(`${file}.saved`, 'utf8'))).toEqual(before)
    await rmdir(file)
    await rename(`${file}.saved`, file)
    await store.saveSnippet({ content: '新内容', groupId, favorite: false })
    expect(store.snapshot().snippets.map((item) => item.content)).toEqual(['原内容', '新内容'])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(store.snapshot())
  })

  it('串行处理并发修改，失败操作不会污染下一次操作', async () => {
    const { store } = await makeStore()
    await Promise.all([store.createGroup('A'), store.createGroup('B')])
    const results = await Promise.allSettled([store.createGroup('A'), store.createGroup('C')])
    expect(results.map((item) => item.status)).toEqual(['rejected', 'fulfilled'])
    expect(store.snapshot().groups.map((group) => group.name)).toEqual(['默认分组', 'A', 'B', 'C'])
  })

  it('备份创建失败时不修改内存或主文件，解除故障后可重试', async () => {
    const { store, file } = await makeStore()
    const before = store.snapshot()
    const originalFile = await readFile(file, 'utf8')
    // A file occupying the backup-directory path makes mkdir fail on Windows too.
    await writeFile(`${file}.backups`, 'fictional obstruction')
    const input = { content: '备份失败测试', groupId: before.groups[0].id, favorite: false }
    await expect(store.saveSnippet(input)).rejects.toThrow()
    expect(store.snapshot()).toEqual(before)
    expect(await readFile(file, 'utf8')).toBe(originalFile)
    await unlink(`${file}.backups`)
    await store.saveSnippet(input)
    expect(store.snapshot().snippets).toHaveLength(1)
    const [backup] = await store.listBackups()
    expect(JSON.parse(await readFile(join(`${file}.backups`, backup.id), 'utf8'))).toEqual(before)
  })

  it('恢复写入失败保留当前库和所选备份，重试成功后仍能撤回恢复', async () => {
    const { store, file } = await makeStore()
    const groupId = store.snapshot().groups[0].id
    await store.saveSnippet({ content: '备份中的文本', groupId, favorite: false })
    const id = store.snapshot().snippets[0].id
    await store.saveSnippet({ id, content: '当前文本', groupId, favorite: false })
    const before = store.snapshot()
    const [selected] = await store.listBackups()
    const backupPath = join(`${file}.backups`, selected.id)
    const backupContents = await readFile(backupPath, 'utf8')
    await rename(file, `${file}.saved`)
    await mkdir(file)
    await expect(store.restoreBackup(selected.id)).rejects.toThrow()
    expect(store.snapshot()).toEqual(before)
    expect(JSON.parse(await readFile(`${file}.saved`, 'utf8'))).toEqual(before)
    expect(await readFile(backupPath, 'utf8')).toBe(backupContents)
    await rmdir(file)
    await rename(`${file}.saved`, file)
    await store.restoreBackup(selected.id)
    expect(store.snapshot().snippets[0].content).toBe('备份中的文本')
    const [undo] = await store.listBackups()
    await store.restoreBackup(undo.id)
    expect(store.snapshot()).toEqual(before)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(before)
  })

  it('所选备份损坏时拒绝恢复且不修改当前库', async () => {
    const { store, file } = await makeStore()
    await store.createGroup('产生备份')
    const before = store.snapshot()
    const [selected] = await store.listBackups()
    await writeFile(join(`${file}.backups`, selected.id), '{broken')
    await expect(store.restoreBackup(selected.id)).rejects.toThrow()
    expect(store.snapshot()).toEqual(before)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(before)
    expect(await store.listBackups()).toEqual([])
  })

  it('保留十份备份，使用记录不轮换备份，恢复前再备份且保留设置', async () => {
    const { store } = await makeStore()
    const groupId = store.snapshot().groups[0].id
    await store.saveSnippet({ content: '原文', groupId, favorite: false })
    const id = store.snapshot().snippets[0].id
    for (let index = 0; index < 12; index++) await store.saveSnippet({ id, content: `版本${index}`, groupId, favorite: false })
    await store.updateSettings({ hotkey: 'Ctrl+Shift+J', hotkeyMode: 'hold' })
    const backups = await store.listBackups()
    expect(backups).toHaveLength(10)
    await store.markUsed(id)
    expect(await store.listBackups()).toEqual(backups)
    await store.restoreBackup(backups[1].id)
    expect(store.snapshot().snippets[0].content).toBe('版本10')
    expect(store.snapshot().settings.hotkey).toBe('Ctrl+Shift+J')
    expect(store.snapshot().settings.hotkeyMode).toBe('hold')
    const latest = (await store.listBackups())[0]
    await store.restoreBackup(latest.id)
    expect(store.snapshot().snippets[0].content).toBe('版本11')
    await expect(store.restoreBackup('../data.json')).rejects.toThrow('备份标识无效')
  })

  it('损坏文件保留原件并恢复最新有效备份', async () => {
    const { store, file } = await makeStore()
    const groupId = store.snapshot().groups[0].id
    await store.saveSnippet({ content: '可恢复内容', groupId, favorite: false })
    await store.createGroup('触发备份')
    await writeFile(file, '{broken', 'utf8')
    const recovered = new DataStore(file)
    await recovered.load()
    expect(recovered.snapshot().snippets[0].content).toBe('可恢复内容')
    expect(recovered.recoveryMessage).toContain('恢复')
    const files = await readdir(join(file, '..'))
    expect(files.some((name) => name.includes('.corrupt-'))).toBe(true)
  })

  it('较新版本数据不覆盖、不隔离', async () => {
    const { store, file } = await makeStore()
    const data = store.snapshot(); data.settings.dataVersion = 999
    await writeFile(file, JSON.stringify(data))
    await expect(new DataStore(file).load()).rejects.toThrow('较新版本')
    expect(JSON.parse(await readFile(file, 'utf8')).settings.dataVersion).toBe(999)
  })

  it('导入同名分组合并、跳过重复或保留副本，并重建 ID 和使用记录', async () => {
    const { store } = await makeStore()
    expect(await store.importLibrary(sampleLibrary, 'skip')).toEqual({ added: 6, skipped: 0 })
    expect(await store.importLibrary(sampleLibrary, 'skip')).toEqual({ added: 0, skipped: 6 })
    expect(await store.importLibrary(sampleLibrary, 'keep')).toEqual({ added: 6, skipped: 0 })
    const data = store.snapshot()
    expect(data.groups).toHaveLength(2)
    expect(new Set(data.snippets.map((item) => item.id)).size).toBe(12)
    expect(data.snippets.every((item) => item.useCount === 0 && !item.id.startsWith('sample-'))).toBe(true)
  })

  it('非法导入保持原数据，示例添加幂等且记住引导完成', async () => {
    const { store, file } = await makeStore()
    const before = store.snapshot()
    await expect(store.importLibrary({ ...sampleLibrary, snippets: [{ ...sampleLibrary.snippets[0], groupId: 'missing' }] }, 'skip')).rejects.toThrow()
    expect(store.snapshot()).toEqual(before)
    await store.completeOnboarding(true)
    await store.completeOnboarding(true)
    const reloaded = new DataStore(file); await reloaded.load()
    expect(reloaded.snapshot().snippets).toHaveLength(6)
    expect(reloaded.snapshot().settings.onboardingCompleted).toBe(true)
  })
})
