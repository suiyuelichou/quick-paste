import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Picker } from './Picker'
import type { AppData, QuickPasteApi, Snippet } from '../../../shared/types'

const snippet = (id: string, content: string, order: number, favorite = false): Snippet => ({
  id, content, groupId: 'g1', favorite, order, useCount: 0, lastUsedAt: null, createdAt: '', updatedAt: ''
})

const data: AppData = {
  groups: [{ id: 'g1', name: '工作', order: 0 }],
  snippets: [
    { ...snippet('s1', '上海市测试路 1 号', 0, true), useCount: 3 },
    snippet('s2', '你好，很高兴认识你', 1)
  ],
  settings: { hotkey: 'Ctrl+Alt+Space', openAtLogin: false, dataVersion: 2 }
}

const manyData: AppData = {
  ...data,
  snippets: Array.from({ length: 10 }, (_, index) => snippet(`s${index + 1}`, `常用文本${index + 1}`, index))
}

function mockApi(): QuickPasteApi {
  return {
    getData: vi.fn(), saveSnippet: vi.fn(), deleteSnippet: vi.fn(), reorderSnippets: vi.fn(),
    pasteSnippet: vi.fn().mockResolvedValue({ ok: true }), createGroup: vi.fn(), renameGroup: vi.fn(),
    deleteGroup: vi.fn(), reorderGroups: vi.fn(), updateSettings: vi.fn(), hidePicker: vi.fn(), openManager: vi.fn(),
    onDataChanged: vi.fn(() => () => undefined), onPickerShown: vi.fn(() => () => undefined), onManagerNavigate: vi.fn(() => () => undefined)
  } as unknown as QuickPasteApi
}

describe('Picker', () => {
  beforeEach(() => { window.quickPaste = mockApi() })
  afterEach(() => cleanup())

  it('默认显示轮盘，悬停高亮并可点击输入', () => {
    render(<Picker data={data}/>)
    const segment = screen.getByRole('button', { name: '输入 上海市测试路 1 号' })
    fireEvent.mouseEnter(segment)
    expect(segment).toHaveClass('selected')
    fireEvent.click(segment)
    expect(window.quickPaste.pasteSnippet).toHaveBeenCalledWith('s1')
  })

  it('滚轮按每八项翻页并显示页码', () => {
    render(<Picker data={manyData}/>)
    expect(screen.getByText('常用文本1')).toBeInTheDocument()
    expect(screen.queryByText('常用文本9')).not.toBeInTheDocument()
    fireEvent.wheel(screen.getByTestId('wheel-picker'), { deltaY: 100 })
    expect(screen.getByText('常用文本9')).toBeInTheDocument()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('点击中央按钮打开文本库', () => {
    render(<Picker data={data}/>)
    fireEvent.click(screen.getByRole('button', { name: /编辑文本/ }))
    expect(window.quickPaste.openManager).toHaveBeenCalledWith('snippets')
  })

  it('直接键入会切换搜索列表，过滤后可按回车输入', () => {
    render(<Picker data={data}/>)
    fireEvent.keyDown(screen.getByTestId('wheel-picker'), { key: '你' })
    const search = screen.getByLabelText('搜索常用文本')
    expect(search).toHaveValue('你')
    expect(screen.getByText('你好，很高兴认识你')).toBeInTheDocument()
    expect(screen.queryByText('上海市测试路 1 号')).not.toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(window.quickPaste.pasteSnippet).toHaveBeenCalledWith('s2')
  })

  it('搜索模式按 Esc 或空查询 Backspace 返回轮盘', () => {
    const { rerender } = render(<Picker data={data}/>)
    fireEvent.keyDown(screen.getByTestId('wheel-picker'), { key: '问' })
    fireEvent.keyDown(screen.getByLabelText('搜索常用文本'), { key: 'Escape' })
    expect(screen.getByTestId('wheel-picker')).toBeInTheDocument()

    rerender(<Picker data={data}/>)
    fireEvent.keyDown(screen.getByTestId('wheel-picker'), { key: '问' })
    const search = screen.getByLabelText('搜索常用文本')
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.keyDown(search, { key: 'Backspace' })
    expect(screen.getByTestId('wheel-picker')).toBeInTheDocument()
  })

  it('轮盘模式按 Esc 关闭选择器', () => {
    render(<Picker data={data}/>)
    fireEvent.keyDown(screen.getByTestId('wheel-picker'), { key: 'Escape' })
    expect(window.quickPaste.hidePicker).toHaveBeenCalled()
  })
})
