import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, QuickPasteApi } from '../../../shared/types'
import { sampleLibrary } from '../../../shared/samples'
import { Manager } from './Manager'
import { DRAFT_KEY } from '../draft'

const data: AppData = {
  groups: sampleLibrary.groups,
  snippets: sampleLibrary.snippets,
  settings: { hotkey: 'Ctrl+Alt+Space', hotkeyMode: 'toggle', openAtLogin: false, dataVersion: 4, onboardingCompleted: true }
}

beforeEach(() => {
  localStorage.clear()
  window.quickPaste = {
    onManagerNavigate: vi.fn(() => () => undefined), listBackups: vi.fn().mockResolvedValue([]),
    onUpdateState: vi.fn(() => () => undefined),
    getUpdateState: vi.fn().mockResolvedValue({ phase: 'unsupported', currentVersion: '1.1.1', message: '开发模式不检查更新。' }),
    checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn(),
    updateSettings: vi.fn().mockImplementation(async (patch) => ({ ok: true, settings: { ...data.settings, ...patch } })),
    saveSnippet: vi.fn(), exportLibrary: vi.fn().mockResolvedValue(true),
    completeOnboarding: vi.fn().mockResolvedValue(data),
    previewImport: vi.fn().mockResolvedValue({ token: 'preview', name: 'templates.json', groups: [{ name: '上手示例', count: 6 }], total: 6, duplicates: 6 }),
    applyImport: vi.fn().mockResolvedValue({ added: 0, skipped: 6 })
  } as unknown as QuickPasteApi
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const editor = (): HTMLElement => screen.getByPlaceholderText('输入需要快速粘贴的纯文本…')

describe('文本管理数据保护', () => {
  it('取消离开保留草稿，确认后才切换条目', async () => {
    render(<Manager data={data}/>)
    fireEvent.change(editor(), { target: { value: '不要丢失的草稿' } })
    fireEvent.click(screen.getByRole('button', { name: /你好，已收到/ }))
    const modal = await screen.findByRole('dialog', { name: '请确认' })
    fireEvent.click(within(modal).getByRole('button', { name: '取消' }))
    expect(editor()).toHaveValue('不要丢失的草稿')
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).content).toBe('不要丢失的草稿')
    fireEvent.click(screen.getByRole('button', { name: /你好，已收到/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '确定' }))
    await waitFor(() => expect(editor()).toHaveValue(data.snippets[0].content))
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull())
  })

  it('切换设置和重新挂载都保留草稿', async () => {
    const view = render(<Manager data={data}/>)
    fireEvent.change(editor(), { target: { value: '重启后仍在' } })
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByText('导入与导出')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '文本库' }))
    expect(editor()).toHaveValue('重启后仍在')
    view.unmount()
    render(<Manager data={data}/>)
    expect(editor()).toHaveValue('重启后仍在')
  })

  it('保存失败保留草稿，Ctrl+S 可以重试', async () => {
    vi.mocked(window.quickPaste.saveSnippet).mockRejectedValueOnce(new Error('磁盘已满')).mockResolvedValueOnce(data)
    render(<Manager data={data}/>)
    fireEvent.click(screen.getByRole('button', { name: /你好，已收到/ }))
    await waitFor(() => expect(editor()).toHaveValue(data.snippets[0].content))
    fireEvent.change(editor(), { target: { value: '修改后的草稿' } })
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true })
    expect(await screen.findByText('磁盘已满')).toBeInTheDocument()
    expect(editor()).toHaveValue('修改后的草稿')
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).content).toBe('修改后的草稿')
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true })
    await waitFor(() => expect(window.quickPaste.saveSnippet).toHaveBeenCalledTimes(2))
  })

  it('备份恢复移除源条目时，草稿转为新文本且可继续保存', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: data.snippets[0].id, groupId: 'removed-group', content: '需要保留', favorite: false }))
    render(<Manager data={{ ...data, snippets: [] }}/>)
    expect(editor()).toHaveValue('需要保留')
    await waitFor(() => {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)!)
      expect(draft.id).toBeUndefined()
      expect(draft.groupId).toBe(data.groups[0].id)
    })
  })

  it('本地草稿写入失败时保留编辑内容和旧草稿，恢复存储后可继续保留', async () => {
    const oldDraft = { groupId: data.groups[0].id, content: '原有草稿', favorite: false }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(oldDraft))
    render(<Manager data={data}/>)
    const draftStatus = screen.getByRole('status')
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    fireEvent.change(editor(), { target: { value: '尚未落盘的新草稿' } })
    expect(draftStatus).toHaveTextContent('草稿保留失败，请立即保存')
    expect(editor()).toHaveValue('尚未落盘的新草稿')
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).content).toBe('原有草稿')
    vi.mocked(window.quickPaste.saveSnippet).mockRejectedValueOnce(new Error('磁盘已满'))
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true })
    expect(await screen.findByText('磁盘已满')).toBeInTheDocument()
    expect(editor()).toHaveValue('尚未落盘的新草稿')
    write.mockRestore()
    fireEvent.change(editor(), { target: { value: '存储恢复后的草稿' } })
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).content).toBe('存储恢复后的草稿'))
    expect(draftStatus).toHaveTextContent('草稿已保留，尚未保存到文本库')
  })
})

describe('导入与上手引导', () => {
  it('首次添加示例后自动选择有内容的分组', async () => {
    const empty: AppData = { ...data, groups: [{ id: 'default', name: '默认分组', order: 0 }], snippets: [] }
    const view = render(<Manager data={empty}/>)
    view.rerender(<Manager data={{ ...data, groups: [...empty.groups, ...data.groups] }}/>)
    await waitFor(() => expect(screen.getByRole('button', { name: /你好，已收到/ })).toBeInTheDocument())
  })
  it('先预览，取消不修改数据，确认才执行所选重复策略', async () => {
    render(<Manager data={data}/>)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '导入 JSON' }))
    const modal = await screen.findByRole('dialog', { name: '导入预览' })
    expect(within(modal).getByText('templates.json')).toBeInTheDocument()
    expect(window.quickPaste.applyImport).not.toHaveBeenCalled()
    fireEvent.click(within(modal).getByRole('button', { name: '取消' }))
    expect(window.quickPaste.applyImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '导入 JSON' }))
    const next = await screen.findByRole('dialog', { name: '导入预览' })
    fireEvent.change(within(next).getByLabelText('重复文本'), { target: { value: 'keep' } })
    fireEvent.click(within(next).getByRole('button', { name: '确认导入' }))
    await waitFor(() => expect(window.quickPaste.applyImport).toHaveBeenCalledWith('preview', 'keep'))
    expect(await screen.findByText(/导入完成/)).toBeInTheDocument()
  })

  it('新用户看到练习页，可跳过示例进入空文本库', async () => {
    render(<Manager data={{ ...data, snippets: [], settings: { ...data.settings, onboardingCompleted: false } }}/>)
    expect(screen.getByRole('heading', { name: '把常用文本放在鼠标旁边' })).toBeInTheDocument()
    expect(screen.getByLabelText('练习输入框')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '进入文本库' }))
    await waitFor(() => expect(window.quickPaste.completeOnboarding).toHaveBeenCalledWith(false))
    await waitFor(() => expect(screen.getByRole('button', { name: '创建文本' })).toBeVisible())
  })
})

describe('应用更新', () => {
  it('发现版本后由用户主动下载', async () => {
    vi.mocked(window.quickPaste.getUpdateState).mockResolvedValue({ phase: 'available', currentVersion: '1.1.1', availableVersion: '1.2.0', message: '发现新版本 1.2.0' })
    vi.mocked(window.quickPaste.downloadUpdate).mockResolvedValue({ phase: 'downloading', currentVersion: '1.1.1', availableVersion: '1.2.0', progress: 0, message: '正在下载更新 0%' })
    render(<Manager data={data}/>)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByText('发现新版本 1.2.0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下载更新' }))
    await waitFor(() => expect(window.quickPaste.downloadUpdate).toHaveBeenCalledOnce())
    expect(screen.getByRole('progressbar', { name: '更新下载进度' })).toBeInTheDocument()
  })
})

describe('快捷键唤起方式', () => {
  it('可以切换为按住显示并立即保存', async () => {
    render(<Manager data={data}/>)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByRole('radio', { name: /按一下打开/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /按住显示/ }))
    await waitFor(() => expect(window.quickPaste.updateSettings).toHaveBeenCalledWith({ hotkeyMode: 'hold' }))
    expect(screen.getByRole('radio', { name: /按住显示/ })).toBeChecked()
    expect(screen.getByText('已切换为按住显示')).toBeInTheDocument()
  })

  it('保存失败时恢复原唤起方式', async () => {
    vi.mocked(window.quickPaste.updateSettings).mockResolvedValueOnce({ ok: false, settings: data.settings, message: '虚构的保存失败' })
    render(<Manager data={data}/>)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('radio', { name: /按住显示/ }))
    expect(await screen.findByText('虚构的保存失败')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /按一下打开/ })).toBeChecked()
  })
})
