export const WHEEL_PAGE_SIZE = 8
export const PICKER_SIZE = 560
export const PICKER_MARGIN = 16

export interface Point {
  x: number
  y: number
}

export interface Rectangle extends Point {
  width: number
  height: number
}

export interface WheelPage<T> {
  items: T[]
  page: number
  totalPages: number
}

export interface WheelSector {
  startAngle: number
  endAngle: number
  middleAngle: number
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value))

export function getWheelPage<T>(items: T[], requestedPage: number, pageSize = WHEEL_PAGE_SIZE): WheelPage<T> {
  const safeSize = Math.max(1, Math.floor(pageSize))
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize))
  const page = clamp(Math.floor(requestedPage), 0, totalPages - 1)
  return { items: items.slice(page * safeSize, (page + 1) * safeSize), page, totalPages }
}

export function stepWheelPage(page: number, direction: number, itemCount: number, pageSize = WHEEL_PAGE_SIZE): number {
  const totalPages = Math.max(1, Math.ceil(itemCount / Math.max(1, Math.floor(pageSize))))
  return clamp(page + Math.sign(direction), 0, totalPages - 1)
}

export function getWheelSector(index: number, count: number, gapDegrees = 1.5): WheelSector {
  if (count <= 0 || index < 0 || index >= count) throw new RangeError('轮盘扇区索引无效')
  const span = 360 / count
  const middleAngle = -90 + index * span
  const safeGap = Math.min(Math.max(0, gapDegrees), Math.max(0, span / 2 - 0.01))
  return {
    startAngle: middleAngle - span / 2 + safeGap,
    endAngle: middleAngle + span / 2 - safeGap,
    middleAngle
  }
}

function clampAxis(cursor: number, origin: number, length: number, windowSize: number, margin: number): number {
  const available = length - windowSize
  if (available <= 0) return Math.round(origin + available / 2)
  const safeMargin = Math.min(Math.max(0, margin), available / 2)
  return Math.round(clamp(cursor - windowSize / 2, origin + safeMargin, origin + available - safeMargin))
}

export function clampPickerPosition(
  cursor: Point,
  workArea: Rectangle,
  windowSize = PICKER_SIZE,
  margin = PICKER_MARGIN
): Point {
  return {
    x: clampAxis(cursor.x, workArea.x, workArea.width, windowSize, margin),
    y: clampAxis(cursor.y, workArea.y, workArea.height, windowSize, margin)
  }
}
