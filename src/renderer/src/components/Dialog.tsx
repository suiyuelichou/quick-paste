import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Modal({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="app-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); onCancel() }}>
    <h2>{title}</h2>{children}
  </dialog>
}

interface Request { title: string; message?: string; initial?: string; resolve: (value: string | null) => void }

export function useDialog(): { confirm: (message: string) => Promise<boolean>; prompt: (title: string, initial?: string) => Promise<string | null>; dialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null)
  const [value, setValue] = useState('')
  const pending = useRef(false)
  const ask = (title: string, message?: string, initial?: string): Promise<string | null> => {
    if (pending.current) return Promise.resolve(null)
    pending.current = true
    setValue(initial ?? '')
    return new Promise((resolve) => setRequest({ title, message, initial, resolve }))
  }
  const finish = (result: string | null): void => {
    request?.resolve(result); pending.current = false; setRequest(null)
  }
  return {
    confirm: async (message) => (await ask('请确认', message)) !== null,
    prompt: (title, initial = '') => ask(title, undefined, initial),
    dialog: request && <Modal title={request.title} onCancel={() => finish(null)}>
      <form onSubmit={(event) => { event.preventDefault(); finish(request.initial === undefined ? 'yes' : value.trim()) }}>
        {request.message && <p>{request.message}</p>}
        {request.initial !== undefined && <input autoFocus aria-label={request.title} value={value} maxLength={100} onChange={(event) => setValue(event.target.value)}/>}
        <div className="dialog-actions"><button type="button" className="secondary" autoFocus={request.initial === undefined} onClick={() => finish(null)}>取消</button><button className="primary" disabled={request.initial !== undefined && !value.trim()}>确定</button></div>
      </form>
    </Modal>
  }
}
