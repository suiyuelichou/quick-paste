import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app } from 'electron'
import { join } from 'node:path'
import type { PasteResult } from '../shared/types'

interface CaptureResult { ok: boolean; handle?: string; left?: number; top?: number; right?: number; bottom?: number; code?: string }

export const nativeHelperPath = (): string => app.isPackaged
  ? join(process.resourcesPath, 'native', 'QuickPaste.InputHelper.exe')
  : join(app.getAppPath(), 'resources', 'native', 'QuickPaste.InputHelper.exe')

const CAPTURE_TIMEOUT_MS = 3000
const INPUT_TIMEOUT_MS = 15000
const MAX_OUTPUT_BYTES = 8192
const uncertainMessage = '输入结果无法确认，可能已输入部分文本。请先检查目标窗口，避免重复输入。'
const failureMessages = {
  target_missing: '原输入窗口已关闭，未发送文本。',
  elevated_target: '目标应用以管理员身份运行，当前权限无法向其中输入，未发送文本。',
  focus_failed: '无法重新聚焦原输入窗口，未发送文本。',
  input_failed: '文本未能完整输入，可能已输入部分内容。请先检查目标窗口，避免重复输入。',
  helper_failed: uncertainMessage
} satisfies Record<NonNullable<PasteResult['code']>, string>

function parseLastJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value.trim().split(/\r?\n/).at(-1) ?? '')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid helper response')
  return parsed as Record<string, unknown>
}

function validHandle(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
}

const validCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

function parsePasteResult(stdout: string, exitCode: number | null): PasteResult {
  const result = parseLastJson(stdout)
  if (result.ok === true && exitCode === 0) return { ok: true }
  if (result.ok === false && exitCode === 1 && typeof result.code === 'string' && Object.hasOwn(failureMessages, result.code)) {
    const code = result.code as NonNullable<PasteResult['code']>
    return { ok: false, code, message: failureMessages[code] }
  }
  throw new Error('Invalid helper response')
}

export function captureTarget(): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const fail = (): void => resolve({ ok: false, code: 'helper_failed' })
    try {
      execFile(nativeHelperPath(), ['capture'], { windowsHide: true, encoding: 'utf8', timeout: CAPTURE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout) => {
        try {
          if (error) throw error
          const { ok, handle, left, top, right, bottom } = parseLastJson(stdout)
          if (ok !== true || !validHandle(handle)) throw new Error('Invalid capture')
          if (!validCoordinate(left) || !validCoordinate(top) || !validCoordinate(right) || !validCoordinate(bottom) || right <= left || bottom <= top) throw new Error('Invalid target bounds')
          resolve({ ok: true, handle, left, top, right, bottom })
        } catch { fail() }
      })
    } catch { fail() }
  })
}

export function typeIntoTarget(handle: string, content: string): Promise<PasteResult> {
  if (!validHandle(handle)) return Promise.resolve({ ok: false, code: 'target_missing', message: failureMessages.target_missing })
  if (typeof content !== 'string' || !content.length || content.length > 100000) return Promise.resolve({ ok: false, code: 'helper_failed', message: '输入内容无效，未发送文本。' })
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try { child = spawn(nativeHelperPath(), ['type', handle], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }) }
    catch { resolve({ ok: false, code: 'helper_failed', message: '无法启动原生输入助手，未发送文本。' }); return }
    let settled = false
    let outputBytes = 0
    let stdout = ''
    const finish = (result: PasteResult, stop = false): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (stop) {
        child.stdin.destroy()
        child.kill()
      }
      resolve(result)
    }
    const fail = (message = uncertainMessage): void => finish({ ok: false, code: 'helper_failed', message }, true)
    const timer = setTimeout(() => fail(`原生输入助手响应超时。${uncertainMessage}`), INPUT_TIMEOUT_MS)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (settled) return
      outputBytes += Buffer.byteLength(chunk, 'utf8')
      if (outputBytes > MAX_OUTPUT_BYTES) { fail(); return }
      stdout += chunk
    })
    // Drain diagnostics without retaining or logging potentially sensitive native output.
    child.stderr.resume()
    child.stdout.on('error', () => fail())
    child.stderr.on('error', () => fail())
    child.stdin.on('error', () => fail())
    child.on('error', () => fail(child.pid ? uncertainMessage : '无法启动原生输入助手，未发送文本。'))
    child.on('close', (code, signal) => {
      if (settled) return
      try { finish(parsePasteResult(stdout, signal ? null : code)) }
      catch { fail() }
    })
    try { child.stdin.end(content, 'utf8') }
    catch { fail() }
  })
}
