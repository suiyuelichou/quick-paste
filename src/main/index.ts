import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron'
import { join } from 'node:path'
import { DataStore } from './store'
import { setupLibraryIpc } from './library-ipc'
import { captureTarget, typeIntoTarget } from './input-helper'
import { isValidHotkey } from '../shared/search'
import { clampPickerPosition, PICKER_SIZE } from '../shared/wheel'
import type { AppData, PasteResult, SettingsUpdateResult, SnippetInput } from '../shared/types'

let pickerWindow: BrowserWindow | null = null
let managerWindow: BrowserWindow | null = null
let tray: Tray | null = null
let store: DataStore
let targetHandle: string | null = null
let currentHotkey = ''
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

function trayIcon(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="3" y="4" width="26" height="24" rx="7" fill="#6657e8"/><path d="M10 11h12M10 16h9M10 21h6" stroke="white" stroke-width="2.4" stroke-linecap="round"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 20, height: 20 })
}

function loadWindow(window: BrowserWindow, view: 'picker' | 'manager', section?: string): void {
  const query = new URLSearchParams({ view })
  if (section) query.set('section', section)
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${query}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query: Object.fromEntries(query) })
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

function createPicker(): BrowserWindow {
  if (pickerWindow && !pickerWindow.isDestroyed()) return pickerWindow
  pickerWindow = new BrowserWindow({
    width: PICKER_SIZE,
    height: PICKER_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  loadWindow(pickerWindow, 'picker')
  pickerWindow.on('blur', () => {
    setTimeout(() => {
      if (pickerWindow && !pickerWindow.isDestroyed() && !pickerWindow.isFocused()) dismissPicker()
    }, 80)
  })
  pickerWindow.on('closed', () => { pickerWindow = null })
  return pickerWindow
}

function dismissPicker(): void {
  pickerWindow?.hide()
  targetHandle = null
}

function createManager(section: 'snippets' | 'settings' = 'snippets'): BrowserWindow {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show()
    managerWindow.focus()
    managerWindow.webContents.send('manager:navigate', section)
    return managerWindow
  }
  managerWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'Quick Paste',
    backgroundColor: '#f6f6fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  loadWindow(managerWindow, 'manager', section)
  managerWindow.once('ready-to-show', () => managerWindow?.show())
  managerWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      managerWindow?.hide()
    }
  })
  managerWindow.on('closed', () => { managerWindow = null })
  return managerWindow
}

async function showPicker(): Promise<void> {
  if (pickerWindow?.isVisible()) {
    dismissPicker()
    return
  }
  const captured = await captureTarget()
  if (!captured.ok || !captured.handle) {
    notify('无法打开选择器', '没有找到可输入的目标窗口。')
    return
  }
  targetHandle = captured.handle
  const picker = createPicker()
  const cursor = screen.getCursorScreenPoint()
  const workArea = screen.getDisplayNearestPoint(cursor).workArea
  const position = clampPickerPosition(cursor, workArea)
  picker.setPosition(position.x, position.y)
  picker.show()
  picker.focus()
  picker.webContents.send('picker:shown')
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body }).show()
}

function broadcast(data: AppData): void {
  for (const window of [pickerWindow, managerWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('data:changed', data)
  }
  rebuildTray()
}

function registerHotkey(hotkey: string): boolean {
  if (currentHotkey === hotkey && globalShortcut.isRegistered(hotkey)) return true
  if (currentHotkey) globalShortcut.unregister(currentHotkey)
  const registered = globalShortcut.register(hotkey, () => { void showPicker() })
  if (registered) currentHotkey = hotkey
  return registered
}

async function updateSettings(patch: { hotkey?: string; openAtLogin?: boolean }): Promise<SettingsUpdateResult> {
  const oldSettings = store.snapshot().settings
  if (patch.hotkey !== undefined) {
    if (!isValidHotkey(patch.hotkey)) return { ok: false, settings: oldSettings, message: '快捷键必须包含修饰键和普通按键' }
    if (!registerHotkey(patch.hotkey)) {
      registerHotkey(oldSettings.hotkey)
      return { ok: false, settings: oldSettings, message: '快捷键已被其他应用占用，请换一个组合' }
    }
  }
  let data: AppData
  try { data = await store.updateSettings(patch) }
  catch {
    if (patch.hotkey !== undefined) registerHotkey(oldSettings.hotkey)
    return { ok: false, settings: oldSettings, message: '设置保存失败，请检查磁盘空间和数据目录权限后重试' }
  }
  if (patch.openAtLogin !== undefined) {
    app.setLoginItemSettings({ openAtLogin: patch.openAtLogin, path: process.execPath, args: ['--hidden'] })
  }
  broadcast(data)
  return { ok: true, settings: data.settings }
}

function rebuildTray(): void {
  if (!tray) return
  const settings = store.snapshot().settings
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开选择器', accelerator: settings.hotkey, click: () => { void showPicker() } },
    { label: '管理常用文本', click: () => createManager('snippets') },
    { label: '设置', click: () => createManager('settings') },
    { type: 'separator' },
    { label: '开机启动', type: 'checkbox', checked: settings.openAtLogin, click: (item) => { void updateSettings({ openAtLogin: item.checked }) } },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } }
  ]))
}

function setupIpc(): void {
  setupLibraryIpc(store, broadcast)
  ipcMain.handle('data:get', () => store.snapshot())
  ipcMain.handle('snippet:save', async (_event, input: SnippetInput) => {
    const data = await store.saveSnippet(input); broadcast(data); return data
  })
  ipcMain.handle('snippet:delete', async (_event, id: string) => {
    const data = await store.deleteSnippet(id); broadcast(data); return data
  })
  ipcMain.handle('snippet:reorder', async (_event, groupId: string, ids: string[]) => {
    const data = await store.reorderSnippets(groupId, ids); broadcast(data); return data
  })
  ipcMain.handle('snippet:paste', async (_event, id: string): Promise<PasteResult> => {
    const item = store.snapshot().snippets.find((snippet) => snippet.id === id)
    if (!item || !targetHandle) return { ok: false, code: 'target_missing', message: '原输入窗口已关闭' }
    const handle = targetHandle
    pickerWindow?.hide()
    targetHandle = null
    const result = await typeIntoTarget(handle, item.content)
    if (result.ok) {
      await store.markUsed(id).catch(() => notify('使用记录保存失败', '文本已输入成功，无需重复输入。请检查磁盘空间和数据目录权限。'))
      broadcast(store.snapshot())
    } else {
      const messages: Record<string, string> = {
        target_missing: '原输入窗口已关闭。',
        elevated_target: '目标应用以管理员身份运行，当前权限无法向其中输入。',
        focus_failed: '无法重新聚焦原输入窗口。',
        input_failed: 'Windows 拒绝了本次文本输入。',
        helper_failed: '原生输入助手运行失败。'
      }
      notify('粘贴失败', messages[result.code ?? 'helper_failed'] ?? '无法完成文本输入。')
    }
    return result
  })
  ipcMain.handle('group:create', async (_event, name: string) => { const data = await store.createGroup(name); broadcast(data); return data })
  ipcMain.handle('group:rename', async (_event, id: string, name: string) => { const data = await store.renameGroup(id, name); broadcast(data); return data })
  ipcMain.handle('group:delete', async (_event, id: string) => { const data = await store.deleteGroup(id); broadcast(data); return data })
  ipcMain.handle('group:reorder', async (_event, ids: string[]) => { const data = await store.reorderGroups(ids); broadcast(data); return data })
  ipcMain.handle('settings:update', (_event, patch: { hotkey?: string; openAtLogin?: boolean }) => updateSettings(patch))
  ipcMain.handle('picker:hide', () => { dismissPicker() })
  ipcMain.handle('manager:open', (_event, section: 'snippets' | 'settings' = 'snippets') => {
    dismissPicker()
    createManager(section)
  })
}

if (gotLock) {
  app.on('second-instance', () => createManager('snippets'))
  app.whenReady().then(async () => {
    store = new DataStore(join(app.getPath('userData'), 'quick-paste-data.json'))
    await store.load()
    if (store.recoveryMessage) dialog.showMessageBoxSync({ type: 'warning', title: '已恢复备份', message: store.recoveryMessage })
    setupIpc()
    tray = new Tray(trayIcon())
    tray.setToolTip('Quick Paste · 快速输入常用文本')
    tray.on('double-click', () => { void showPicker() })
    rebuildTray()
    if (!registerHotkey(store.snapshot().settings.hotkey)) notify('快捷键注册失败', '默认快捷键已被占用，请在设置中修改。')
    createPicker()
    if (!process.argv.includes('--hidden')) createManager('snippets')
  }).catch((error: unknown) => {
    dialog.showErrorBox('Quick Paste 无法启动', error instanceof Error ? error.message : '无法读取本地数据')
    app.quit()
  })

  app.on('activate', () => createManager('snippets'))
  let flushed = false
  app.on('before-quit', (event) => {
    quitting = true
    if (store && !flushed) {
      event.preventDefault()
      void store.flush().catch(() => undefined).finally(() => { flushed = true; app.quit() })
    }
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => { /* 托盘应用保持运行 */ })
}
