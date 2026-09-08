// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { monitorHotkeyRelease } from './hotkey-release'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
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

describe('hotkey release monitor boundary', () => {
  it('passes only virtual-key groups and accepts confirmed release', async () => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const monitor = monitorHotkeyRelease('Ctrl+Alt+Space')!
    expect(mocks.spawn).toHaveBeenCalledWith(expect.stringContaining('QuickPaste.InputHelper.exe'), ['wait-release', '17;18;32'], expect.objectContaining({ windowsHide: true }))
    child.stdout.emit('data', '{"ok":true,"released":true}\n')
    child.emit('close', 0, null)
    expect(await monitor.done).toBe('released')
    expect(child.kill).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects accelerators that cannot be monitored', () => {
    expect(monitorHotkeyRelease('Ctrl+MediaPlayPause')).toBeNull()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it.each([
    ['', 0, null],
    ['{"ok":true}', 0, null],
    ['{"ok":true,"released":true}', 1, null],
    ['{"ok":true,"released":true}', null, 'SIGTERM']
  ])('does not trust malformed or inconsistent release output', async (stdout, code, signal) => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const monitor = monitorHotkeyRelease('Ctrl+K')!
    child.stdout.emit('data', stdout)
    child.emit('close', code, signal)
    expect(await monitor.done).toBe('failed')
  })

  it('can be cancelled and kills the native waiter', async () => {
    const child = makeChild()
    mocks.spawn.mockReturnValue(child)
    const monitor = monitorHotkeyRelease('Ctrl+K')!
    monitor.cancel()
    expect(await monitor.done).toBe('cancelled')
    expect(child.kill).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds runtime and output', async () => {
    const timeoutChild = makeChild()
    mocks.spawn.mockReturnValueOnce(timeoutChild)
    const timeout = monitorHotkeyRelease('Ctrl+K')!
    await vi.advanceTimersByTimeAsync(65000)
    expect(await timeout.done).toBe('failed')
    expect(timeoutChild.kill).toHaveBeenCalledOnce()

    const outputChild = makeChild()
    mocks.spawn.mockReturnValueOnce(outputChild)
    const output = monitorHotkeyRelease('Ctrl+K')!
    outputChild.stdout.emit('data', 'x'.repeat(8193))
    expect(await output.done).toBe('failed')
    expect(outputChild.kill).toHaveBeenCalledOnce()
  })
})
