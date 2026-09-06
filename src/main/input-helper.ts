import { execFile, spawn } from 'node:child_process'
import { app } from 'electron'
import { join } from 'node:path'
import type { PasteResult } from '../shared/types'

interface CaptureResult { ok: boolean; handle?: string; left?: number; top?: number; right?: number; bottom?: number; code?: string }

const helperPath = (): string => app.isPackaged
  ? join(process.resourcesPath, 'native', 'QuickPaste.InputHelper.exe')
  : join(app.getAppPath(), 'resources', 'native', 'QuickPaste.InputHelper.exe')

const parseLastJson = <T>(value: string): T => JSON.parse(value.trim().split(/\r?\n/).at(-1) ?? '{}') as T

export function captureTarget(): Promise<CaptureResult> {
  return new Promise((resolve) => {
    execFile(helperPath(), ['capture'], { windowsHide: true, encoding: 'utf8' }, (_error, stdout) => {
      try { resolve(parseLastJson<CaptureResult>(stdout)) }
      catch { resolve({ ok: false, code: 'helper_failed' }) }
    })
  })
}

export function typeIntoTarget(handle: string, content: string): Promise<PasteResult> {
  return new Promise((resolve) => {
    const child = spawn(helperPath(), ['type', handle], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.on('error', () => resolve({ ok: false, code: 'helper_failed', message: '无法启动原生输入助手' }))
    child.on('close', () => {
      try { resolve(parseLastJson<PasteResult>(stdout)) }
      catch { resolve({ ok: false, code: 'helper_failed', message: '原生输入助手返回异常' }) }
    })
    child.stdin.end(content, 'utf8')
  })
}
