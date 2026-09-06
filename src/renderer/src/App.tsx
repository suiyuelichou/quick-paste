import { useEffect, useState } from 'react'
import type { AppData } from '../../shared/types'
import { Picker } from './components/Picker'
import { Manager } from './components/Manager'

export function App(): JSX.Element {
  const [data, setData] = useState<AppData | null>(null)
  const view = new URLSearchParams(window.location.search).get('view') === 'picker' ? 'picker' : 'manager'

  useEffect(() => {
    void window.quickPaste.getData().then(setData)
    return window.quickPaste.onDataChanged(setData)
  }, [])

  if (!data) return <div className={view === 'picker' ? 'picker-shell loading' : 'app-loading'}>正在加载…</div>
  return view === 'picker' ? <Picker data={data} /> : <Manager data={data} />
}
