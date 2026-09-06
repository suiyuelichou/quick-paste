import type { Group, Snippet } from './types'

const normalize = (value: string): string => value.trim().toLocaleLowerCase('zh-CN')

export function snippetLabel(content: string, maxLength = 14): string {
  const firstLine = content.trim().split(/\r?\n/, 1)[0].replace(/\s+/g, ' ').trim()
  return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength)}…` : firstLine
}

function usageCompare(a: Snippet, b: Snippet): number {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
  const aTime = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0
  const bTime = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0
  if (aTime !== bTime) return bTime - aTime
  if (a.useCount !== b.useCount) return b.useCount - a.useCount
  return a.order - b.order
}

/** Wheel positions depend only on explicit library order, never on usage or favorites. */
export function orderWheelSnippets(snippets: Snippet[], groups: Group[]): Snippet[] {
  const positions = new Map([...groups].sort((a, b) => a.order - b.order).map((group, index) => [group.id, index]))
  return [...snippets].sort((a, b) => (positions.get(a.groupId) ?? 0) - (positions.get(b.groupId) ?? 0) || a.order - b.order)
}

export function rankSnippets(snippets: Snippet[], groups: Group[], query: string, groupId?: string): Snippet[] {
  const filtered = groupId ? snippets.filter((item) => item.groupId === groupId) : snippets.slice()
  const needle = normalize(query)
  if (!needle) return filtered.sort(usageCompare)

  const groupNames = new Map(groups.map((group) => [group.id, normalize(group.name)]))
  const score = (item: Snippet): number => {
    const label = normalize(snippetLabel(item.content))
    if (label.startsWith(needle)) return 0
    if (label.includes(needle)) return 1
    if ((groupNames.get(item.groupId) ?? '').includes(needle)) return 2
    if (normalize(item.content).includes(needle)) return 3
    return 99
  }

  return filtered
    .map((item) => ({ item, score: score(item) }))
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || usageCompare(a.item, b.item))
    .map(({ item }) => item)
}

export function isValidHotkey(value: string): boolean {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  const modifiers = new Set(['Ctrl', 'Control', 'Alt', 'Shift', 'Super', 'Meta', 'CommandOrControl'])
  return parts.length >= 2 && parts.some((part) => modifiers.has(part)) && parts.some((part) => !modifiers.has(part))
}
