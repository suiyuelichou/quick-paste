import { describe, expect, it } from 'vitest'
import { clampPickerPosition, getWheelPage, getWheelSector, stepWheelPage } from './wheel'

describe('轮盘分页', () => {
  const values = Array.from({ length: 18 }, (_, index) => index)

  it('每页最多返回八项并约束页码', () => {
    expect(getWheelPage(values, 0).items).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(getWheelPage(values, 2)).toEqual({ items: [16, 17], page: 2, totalPages: 3 })
    expect(getWheelPage(values, 99).page).toBe(2)
  })

  it('翻页不会越过第一页和最后一页', () => {
    expect(stepWheelPage(0, -1, values.length)).toBe(0)
    expect(stepWheelPage(0, 1, values.length)).toBe(1)
    expect(stepWheelPage(2, 1, values.length)).toBe(2)
  })
})

describe('轮盘扇区', () => {
  it('第一项位于十二点方向并顺时针排列', () => {
    expect(getWheelSector(0, 8).middleAngle).toBe(-90)
    expect(getWheelSector(1, 8).middleAngle).toBe(-45)
    expect(getWheelSector(7, 8).middleAngle).toBe(225)
  })
})

describe('选择器位置', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 }

  it('通常以鼠标为中心', () => {
    expect(clampPickerPosition({ x: 960, y: 520 }, workArea)).toEqual({ x: 680, y: 240 })
  })

  it('在工作区四边保留边距', () => {
    expect(clampPickerPosition({ x: 0, y: 0 }, workArea)).toEqual({ x: 16, y: 16 })
    expect(clampPickerPosition({ x: 1920, y: 1040 }, workArea)).toEqual({ x: 1344, y: 464 })
  })
})
