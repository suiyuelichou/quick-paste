import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { hotkeyVirtualKeyGroups } from '../shared/hotkey'
import { nativeHelperPath } from './input-helper'

export type HotkeyReleaseResult = 'released' | 'failed' | 'cancelled'

export interface HotkeyReleaseMonitor {
  done: Promise<HotkeyReleaseResult>
  cancel(): void
}

const RELEASE_TIMEOUT_MS = 65000
const MAX_OUTPUT_BYTES = 8192

function confirmedRelease(stdout: string, exitCode: number | null, signal: NodeJS.Signals | null): boolean {
  if (signal || exitCode !== 0) return false
  try {
    const parsed: unknown = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? '')
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as Record<string, unknown>).ok === true && (parsed as Record<string, unknown>).released === true
  } catch { return false }
}

export function monitorHotkeyRelease(hotkey: string): HotkeyReleaseMonitor | null {
  const groups = hotkeyVirtualKeyGroups(hotkey)
  if (!groups) return null
  const keySpec = groups.map((group) => group.join(',')).join(';')
  let child: ChildProcessWithoutNullStreams
  let settle!: (result: HotkeyReleaseResult) => void
  const done = new Promise<HotkeyReleaseResult>((resolve) => { settle = resolve })
  let settled = false
  let timer: NodeJS.Timeout | undefined
  let stdout = ''
  let outputBytes = 0
  const finish = (result: HotkeyReleaseResult, stop = false): void => {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    if (stop) {
      child.stdin.destroy()
      child.kill()
    }
    settle(result)
  }
  try { child = spawn(nativeHelperPath(), ['wait-release', keySpec], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }) }
  catch {
    settle('failed')
    return { done, cancel: () => undefined }
  }
  timer = setTimeout(() => finish('failed', true), RELEASE_TIMEOUT_MS)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    if (settled) return
    outputBytes += Buffer.byteLength(chunk, 'utf8')
    if (outputBytes > MAX_OUTPUT_BYTES) { finish('failed', true); return }
    stdout += chunk
  })
  child.stderr.resume()
  child.stdout.on('error', () => finish('failed', true))
  child.stderr.on('error', () => finish('failed', true))
  child.stdin.on('error', () => finish('failed', true))
  child.on('error', () => finish('failed', true))
  child.on('close', (code, signal) => finish(confirmedRelease(stdout, code, signal) ? 'released' : 'failed'))
  child.stdin.end()
  return { done, cancel: () => finish('cancelled', true) }
}
