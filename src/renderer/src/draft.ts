import type { SnippetInput } from '../../shared/types'

export const DRAFT_KEY = 'quick-paste-editor-draft-v1'
export function readDraft(): SnippetInput | null {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    if (!value || typeof value.content !== 'string' || typeof value.groupId !== 'string' || typeof value.favorite !== 'boolean' || (value.id !== undefined && typeof value.id !== 'string')) return null
    return { content: value.content, groupId: value.groupId, favorite: value.favorite, ...(value.id ? { id: value.id } : {}) }
  } catch { return null }
}

export function writeDraft(value: SnippetInput | null): boolean {
  try {
    if (value) localStorage.setItem(DRAFT_KEY, JSON.stringify(value))
    else localStorage.removeItem(DRAFT_KEY)
    return true
  } catch { return false }
}
