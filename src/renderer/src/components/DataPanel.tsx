import { useEffect, useRef, useState } from 'react'
import type { AppData, BackupInfo, ImportPreview } from '../../../shared/types'
import type { AsyncRunner } from './Manager'
import { Modal, useDialog } from './Dialog'

export function DataPanel({ data, run, setMessage }: { data: AppData; run: AsyncRunner; setMessage: (message: string) => void }): JSX.Element {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [duplicates, setDuplicates] = useState<'skip' | 'keep'>('skip')
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const { confirm, dialog } = useDialog()
  useEffect(() => {
    let mounted = true
    void run(() => window.quickPaste.listBackups()).then((items) => { if (mounted && items) setBackups(items) })
    return () => { mounted = false }
  }, [data])

  const work = async (task: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try { await run(task) } finally { busyRef.current = false; setBusy(false) }
  }
  const chooseFile = (): Promise<void> => work(async () => {
    const result = await window.quickPaste.previewImport()
    setPreview(result); setDuplicates('skip')
  })
  const importFile = (): Promise<void> => work(async () => {
    if (!preview) return
    const result = await window.quickPaste.applyImport(preview.token, duplicates)
    setPreview(null)
    setMessage(`导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条重复文本`)
  })
  const restore = async (backup: BackupInfo): Promise<void> => {
    if (!await confirm(`恢复到 ${new Date(backup.createdAt).toLocaleString()} 的文本库（${backup.snippetCount} 条文本）？当前文本库会先备份，快捷键和开机启动设置保持不变。未保存的编辑草稿会保留。`)) return
    await work(async () => { await window.quickPaste.restoreBackup(backup.id); setMessage('文本库已恢复；如需撤回，可恢复刚刚生成的备份') })
  }
  return <>
    <section className="settings-card">
      <div className="setting-copy"><strong>导入与导出</strong><p>分享模板包，或将文本库迁移到另一台电脑。导出仅包含已保存的文本和分组，不包含设置、草稿和使用记录。</p></div>
      <div className="button-row">
        <button className="primary" disabled={busy} onClick={() => void chooseFile()}>导入 JSON</button>
        <button className="secondary" disabled={busy} onClick={() => void work(async () => { if (await window.quickPaste.exportLibrary()) setMessage('文本库已导出') })}>导出全部文本</button>
      </div>
    </section>
    <section className="settings-card">
      <div className="setting-copy"><strong>自动备份</strong><p>编辑、删除、导入或恢复前自动备份，保留最近 10 份。单纯使用文本不会挤掉备份；建议定期导出到其他磁盘。</p></div>
      <div className="backup-list">
        {backups.length ? backups.map((backup) => <div className="backup-row" key={backup.id}>
          <div><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{backup.groupCount} 个分组 · {backup.snippetCount} 条文本</small></div>
          <button className="secondary" disabled={busy} onClick={() => void restore(backup)}>恢复</button>
        </div>) : <p className="muted">还没有备份，首次修改文本库时会自动创建。</p>}
      </div>
    </section>
    {preview && <Modal title="导入预览" onCancel={() => { if (!busy) setPreview(null) }}>
      <p className="file-name">{preview.name}</p>
      <p>共 {preview.groups.length} 个分组、{preview.total} 条文本，预计 {preview.duplicates} 条重复。</p>
      <div className="import-groups">{preview.groups.map((group) => <div key={group.name}><span>{group.name}</span><small>{group.count} 条</small></div>)}</div>
      <p className="muted">同名分组合并；同一分组内正文完全相同视为重复。现有文本不会被覆盖，实际数量以导入结果为准。</p>
      <label className="field-label">重复文本<select disabled={busy} value={duplicates} onChange={(event) => setDuplicates(event.target.value as 'skip' | 'keep')}><option value="skip">跳过重复文本（推荐）</option><option value="keep">保留为新条目</option></select></label>
      <div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => setPreview(null)}>取消</button><button className="primary" disabled={busy} onClick={() => void importFile()}>{busy ? '正在导入…' : '确认导入'}</button></div>
    </Modal>}
    {dialog}
  </>
}
