import type { LibraryData, Snippet } from './types'

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

/** Validate before any mutation. Old full-data exports and library-only packages are accepted. */
export function parseLibrary(value: unknown): LibraryData {
  if (!record(value) || !Array.isArray(value.groups) || !value.groups.length || !Array.isArray(value.snippets)) {
    throw new Error('文件格式不正确：需要 groups 和 snippets 数组，且至少有一个分组')
  }
  if (value.format !== undefined && value.format !== 'quick-paste-library') throw new Error('不支持此模板格式')
  if (value.version !== undefined && value.version !== 1) throw new Error('此模板版本较新，请先升级 Quick Paste')
  if (value.groups.length > 1000 || value.snippets.length > 10000) throw new Error('文件过大：最多支持 1000 个分组和 10000 条文本')
  const groupIds = new Set<string>()
  const groupNames = new Set<string>()
  const groups = value.groups.map((group, index) => {
    if (!record(group) || !text(group.id) || !text(group.name) || group.name.length > 100) throw new Error('分组数据不完整')
    const name = group.name.trim()
    if (groupIds.has(group.id) || groupNames.has(name.toLocaleLowerCase('zh-CN'))) throw new Error('文件含有重复分组')
    groupIds.add(group.id); groupNames.add(name.toLocaleLowerCase('zh-CN'))
    return { id: group.id, name, order: Number.isFinite(group.order) ? Number(group.order) : index }
  })
  const snippetIds = new Set<string>()
  const snippets: Snippet[] = value.snippets.map((item, index) => {
    if (!record(item) || !text(item.id) || !text(item.content) || item.content.length > 100000 || !text(item.groupId) || !groupIds.has(item.groupId)) {
      throw new Error('文本数据不完整、过长或引用了不存在的分组')
    }
    if (snippetIds.has(item.id)) throw new Error('文件含有重复文本 ID')
    snippetIds.add(item.id)
    return {
      id: item.id, content: item.content, groupId: item.groupId, favorite: item.favorite === true,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
      useCount: Number.isFinite(item.useCount) ? Math.max(0, Number(item.useCount)) : 0,
      lastUsedAt: typeof item.lastUsedAt === 'string' && Number.isFinite(Date.parse(item.lastUsedAt)) ? item.lastUsedAt : null,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
    }
  })
  return { groups, snippets }
}

export function exportLibrary(data: LibraryData, groupId?: string): object {
  const groups = data.groups.filter((group) => !groupId || group.id === groupId).sort((a, b) => a.order - b.order)
  if (!groups.length) throw new Error('所选分组不存在')
  const ids = new Set(groups.map((group) => group.id))
  return {
    format: 'quick-paste-library', version: 1,
    groups,
    // Sharing a library never exports preferences or usage history.
    snippets: data.snippets.filter((item) => ids.has(item.groupId)).map(({ id, content, groupId: group, favorite, order }) => ({ id, content, groupId: group, favorite, order }))
  }
}

export function duplicateCount(current: LibraryData, incoming: LibraryData): number {
  const names = new Map(current.groups.map((group) => [group.id, group.name.toLocaleLowerCase('zh-CN')]))
  const incomingNames = new Map(incoming.groups.map((group) => [group.id, group.name.toLocaleLowerCase('zh-CN')]))
  const key = (name: string | undefined, content: string): string => JSON.stringify([name, content])
  const seen = new Set(current.snippets.map((item) => key(names.get(item.groupId), item.content)))
  let duplicates = 0
  for (const item of incoming.snippets) {
    const identity = key(incomingNames.get(item.groupId), item.content)
    if (seen.has(identity)) duplicates++
    seen.add(identity)
  }
  return duplicates
}
