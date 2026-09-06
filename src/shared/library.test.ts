import { describe, expect, it } from 'vitest'
import { duplicateCount, exportLibrary, parseLibrary } from './library'
import { sampleLibrary } from './samples'
import { orderWheelSnippets } from './search'

describe('文本库交换与固定排序', () => {
  it('导出再导入完整保留正文与顺序，排除设置和使用记录', () => {
    const original = { ...sampleLibrary, settings: { hotkey: 'Ctrl+K' }, snippets: sampleLibrary.snippets.map((item) => ({ ...item, useCount: 9, lastUsedAt: '2026-01-01' })) }
    const output = exportLibrary(original)
    expect(output).not.toHaveProperty('settings')
    expect((output as { snippets: object[] }).snippets[0]).not.toHaveProperty('useCount')
    expect(parseLibrary(output).snippets.map((item) => item.content)).toEqual(sampleLibrary.snippets.map((item) => item.content))
    expect(parseLibrary(output).snippets[0].useCount).toBe(0)
  })
  it('只导出选中分组，重复项预览包含包内重复', () => {
    const combined = { groups: [...sampleLibrary.groups, { id: 'other', name: '其他', order: 1 }], snippets: sampleLibrary.snippets }
    expect(parseLibrary(exportLibrary(combined, 'other')).snippets).toHaveLength(0)
    expect(() => exportLibrary(combined, 'missing')).toThrow()
    const incoming = { ...sampleLibrary, snippets: [...sampleLibrary.snippets, { ...sampleLibrary.snippets[0], id: 'copy' }] }
    expect(duplicateCount({ groups: [], snippets: [] }, incoming)).toBe(1)
    expect(duplicateCount(sampleLibrary, incoming)).toBe(7)
  })
  it.each([null, {}, { groups: [], snippets: [] }, { ...sampleLibrary, version: 99 }, { ...sampleLibrary, snippets: [{ ...sampleLibrary.snippets[0], content: '' }] }, { ...sampleLibrary, snippets: [sampleLibrary.snippets[0], sampleLibrary.snippets[0]] }])('拒绝格式错误或不支持的文件 %#', (value) => {
    expect(() => parseLibrary(value)).toThrow()
  })
  it('使用次数、最近使用和收藏变化不移动轮盘，手动排序生效', () => {
    const snippets = sampleLibrary.snippets.map((item, index) => ({ ...item, favorite: index === 5, useCount: index * 3, lastUsedAt: '2026-09-06' }))
    expect(orderWheelSnippets(snippets, sampleLibrary.groups).map((item) => item.id)).toEqual(sampleLibrary.snippets.map((item) => item.id))
    snippets[5].order = -1
    expect(orderWheelSnippets(snippets, sampleLibrary.groups)[0].id).toBe(snippets[5].id)
  })
})
