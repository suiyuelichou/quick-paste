import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppData, SnippetInput } from '../../../shared/types'
import { snippetLabel } from '../../../shared/search'
import { EditIcon, GripIcon, PlusIcon, SearchIcon, StarIcon, TrashIcon } from './Icons'
import { emptyDraft, snippetDraft, type AsyncRunner } from './Manager'
import { useDialog } from './Dialog'
import { readDraft, writeDraft } from '../draft'

export function SnippetManager({ data, run }: { data: AppData; run: AsyncRunner }): JSX.Element {
  const groups = useMemo(() => [...data.groups].sort((a, b) => a.order - b.order), [data.groups])
  const [recovered] = useState(readDraft)
  const firstGroupId = groups.find((group) => data.snippets.some((item) => item.groupId === group.id))?.id ?? groups[0]?.id ?? ''
  const [groupId, setGroupId] = useState(recovered?.groupId ?? firstGroupId)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<SnippetInput>(() => recovered ?? emptyDraft(firstGroupId))
  const [dirty, setDirty] = useState(!!recovered)
  const [draftStored, setDraftStored] = useState(true)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const previousCount = useRef(data.snippets.length)
  const { confirm, prompt, dialog } = useDialog()
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null)

  useEffect(() => {
    if (!groups.some((group) => group.id === groupId) && groups[0]) setGroupId(groups[0].id)
  }, [groups, groupId])

  useEffect(() => {
    if (previousCount.current === 0 && data.snippets.length > 0 && !dirty && !editing.id) {
      setGroupId(firstGroupId); setEditing(emptyDraft(firstGroupId))
    }
    previousCount.current = data.snippets.length
  }, [data.snippets, firstGroupId, dirty, editing.id])

  useEffect(() => {
    // Keep a dirty draft when a backup restore replaces its source record.
    setEditing((current) => {
      const group = groups.some((item) => item.id === current.groupId) ? current.groupId : groups[0]?.id ?? ''
      const item = data.snippets.find((item) => item.id === current.id)
      if (dirty) return { ...current, groupId: group, id: item?.id }
      return item ? snippetDraft(item) : emptyDraft(group)
    })
  }, [data, groups, dirty])

  useEffect(() => { setDraftStored(writeDraft(dirty ? editing : null)) }, [editing, dirty])

  const leaveDraft = async (): Promise<boolean> => !saving.current && (!dirty || await confirm('有未保存的修改。放弃当前草稿并继续？'))

  const items = useMemo(() => data.snippets
    .filter((item) => item.groupId === groupId && (!query.trim() || item.content.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN'))))
    .sort((a, b) => a.order - b.order), [data.snippets, groupId, query])

  const chooseGroup = async (id: string): Promise<void> => {
    if (id === groupId || !await leaveDraft()) return
    setGroupId(id); setEditing(emptyDraft(id)); setDirty(false)
  }
  const addSnippet = async (): Promise<void> => { if (await leaveDraft()) { setEditing(emptyDraft(groupId)); setDirty(false) } }
  const selectSnippet = async (id: string): Promise<void> => {
    if (id === editing.id || !await leaveDraft()) return
    const item = data.snippets.find((entry) => entry.id === id)
    if (item) { setEditing(snippetDraft(item)); setDirty(false) }
  }
  const updateDraft = <K extends keyof SnippetInput>(key: K, value: SnippetInput[K]): void => { setEditing((current) => ({ ...current, [key]: value })); setDirty(true) }

  const addGroup = async (): Promise<void> => {
    const name = (await prompt('新分组名称'))?.trim()
    if (name) await run(() => window.quickPaste.createGroup(name))
  }
  const renameGroup = async (): Promise<void> => {
    const group = groups.find((item) => item.id === groupId)
    if (!group) return
    const name = (await prompt('修改分组名称', group.name))?.trim()
    if (name && name !== group.name) await run(() => window.quickPaste.renameGroup(group.id, name))
  }
  const deleteGroup = async (): Promise<void> => {
    const group = groups.find((item) => item.id === groupId)
    if (!group || !await confirm(`删除分组“${group.name}”？其中的文本将移动到其他分组，当前草稿会保留。`)) return
    await run(() => window.quickPaste.deleteGroup(group.id))
  }
  const save = async (): Promise<void> => {
    if (saving.current || !editing.content.trim()) return
    saving.current = true; setBusy(true)
    const previousIds = new Set(data.snippets.map((item) => item.id))
    try {
      const result = await run(() => window.quickPaste.saveSnippet(editing))
      if (result) {
        const saved = editing.id ? result.snippets.find((item) => item.id === editing.id) : result.snippets.find((item) => !previousIds.has(item.id) && item.content === editing.content && item.groupId === editing.groupId)
        if (saved) { setEditing(snippetDraft(saved)); setDirty(false); writeDraft(null) }
      }
    } finally { saving.current = false; setBusy(false) }
  }
  const remove = async (): Promise<void> => {
    if (!editing.id || !await confirm(`确定删除“${snippetLabel(editing.content)}”及其当前草稿吗？删除前会自动备份。`)) return
    const result = await run(() => window.quickPaste.deleteSnippet(editing.id!))
    if (result) { setEditing(emptyDraft(groupId)); setDirty(false) }
  }

  const dropSnippet = async (overId: string): Promise<void> => {
    if (!draggedId || draggedId === overId || query) return
    const ids = items.map((item) => item.id)
    const from = ids.indexOf(draggedId); const to = ids.indexOf(overId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDraggedId(null)
    await run(() => window.quickPaste.reorderSnippets(groupId, ids))
  }
  const dropGroup = async (overId: string): Promise<void> => {
    if (!draggedGroup || draggedGroup === overId) return
    const ids = groups.map((item) => item.id)
    const from = ids.indexOf(draggedGroup); const to = ids.indexOf(overId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDraggedGroup(null)
    await run(() => window.quickPaste.reorderGroups(ids))
  }

  return <main className="library-layout" aria-busy={busy} onKeyDown={(event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
  }}>
    <section className="group-column">
      <div className="column-heading"><span>分组</span><button disabled={busy} title="新增分组" onClick={() => void addGroup()}><PlusIcon size={17}/></button></div>
      <div className="group-list">
        {groups.map((group) => <button key={group.id} disabled={busy} draggable={!busy} onDragStart={() => setDraggedGroup(group.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => void dropGroup(group.id)} className={groupId === group.id ? 'active' : ''} onClick={() => void chooseGroup(group.id)}>
          <GripIcon size={15}/><span>{group.name}</span><small>{data.snippets.filter((item) => item.groupId === group.id).length}</small>
        </button>)}
      </div>
      <p className="order-note">拖动分组和文本可调整轮盘顺序。使用后位置保持不变。</p>
      <button className="secondary export-group" onClick={() => void run(() => window.quickPaste.exportLibrary(groupId))}>导出当前分组</button>
      <div className="group-actions"><button disabled={busy} onClick={() => void renameGroup()}><EditIcon size={14}/>重命名</button><button disabled={busy || groups.length <= 1} onClick={() => void deleteGroup()}><TrashIcon size={14}/>删除</button></div>
    </section>
    <section className="snippet-column">
      <div className="column-heading"><span>{groups.find((group) => group.id === groupId)?.name}</span><button disabled={busy} className="primary-mini" onClick={() => void addSnippet()}><PlusIcon size={16}/>新增</button></div>
      <label className="list-search"><SearchIcon size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索当前分组"/></label>
      <div className="snippet-list">
        {items.map((item) => <button key={item.id} disabled={busy} draggable={!query && !busy} onDragStart={() => setDraggedId(item.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => void dropSnippet(item.id)} className={editing.id === item.id ? 'active' : ''} onClick={() => void selectSnippet(item.id)}>
          <span className="drag-handle"><GripIcon size={16}/></span><span className="snippet-summary"><strong>{item.favorite && <StarIcon size={13}/>} {snippetLabel(item.content)}</strong><small>{item.content.replace(/\s+/g, ' ')}</small></span>
        </button>)}
        {!items.length && <div className="list-empty">{query ? '没有匹配内容' : '这个分组还没有文本'}</div>}
      </div>
    </section>
    <section className="editor-column">
      <div className="editor-heading"><div><span className="eyebrow">{editing.id ? '编辑文本' : '新建文本'}</span><h1>{editing.id ? snippetLabel(editing.content) || '空文本' : '添加常用内容'}</h1></div>{editing.id && <button disabled={busy} className="danger-icon" title="删除文本" onClick={() => void remove()}><TrashIcon/></button>}</div>
      <fieldset className="editor-form" disabled={busy}>
        <label className="group-field"><span>所属分组</span><select value={editing.groupId} onChange={(e) => updateDraft('groupId', e.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className="content-field"><span>文本正文</span><textarea value={editing.content} onChange={(e) => updateDraft('content', e.target.value)} placeholder="输入需要快速粘贴的纯文本…" spellCheck={false}/><small>{editing.content.length.toLocaleString()} 个字符 · 支持中文、Emoji 和多行文本</small></label>
        <label className="favorite-toggle"><input type="checkbox" checked={editing.favorite} onChange={(e) => updateDraft('favorite', e.target.checked)}/><span className="toggle"/><span><strong>收藏</strong><small>搜索时优先显示，不改变轮盘位置</small></span></label>
      </fieldset>
      <footer className="editor-footer"><span role="status">{busy ? '正在保存…' : dirty ? draftStored ? '草稿已保留，尚未保存到文本库' : '草稿保留失败，请立即保存' : editing.id ? '所有修改已保存' : '填写文本内容后保存'}<br/>Ctrl + S 保存</span><button className="primary" disabled={busy || !editing.content.trim()} onClick={() => void save()}>{editing.id ? '保存修改' : '创建文本'}</button></footer>
    </section>
    {dialog}
  </main>
}
