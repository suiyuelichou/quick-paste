import { describe, expect, it } from 'vitest'
import { hotkeyVirtualKeyGroups, isHotkeyMode } from './hotkey'

describe('hotkey release mapping', () => {
  it.each([
    ['Ctrl+Alt+Space', [[0x11], [0x12], [0x20]]],
    ['Ctrl+Shift+K', [[0x11], [0x10], [0x4b]]],
    ['Super+F24', [[0x5b, 0x5c], [0x87]]],
    ['CommandOrControl+num0', [[0x11], [0x60]]],
    ['Ctrl+Shift+=', [[0x11], [0x10], [0xbb]]]
  ])('maps %s to physical Windows keys', (accelerator, expected) => {
    expect(hotkeyVirtualKeyGroups(accelerator)).toEqual(expected)
  })

  it.each(['Space', 'Ctrl+Alt', 'Ctrl+A+B', 'Ctrl+MediaPlayPause'])('rejects unsupported hold accelerator %s', (accelerator) => {
    expect(hotkeyVirtualKeyGroups(accelerator)).toBeNull()
  })

  it('accepts only known interaction modes', () => {
    expect(isHotkeyMode('toggle')).toBe(true)
    expect(isHotkeyMode('hold')).toBe(true)
    expect(isHotkeyMode('sticky')).toBe(false)
  })
})
