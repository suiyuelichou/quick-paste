import type { HotkeyMode } from './types'

const modifierGroups: Record<string, number[]> = {
  alt: [0x12],
  commandorcontrol: [0x11],
  control: [0x11],
  ctrl: [0x11],
  meta: [0x5b, 0x5c],
  shift: [0x10],
  super: [0x5b, 0x5c]
}

const namedKeys: Record<string, number> = {
  backspace: 0x08,
  tab: 0x09,
  enter: 0x0d,
  return: 0x0d,
  pause: 0x13,
  capslock: 0x14,
  escape: 0x1b,
  esc: 0x1b,
  space: 0x20,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  printscreen: 0x2c,
  insert: 0x2d,
  delete: 0x2e,
  num0: 0x60,
  num1: 0x61,
  num2: 0x62,
  num3: 0x63,
  num4: 0x64,
  num5: 0x65,
  num6: 0x66,
  num7: 0x67,
  num8: 0x68,
  num9: 0x69,
  nummult: 0x6a,
  numadd: 0x6b,
  numsub: 0x6d,
  numdec: 0x6e,
  numdiv: 0x6f,
  numlock: 0x90,
  scrolllock: 0x91,
  ';': 0xba,
  '=': 0xbb,
  ',': 0xbc,
  '-': 0xbd,
  '.': 0xbe,
  '/': 0xbf,
  '`': 0xc0,
  '[': 0xdb,
  '\\': 0xdc,
  ']': 0xdd,
  "'": 0xde
}

function ordinaryKeyCode(part: string): number | null {
  if (/^[a-z]$/i.test(part) || /^\d$/.test(part)) return part.toUpperCase().charCodeAt(0)
  const functionKey = /^f(\d{1,2})$/i.exec(part)
  if (functionKey) {
    const number = Number(functionKey[1])
    if (number >= 1 && number <= 24) return 0x6f + number
  }
  return namedKeys[part.toLocaleLowerCase('en-US')] ?? null
}

export function isHotkeyMode(value: unknown): value is HotkeyMode {
  return value === 'toggle' || value === 'hold'
}

/** Converts the supported Electron accelerator subset to Windows virtual-key groups. */
export function hotkeyVirtualKeyGroups(value: string): number[][] | null {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  const modifiers: number[][] = []
  let ordinary: number | null = null
  for (const part of parts) {
    const modifier = modifierGroups[part.toLocaleLowerCase('en-US')]
    if (modifier) {
      if (!modifiers.some((group) => group.join(',') === modifier.join(','))) modifiers.push(modifier)
      continue
    }
    const code = ordinaryKeyCode(part)
    if (code === null || ordinary !== null) return null
    ordinary = code
  }
  return modifiers.length && ordinary !== null ? [...modifiers, [ordinary]] : null
}
