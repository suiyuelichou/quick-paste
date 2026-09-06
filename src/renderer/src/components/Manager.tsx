import { useEffect, useMemo, useState } from 'react'
import type { AppData, Snippet, SnippetInput } from '../../../shared/types'
import { LibraryIcon, SettingsIcon } from './Icons'
import { SnippetManager } from './SnippetManager'
import { SettingsPanel } from './SettingsPanel'
import { Onboarding } from './Onboarding'

type Section = 'snippets' | 'settings' | 'onboarding'

export function Manager({ data }: { data: AppData }): JSX.Element {
  const initial = new URLSearchParams(window.location.search).get('section') === 'settings' ? 'settings' : data.settings.onboardingCompleted === false ? 'onboarding' : 'snippets'
  const [section, setSection] = useState<Section>(initial)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => window.quickPaste.onManagerNavigate(setSection), [])
  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [message])

  const run = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    try { return await work() }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); return undefined }
  }

  return <div className="manager-shell">
    <aside className="app-sidebar">
      <div className="brand"><span className="brand-icon"><i/><i/><i/></span><span><strong>Quick Paste</strong><small>快速粘贴</small></span></div>
      <nav>
        <button className={section === 'snippets' ? 'active' : ''} onClick={() => setSection('snippets')}><LibraryIcon/>文本库</button>
        <button className={section === 'settings' ? 'active' : ''} onClick={() => setSection('settings')}><SettingsIcon/>设置</button>
        <button className={section === 'onboarding' ? 'active' : ''} onClick={() => setSection('onboarding')}><span className="guide-icon">?</span>快速上手</button>
      </nav>
      <div className="sidebar-tip"><span>全局快捷键</span><kbd>{data.settings.hotkey.replaceAll('+', ' + ')}</kbd><small>在任意普通窗口唤起</small></div>
    </aside>
    <div className="manager-content" hidden={section !== 'snippets'}><SnippetManager data={data} run={run}/></div>
    {section === 'settings' && <SettingsPanel data={data} run={run} setMessage={setMessage}/>}
    {section === 'onboarding' && <Onboarding data={data} run={run} onDone={() => setSection('snippets')}/>}
    {message && <div className="toast" role="status">{message}</div>}
  </div>
}

export type AsyncRunner = <T>(work: () => Promise<T>) => Promise<T | undefined>
export const emptyDraft = (groupId: string): SnippetInput => ({ content: '', groupId, favorite: false })
export const snippetDraft = (snippet: Snippet): SnippetInput => ({ id: snippet.id, content: snippet.content, groupId: snippet.groupId, favorite: snippet.favorite })
