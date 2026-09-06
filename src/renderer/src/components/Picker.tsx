import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppData, Snippet } from '../../../shared/types'
import { orderWheelSnippets, rankSnippets, snippetLabel } from '../../../shared/search'
import { getWheelPage, getWheelSector, stepWheelPage } from '../../../shared/wheel'
import { EditIcon, SearchIcon, StarIcon } from './Icons'

type PickerMode = 'wheel' | 'search'

const WHEEL_CENTER = 280
const WHEEL_INNER_RADIUS = 102
const WHEEL_OUTER_RADIUS = 248
const WHEEL_LABEL_RADIUS = 177

function polarPoint(radius: number, angle: number): { x: number; y: number } {
  const radians = angle * Math.PI / 180
  return { x: WHEEL_CENTER + radius * Math.cos(radians), y: WHEEL_CENTER + radius * Math.sin(radians) }
}

function sectorPath(index: number, count: number): string {
  const sector = getWheelSector(index, count)
  const outerStart = polarPoint(WHEEL_OUTER_RADIUS, sector.startAngle)
  const outerEnd = polarPoint(WHEEL_OUTER_RADIUS, sector.endAngle)
  const innerEnd = polarPoint(WHEEL_INNER_RADIUS, sector.endAngle)
  const innerStart = polarPoint(WHEEL_INNER_RADIUS, sector.startAngle)
  const largeArc = sector.endAngle - sector.startAngle > 180 ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${WHEEL_OUTER_RADIUS} ${WHEEL_OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${WHEEL_INNER_RADIUS} ${WHEEL_INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z'
  ].join(' ')
}

export function Picker({ data }: { data: AppData }): JSX.Element {
  const [mode, setMode] = useState<PickerMode>('wheel')
  const [query, setQuery] = useState('')
  const [groupId, setGroupId] = useState<string | undefined>()
  const [searchSelected, setSearchSelected] = useState(0)
  const [wheelSelected, setWheelSelected] = useState(-1)
  const [page, setPage] = useState(0)
  const shellRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lastWheelAt = useRef(0)

  const groups = useMemo(() => [...data.groups].sort((a, b) => a.order - b.order), [data.groups])
  const ranked = useMemo(() => orderWheelSnippets(data.snippets, data.groups), [data])
  const wheelPage = useMemo(() => getWheelPage(ranked, page), [ranked, page])
  const searchResults = useMemo(() => rankSnippets(data.snippets, data.groups, query, groupId), [data, query, groupId])

  const focusWheel = (): void => { requestAnimationFrame(() => shellRef.current?.focus()) }
  const returnToWheel = (): void => {
    setMode('wheel')
    setQuery('')
    setGroupId(undefined)
    setSearchSelected(0)
    setWheelSelected(-1)
    focusWheel()
  }

  useEffect(() => { shellRef.current?.focus() }, [])
  useEffect(() => { setSearchSelected(0) }, [query, groupId])
  useEffect(() => {
    if (page !== wheelPage.page) setPage(wheelPage.page)
    setWheelSelected(-1)
  }, [page, wheelPage.page])
  useEffect(() => window.quickPaste.onPickerShown(() => {
    setMode('wheel')
    setQuery('')
    setGroupId(undefined)
    setSearchSelected(0)
    setWheelSelected(-1)
    setPage(0)
    lastWheelAt.current = 0
    focusWheel()
  }), [])

  const paste = async (snippet: Snippet): Promise<void> => { await window.quickPaste.pasteSnippet(snippet.id) }

  const openSearch = (firstCharacter: string): void => {
    setMode('search')
    setQuery(firstCharacter)
    setGroupId(undefined)
    setSearchSelected(0)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (mode === 'search') {
      if (event.key === 'Escape' || (event.key === 'Backspace' && !query)) {
        event.preventDefault()
        returnToWheel()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSearchSelected((value) => Math.min(value + 1, searchResults.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSearchSelected((value) => Math.max(value - 1, 0))
      }
      if (event.key === 'Enter' && searchResults[searchSelected]) {
        event.preventDefault()
        void paste(searchResults[searchSelected])
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      void window.quickPaste.hidePicker()
      return
    }
    if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && wheelPage.items.length) {
      event.preventDefault()
      setWheelSelected((value) => value < 0 ? 0 : (value + 1) % wheelPage.items.length)
      return
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && wheelPage.items.length) {
      event.preventDefault()
      setWheelSelected((value) => value < 0 ? wheelPage.items.length - 1 : (value - 1 + wheelPage.items.length) % wheelPage.items.length)
      return
    }
    if (event.key === 'Enter' && wheelPage.items[wheelSelected]) {
      event.preventDefault()
      void paste(wheelPage.items[wheelSelected])
      return
    }
    if (event.key.length === 1 && event.key.trim() && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault()
      openSearch(event.key)
    }
  }

  const onWheel = (event: React.WheelEvent): void => {
    if (Math.abs(event.deltaY) < 10 || wheelPage.totalPages <= 1) return
    event.preventDefault()
    const now = Date.now()
    if (now - lastWheelAt.current < 180) return
    lastWheelAt.current = now
    setPage((current) => stepWheelPage(current, event.deltaY, ranked.length))
  }

  if (mode === 'search') {
    return <main ref={shellRef} className="picker-shell search-mode" onKeyDown={onKeyDown} data-testid="search-picker">
      <header className="picker-search">
        <button className="search-back" aria-label="返回轮盘" onClick={returnToWheel}>‹</button>
        <SearchIcon size={21}/>
        <input ref={searchRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索常用文本…" aria-label="搜索常用文本" />
        <kbd>ESC</kbd>
      </header>
      <nav className="group-pills" aria-label="分组筛选">
        <button className={!groupId ? 'active' : ''} onClick={() => setGroupId(undefined)}>全部</button>
        {groups.map((group) => <button key={group.id} className={groupId === group.id ? 'active' : ''} onClick={() => setGroupId(group.id)}>{group.name}</button>)}
      </nav>
      <section className="picker-results">
        {searchResults.length ? searchResults.map((item, index) => {
          const group = data.groups.find((entry) => entry.id === item.groupId)
          const label = snippetLabel(item.content)
          const preview = item.content.replace(/\s+/g, ' ').trim()
          return <button key={item.id} className={`picker-item ${index === searchSelected ? 'selected' : ''}`} onMouseEnter={() => setSearchSelected(index)} onClick={() => void paste(item)}>
            <span className="picker-item-main">
              <span className="picker-title">{item.favorite && <span className="favorite"><StarIcon size={15}/></span>}{label}</span>
              {preview !== label && <span className="picker-preview">{preview}</span>}
            </span>
            <span className="picker-meta"><span>{group?.name}</span>{item.useCount > 0 && <small>{item.useCount} 次</small>}</span>
          </button>
        }) : <div className="picker-empty">
          <div className="empty-mark">⌁</div>
          <strong>没有匹配的内容</strong>
          <p>换个关键词试试，或按 Esc 返回轮盘</p>
        </div>}
      </section>
      <footer className="picker-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 输入</span><span>不会修改系统剪贴板</span></footer>
    </main>
  }

  return <main ref={shellRef} tabIndex={-1} className="picker-shell wheel-mode" onKeyDown={onKeyDown} onWheel={onWheel} data-testid="wheel-picker">
    <div className="wheel-hint"><SearchIcon size={14}/><span>直接输入关键词即可搜索</span><kbd>ESC</kbd></div>
    <svg className="wheel-sectors" viewBox="0 0 560 560" aria-label="常用文本轮盘">
      <circle className="wheel-shadow" cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={WHEEL_OUTER_RADIUS}/>
      {wheelPage.items.map((item, index) => {
        const position = polarPoint(WHEEL_LABEL_RADIUS, getWheelSector(index, wheelPage.items.length).middleAngle)
        return <g
          key={item.id}
          role="button"
          aria-label={`输入 ${snippetLabel(item.content)}`}
          className={`wheel-segment ${index === wheelSelected ? 'selected' : ''}`}
          onMouseEnter={() => setWheelSelected(index)}
          onMouseLeave={() => setWheelSelected((value) => value === index ? -1 : value)}
          onClick={() => void paste(item)}
        >
          <path d={sectorPath(index, wheelPage.items.length)}/>
          <foreignObject x={position.x - 58} y={position.y - 34} width="116" height="68" pointerEvents="none">
            <div className="wheel-label">
              <strong>{item.favorite && <StarIcon size={12}/>}<span>{snippetLabel(item.content)}</span></strong>
              <small>{data.groups.find((group) => group.id === item.groupId)?.name}</small>
            </div>
          </foreignObject>
        </g>
      })}
    </svg>
    {!wheelPage.items.length && <div className="wheel-empty"><strong>还没有常用文本</strong><span>点击中央按钮添加第一条</span></div>}
    <button className="wheel-center" onClick={() => void window.quickPaste.openManager('snippets')}>
      <EditIcon size={22}/><strong>{data.snippets.length ? '编辑文本' : '添加文本'}</strong><small>打开文本库</small>
    </button>
    {wheelPage.totalPages > 1 && <div className="wheel-pagination"><span>{wheelPage.page + 1} / {wheelPage.totalPages}</span><small>滚轮翻页</small></div>}
  </main>
}
