import { useEffect, useState } from 'react'
import type { AppData } from '../../../shared/types'
import type { AsyncRunner } from './Manager'
import { DataPanel } from './DataPanel'

function accelerator(event: React.KeyboardEvent): string | null {
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')
  const modifierKeys = new Set(['Control', 'Alt', 'Shift', 'Meta'])
  if (modifierKeys.has(event.key)) return null
  let key = event.code === 'Space' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  if (/^Arrow/.test(key)) key = key.replace('Arrow', '')
  return modifiers.length && key ? [...modifiers, key].join('+') : null
}

export function SettingsPanel({ data, run, setMessage }: { data: AppData; run: AsyncRunner; setMessage: (message: string) => void }): JSX.Element {
  const settings = data.settings
  const [hotkey, setHotkey] = useState(settings.hotkey)
  const [recording, setRecording] = useState(false)
  useEffect(() => setHotkey(settings.hotkey), [settings.hotkey])

  const saveHotkey = async (): Promise<void> => {
    const result = await run(() => window.quickPaste.updateSettings({ hotkey }))
    setRecording(false)
    if (!result) return
    if (!result.ok) { setHotkey(result.settings.hotkey); setMessage(result.message ?? '快捷键设置失败') }
    else setMessage('快捷键已更新')
  }
  const toggleLogin = async (value: boolean): Promise<void> => {
    const result = await run(() => window.quickPaste.updateSettings({ openAtLogin: value }))
    if (!result) return
    setMessage(result.ok ? (value ? '已开启开机启动' : '已关闭开机启动') : result.message ?? '设置失败')
  }

  return <main className="settings-page">
    <header><span className="eyebrow">应用偏好</span><h1>设置</h1><p>调整 Quick Paste 的唤起方式与后台行为。</p></header>
    <section className="settings-card">
      <div className="setting-copy"><strong>全局快捷键</strong><p>在任意普通应用中按下快捷键，快速打开文本选择器。</p></div>
      <div className="hotkey-row">
        <button className={`hotkey-recorder ${recording ? 'recording' : ''}`} onClick={() => setRecording(true)} onKeyDown={(event) => {
          if (!recording) return
          event.preventDefault(); event.stopPropagation()
          if (event.key === 'Escape') { setRecording(false); setHotkey(settings.hotkey); return }
          const value = accelerator(event); if (value) setHotkey(value)
        }}>{recording ? '请按下组合键…' : hotkey.replaceAll('+', '  +  ')}</button>
        <button className="primary" disabled={hotkey === settings.hotkey} onClick={() => void saveHotkey()}>应用</button>
      </div>
      <small className="setting-note">快捷键至少包含一个修饰键；不会占用单独的 Tab 键。若组合已被其他程序占用，当前设置不会改变。</small>
    </section>
    <section className="settings-card setting-line">
      <div className="setting-copy"><strong>开机时自动启动</strong><p>登录 Windows 后在系统托盘静默运行，选择器随时可用。</p></div>
      <label className="switch"><input type="checkbox" checked={settings.openAtLogin} onChange={(e) => void toggleLogin(e.target.checked)}/><span/></label>
    </section>
    <section className="settings-card notice-card"><div className="notice-icon">i</div><div><strong>本地数据与兼容性</strong><p>所有文本仅以未加密 JSON 文件保存在本机，不会上传，也不会读取或修改系统剪贴板。本工具不应作为密码管理器使用；管理员权限窗口、安全输入框、游戏及远程桌面可能拒绝自动输入。</p></div></section>
    <DataPanel data={data} run={run} setMessage={setMessage}/>
    <footer className="about-row"><span>Quick Paste</span><span>版本 1.1.0 · Windows x64</span></footer>
  </main>
}
