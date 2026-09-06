import { describe, expect, it } from 'vitest'
import { isValidHotkey, rankSnippets, snippetLabel } from './search'
import type { Group, Snippet } from './types'

const groups: Group[] = [
  { id: 'work', name: '工作', order: 0 },
  { id: 'life', name: '生活', order: 1 }
]

const snippet = (patch: Partial<Snippet> & Pick<Snippet, 'id' | 'content'>): Snippet => ({
  groupId: 'work', favorite: false, order: 0, useCount: 0, lastUsedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...patch
})

describe('rankSnippets', () => {
  it('空搜索时收藏优先，其后按最近使用和次数排序', () => {
    const values = [
      snippet({ id: 'old', content: 'A', useCount: 20, lastUsedAt: '2026-01-01T00:00:00.000Z' }),
      snippet({ id: 'recent', content: 'B', useCount: 1, lastUsedAt: '2026-08-01T00:00:00.000Z' }),
      snippet({ id: 'favorite', content: 'C', favorite: true })
    ]
    expect(rankSnippets(values, groups, '').map((item) => item.id)).toEqual(['favorite', 'recent', 'old'])
  })

  it('搜索依次匹配首行开头、首行包含、分组和完整正文', () => {
    const values = [
      snippet({ id: 'content', content: '普通内容\n这里有地址' }),
      snippet({ id: 'group', content: '普通内容', groupId: 'life' }),
      snippet({ id: 'contains', content: '公司地址和电话' }),
      snippet({ id: 'starts', content: '地址信息\n更多内容' })
    ]
    expect(rankSnippets(values, [{ ...groups[1], name: '地址分组' }, groups[0]], '地址').map((item) => item.id))
      .toEqual(['starts', 'contains', 'group', 'content'])
  })

  it('可限制在指定分组内', () => {
    const values = [snippet({ id: 'a', content: '1' }), snippet({ id: 'b', content: '2', groupId: 'life' })]
    expect(rankSnippets(values, groups, '', 'life').map((item) => item.id)).toEqual(['b'])
  })
})

describe('snippetLabel', () => {
  it('取正文第一行并限制为十四个字符', () => {
    expect(snippetLabel('  第一行标签\n第二行不会显示')).toBe('第一行标签')
    expect(snippetLabel('一二三四五六七八九十甲乙丙丁戊')).toBe('一二三四五六七八九十甲乙丙丁…')
  })
})

describe('isValidHotkey', () => {
  it.each(['Ctrl+Alt+Space', 'Ctrl+Shift+K', 'Super+F2'])('接受有效组合 %s', (value) => expect(isValidHotkey(value)).toBe(true))
  it.each(['Space', 'Ctrl+Alt', '', 'F2'])('拒绝无修饰键或无普通键的组合 %s', (value) => expect(isValidHotkey(value)).toBe(false))
})
