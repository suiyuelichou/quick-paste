import { app, BrowserWindow, dialog, globalShortcut, nativeTheme } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const directory = resolve('.smoke', randomUUID())
await mkdir(directory, { recursive: true })
app.setPath('userData', directory)
app.setName('Quick Paste Smoke')
app.disableHardwareAcceleration()
nativeTheme.themeSource = 'light'
// Exercise actual windows/preload/IPC without taking focus or registering user hotkeys.
globalShortcut.register = () => true
globalShortcut.isRegistered = () => true
app.on('browser-window-created', (_event, window) => {
  console.log('Created smoke window', window.id)
  window.webContents.on('did-finish-load', () => console.log('Loaded', window.webContents.getURL()))
  window.webContents.on('did-fail-load', (_event, code, description) => console.error('Load failed', code, description))
  window.webContents.on('console-message', (event) => { if (event.level === 'error') console.error('Renderer:', event.message) })
  window.show = () => {}
  window.focus = () => {}
  window.webContents.setBackgroundThrottling(false)
})
dialog.showErrorBox = (title, message) => { console.error(title, message); app.exit(1) }
await import('../out/main/index.js')

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
async function until(check, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await delay(80)
  }
  throw new Error(`Timed out: ${label}`)
}

async function runSmoke() {
try {
  let manager
  await until(() => {
    manager = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('view=manager'))
    return manager && !manager.webContents.isLoading()
  }, 'manager load')
  const js = async (source) => {
    try { return await manager.webContents.executeJavaScript(source) }
    catch (error) { console.error('Failed script:', source); throw error }
  }
  const click = (label) => js(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button'); button.click(); })()`)
  const capture = async (name) => {
    await delay(200)
    const { width, height } = manager.getContentBounds()
    const snapshot = await manager.webContents.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true, stayAwake: true })
    if (snapshot.isEmpty()) throw new Error(`Empty screenshot: ${name}`)
    await writeFile(resolve(directory, `${name}.png`), snapshot.toPNG())
  }
  await until(() => js('!!document.querySelector(".onboarding-page")'), 'onboarding')
  await capture('onboarding')
  await click('添加 6 条示例')
  await until(() => js('window.quickPaste.getData().then(data => data.snippets.length === 6)'), 'samples committed')
  await click('进入文本库')
  await until(() => js('!document.querySelector(".manager-content").hidden'), 'library visible')
  await until(() => js('!!document.querySelector(".snippet-list button")'), 'sample group selected')
  await js('document.querySelector(".snippet-list button").click()')
  await until(() => js('document.querySelector(".content-field textarea").value.length > 0'), 'editor loaded')
  await capture('library')
  const picker = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('view=picker'))
  await until(() => picker.webContents.executeJavaScript('document.querySelectorAll(".wheel-segment").length === 6'), 'wheel samples')
  await picker.webContents.capturePage({ x: 0, y: 0, width: 560, height: 560 }, { stayHidden: true })
  await delay(300)
  const wheelImage = await picker.webContents.capturePage({ x: 0, y: 0, width: 560, height: 560 }, { stayHidden: true })
  assert.equal(wheelImage.isEmpty(), false)
  await writeFile(resolve(directory, 'wheel.png'), wheelImage.toPNG())
  await js(`(() => {
    const input = document.querySelector('.content-field textarea')
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '草稿保护测试')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await click('新增')
  await until(() => js('!!document.querySelector("dialog[open]")'), 'unsaved prompt')
  await capture('draft-confirm')
  await click('取消')
  assert.equal(await js('document.querySelector(".content-field textarea").value'), '草稿保护测试')
  await click('设置')
  await until(() => js('!!document.querySelector(".backup-list")'), 'settings')
  await capture('settings')
  const exportedPath = resolve(directory, 'export.json')
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportedPath })
  assert.equal(await js('window.quickPaste.exportLibrary()'), true)
  const exported = JSON.parse(await readFile(exportedPath, 'utf8'))
  assert.equal(exported.snippets.length, 6)
  assert.equal(exported.settings, undefined)
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportedPath] })
  await click('导入 JSON')
  await until(() => js('!!document.querySelector("dialog[open]")'), 'import preview')
  await capture('import-preview')
  await click('确认导入')
  await until(() => js('!document.querySelector("dialog[open]")'), 'import complete')
  assert.equal(await js('window.quickPaste.getData().then(data => data.snippets.length)'), 6)
  await click('文本库')
  assert.equal(await js('document.querySelector(".content-field textarea").value'), '草稿保护测试')
  manager.setSize(920, 620)
  await capture('library-small')
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true)
  nativeTheme.themeSource = 'dark'
  await capture('library-dark')
  const snapshot = await js('window.quickPaste.getData()')
  await js(`window.quickPaste.saveSnippet(${JSON.stringify({ ...snapshot.snippets[0], content: '用于验证恢复的修改' })})`)
  const backups = await js('window.quickPaste.listBackups()')
  await js(`window.quickPaste.restoreBackup(${JSON.stringify(backups[0].id)})`)
  assert.equal(await js('window.quickPaste.getData().then(data => data.snippets[0].content)'), snapshot.snippets[0].content)
  await new Promise((done) => { manager.webContents.once('did-finish-load', done); manager.webContents.reload() })
  await until(() => js('document.querySelector(".content-field textarea")?.value === "草稿保护测试"'), 'draft after reload')
  await writeFile(resolve(directory, 'report.json'), JSON.stringify({ ok: true, checks: ['onboarding', 'samples', 'fixed-wheel', 'draft-confirm', 'draft-across-settings', 'export', 'import-preview', 'duplicate-skip', 'minimum-window-width', 'restore-backup', 'draft-after-reload'], screenshotDirectory: directory }, null, 2))
  console.log(`Electron smoke passed. Screenshots: ${directory}`)
  app.quit()
} catch (error) {
  console.error('Windows:', BrowserWindow.getAllWindows().map((window) => ({ url: window.webContents.getURL(), loading: window.webContents.isLoading() })))
  console.error(error)
  await writeFile(resolve(directory, 'failure.txt'), String(error))
  app.exit(1)
}
}
void runSmoke()
