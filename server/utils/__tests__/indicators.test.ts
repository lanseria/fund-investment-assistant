import { describe, expect, it } from 'vitest'
import { computeBiasPct, computeRsi } from '../indicators'

describe('computeRsi (Wilder SMA(X,N,1) 口径)', () => {
  it('单边上涨收敛到 100', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 1 + i * 0.01)
    expect(computeRsi(closes, 6)).toBe(100)
    expect(computeRsi(closes, 14)).toBe(100)
  })

  it('单边下跌收敛到 0', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 5 - i * 0.01)
    expect(computeRsi(closes, 6)).toBe(0)
    expect(computeRsi(closes, 24)).toBe(0)
  })

  it('混合序列符合手算值', () => {
    // diffs = [1, -0.5, 1]，period=2
    // up 初值 = (1+0)/2 = 0.5，dn 初值 = (1+0.5)/2 = 0.75
    // 递推一步：up = (1 + 0.5)/2 = 0.75，dn = (1 + 0.75)/2 = 0.875
    // RSI = 0.75 / 0.875 * 100 = 85.71
    expect(computeRsi([1, 2, 1.5, 2.5], 2)).toBe(85.71)
  })

  it('数据不足时返回 null', () => {
    expect(computeRsi([1, 2, 3], 6)).toBeNull()
    expect(computeRsi([], 14)).toBeNull()
  })

  it('完全平盘（分母为 0）返回 null', () => {
    expect(computeRsi([2, 2, 2, 2, 2], 6)).toBeNull()
  })

  it('rSI 值域在 0-100 之间（随机波动序列）', () => {
    const closes = [1, 1.2, 1.1, 1.4, 1.3, 1.5, 1.2, 1.6, 1.4, 1.7, 1.5, 1.8, 1.6, 1.9, 1.7, 2.0]
    for (const period of [6, 12, 24, 14]) {
      const rsi = computeRsi(closes, period)
      if (rsi !== null) {
        expect(rsi).toBeGreaterThanOrEqual(0)
        expect(rsi).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('computeBiasPct', () => {
  it('负乖离', () => {
    // (2.82 - 2.9099) / 2.9099 * 100 = -3.0894 -> -3.09
    expect(computeBiasPct(2.82, 2.9099)).toBe(-3.09)
  })

  it('正乖离', () => {
    // (3.0 - 2.9099) / 2.9099 * 100 = 3.0963 -> 3.1
    expect(computeBiasPct(3.0, 2.9099)).toBe(3.1)
  })

  it('无效输入返回 null', () => {
    expect(computeBiasPct(null, 2)).toBeNull()
    expect(computeBiasPct(2, null)).toBeNull()
    expect(computeBiasPct(2, 0)).toBeNull()
  })
})
