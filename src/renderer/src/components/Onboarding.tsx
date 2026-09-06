import { useRef, useState } from 'react'
import type { AppData } from '../../../shared/types'
import { sampleLibrary } from '../../../shared/samples'
import type { AsyncRunner } from './Manager'

export function Onboarding({ data, run, onDone }: { data: AppData; run: AsyncRunner; onDone: () => void }): JSX.Element {
  const [practice, setPractice] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const hasSamples = sampleLibrary.snippets.every((sample) => data.snippets.some((item) => item.content === sample.content))
  const practiced = data.snippets.some((item) => practice.includes(item.content))
  const start = async (samples: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const result = await run(() => window.quickPaste.completeOnboarding(samples))
      if (result) { if (samples) input.current?.focus(); else onDone() }
    } finally { setBusy(false) }
  }
  return <main className="settings-page onboarding-page">
    <header><span className="eyebrow">一分钟上手</span><h1>把常用文本放在鼠标旁边</h1><p>按下快捷键，选择一句话，直接输入。原剪贴板内容依然保留。</p></header>
    <section className="settings-card">
      <div className="step-heading"><span>1</span><h2>准备几条常用文本</h2></div>
      <p className="muted">可以先试用 6 条客服、办公和提示词示例，随后自由编辑或删除。</p>
      <div className="sample-preview">{sampleLibrary.snippets.slice(0, 3).map((item) => <p key={item.id}>{item.content}</p>)}</div>
      <button className="primary" disabled={busy || hasSamples} onClick={() => void start(true)}>{hasSamples ? '示例已添加' : '添加 6 条示例'}</button>
    </section>
    <section className="settings-card">
      <div className="step-heading"><span>2</span><h2>在这里试一次</h2></div>
      <p className="muted">先点击下面的输入框，再按 <kbd>{data.settings.hotkey}</kbd>，点击轮盘中的任意文本。也可以直接输入关键词搜索。</p>
      <textarea ref={input} className="practice-input" aria-label="练习输入框" placeholder="点击这里，再按快捷键唤起轮盘…" value={practice} onChange={(event) => setPractice(event.target.value)}/>
      {practiced && <p className="success-note" role="status">输入成功！现在可以到其他普通应用的输入框中使用。</p>}
    </section>
    <section className="settings-card">
      <div className="step-heading"><span>3</span><h2>建立自己的文本库</h2></div>
      <p className="muted">拖动分组和文本调整轮盘顺序，位置不会因使用而变化。超过 8 条时滚轮翻页；按 Esc 退出。</p>
      <div className="button-row"><button className="primary" disabled={busy} onClick={() => void start(false)}>进入文本库</button><span className="muted">可跳过示例；以后从侧栏重新打开本页。</span></div>
    </section>
  </main>
}
