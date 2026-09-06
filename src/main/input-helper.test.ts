// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureTarget, typeIntoTarget } from './input-helper'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }))
vi.mock('node:child_process', () => mocks)
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => 'E:/fictional-app' } }))

function makeChild() {
  return Object.assign(new EventEmitter(), {
    pid: 123,
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: vi.fn(() => true)
  })
}

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('native input process boundary', () => {
  it('sends UTF-8 text through stdin only and accepts confirmed success', async () => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const pending = typeIntoTarget('123', '虚构文本 😀\n第二行')
    expect(mocks.spawn).toHaveBeenCalledWith(expect.stringContaining('QuickPaste.InputHelper.exe'), ['type', '123'], expect.objectContaining({ windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }))
    expect(child.stdin.read().toString('utf8')).toBe('虚构文本 😀\n第二行')
    child.stdout.emit('data', '{"ok":')
    child.stdout.emit('data', 'true}\r\n')
    child.emit('close', 0, null)
    expect(await pending).toEqual({ ok: true })
    await vi.advanceTimersByTimeAsync(20000)
    expect(child.kill).not.toHaveBeenCalled()
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
  })

  it('kills a stalled helper, reports uncertainty, and never retries', async () => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const pending = typeIntoTarget('123', '虚构文本')
    await vi.advanceTimersByTimeAsync(15000)
    expect(await pending).toMatchObject({ ok: false, code: 'helper_failed', message: expect.stringContaining('超时') })
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.stdin.destroyed).toBe(true)
    child.emit('close', 0, null)
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['', 0, null], ['null', 0, null], ['[]', 0, null], ['{}', 0, null],
    ['{"ok":"true"}', 0, null], ['{"ok":true}', 1, null],
    ['{"ok":true}', null, 'SIGTERM'], ['{"ok":false,"code":"unknown"}', 1, null],
    ['{"ok":false,"code":"focus_failed"}', 0, null]
  ])('does not trust malformed or inconsistent results (%s, %s)', async (stdout, code, signal) => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const pending = typeIntoTarget('123', '虚构文本')
    child.stdout.emit('data', stdout)
    child.emit('close', code, signal)
    expect(await pending).toMatchObject({ ok: false, code: 'helper_failed', message: expect.stringContaining('请先检查目标窗口') })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['target_missing', 'elevated_target', 'focus_failed', 'input_failed', 'helper_failed'])('maps native failure %s to a safe message', async (code) => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const pending = typeIntoTarget('123', '虚构文本')
    child.stdout.emit('data', JSON.stringify({ ok: false, code, message: 'untrusted diagnostic' }))
    child.emit('close', 1, null)
    const result = await pending
    expect(result).toMatchObject({ ok: false, code })
    expect(result.message).not.toContain('untrusted diagnostic')
    expect(result.message).toContain(['input_failed', 'helper_failed'].includes(code) ? '避免重复输入' : '未发送文本')
  })

  it.each(['stdin', 'stdout', 'stderr'] as const)('handles %s errors without an unhandled exception', async (stream) => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const pending = typeIntoTarget('123', '虚构文本')
    child[stream].emit('error', new Error('pipe closed'))
    expect(await pending).toMatchObject({ ok: false, message: expect.stringContaining('可能已输入') })
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds helper output and ignores subsequent output after aborting', async () => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const pending = typeIntoTarget('123', '虚构文本')
    child.stdout.emit('data', 'x'.repeat(8193))
    child.stdout.emit('data', '{"ok":true}')
    child.emit('close', 0, null)
    expect(await pending).toMatchObject({ ok: false, code: 'helper_failed' })
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('reports a spawn failure as no text sent', async () => {
    const child = makeChild()
    Object.assign(child, { pid: undefined })
    mocks.spawn.mockReturnValue(child)
    const pending = typeIntoTarget('123', '虚构文本')
    child.emit('error', new Error('ENOENT'))
    expect(await pending).toMatchObject({ ok: false, message: expect.stringContaining('未发送文本') })
  })

  it('handles synchronous launch failures', async () => {
    mocks.spawn.mockImplementation(() => { throw new Error('launch failed') })
    expect(await typeIntoTarget('123', '虚构文本')).toMatchObject({ ok: false, code: 'helper_failed' })
  })

  it.each(['0', '-1', 'abc', '9223372036854775808'])('rejects invalid handles before launch: %s', async (handle) => {
    expect(await typeIntoTarget(handle, '虚构文本')).toMatchObject({ ok: false, code: 'target_missing' })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it.each(['', 'x'.repeat(100001)])('rejects invalid content before launch', async (content) => {
    expect(await typeIntoTarget('123', content)).toMatchObject({ ok: false })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
})

describe('target capture', () => {
  const captured = { ok: true, handle: '123', left: -100, top: 0, right: 100, bottom: 200 }
  function reply(value: unknown, error: Error | null = null) {
    mocks.execFile.mockImplementation((_path, _args, _options, callback) => callback(error, JSON.stringify(value)))
  }

  it('accepts valid coordinates on another monitor and bounds execution', async () => {
    reply(captured)
    expect(await captureTarget()).toEqual(captured)
    expect(mocks.execFile).toHaveBeenCalledWith(expect.any(String), ['capture'], expect.objectContaining({ timeout: 3000, maxBuffer: 8192, windowsHide: true }), expect.any(Function))
  })

  it.each([null, {}, { ...captured, handle: '0' }, { ...captured, left: '0' }, { ...captured, right: -101 }, { ...captured, ok: 1 }])('rejects malformed capture %j', async (value) => {
    reply(value)
    expect(await captureTarget()).toEqual({ ok: false, code: 'helper_failed' })
  })

  it('rejects apparently valid output when capture times out or exits unsuccessfully', async () => {
    reply(captured, new Error('timeout'))
    expect(await captureTarget()).toEqual({ ok: false, code: 'helper_failed' })
  })

  it('handles synchronous capture launch failures', async () => {
    mocks.execFile.mockImplementation(() => { throw new Error('launch failed') })
    expect(await captureTarget()).toEqual({ ok: false, code: 'helper_failed' })
  })
})
