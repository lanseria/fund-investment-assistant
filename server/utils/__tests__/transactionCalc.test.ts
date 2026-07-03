import { describe, expect, it } from 'vitest'
import { buildFifoLots, calculatePenaltyFee } from '../transactionCalc'

// ============ 辅助函数 ============
// buildFifoLots 返回的 shares 是 BigNumber,转成 number 便于断言
function lotShares(lots: ReturnType<typeof buildFifoLots>): number[] {
  return lots.map(l => l.shares.toNumber())
}

// ============ A. buildFifoLots(批次重建) ============
describe('buildFifoLots', () => {
  it('场景1: 只有买入时,lots 数量等于买入笔数且 shares 不变', () => {
    const lots = buildFifoLots(
      [
        { date: '2026-01-01', shares: 100 },
        { date: '2026-01-10', shares: 200 },
      ],
      [], // 无卖出
    )
    expect(lots).toHaveLength(2)
    expect(lotShares(lots)).toEqual([100, 200])
  })

  it('场景2: 历史卖出恰好消耗完队头批次时,该批次被移除', () => {
    const lots = buildFifoLots(
      [
        { date: '2026-01-01', shares: 100 },
        { date: '2026-01-10', shares: 200 },
      ],
      [{ shares: 100 }], // 卖出 100,正好消耗完第一批
    )
    expect(lots).toHaveLength(1)
    expect(lots[0].date).toBe('2026-01-10')
    expect(lotShares(lots)).toEqual([200])
  })

  it('场景3: 历史卖出部分消耗队头批次时,队头 shares 削减', () => {
    const lots = buildFifoLots(
      [{ date: '2026-01-01', shares: 100 }],
      [{ shares: 30 }], // 只卖 30,队头剩 70
    )
    expect(lots).toHaveLength(1)
    expect(lotShares(lots)).toEqual([70])
  })

  it('场景4: 卖出总量超过买入总量时,lots 清空', () => {
    const lots = buildFifoLots(
      [
        { date: '2026-01-01', shares: 100 },
        { date: '2026-01-10', shares: 50 },
      ],
      [{ shares: 200 }], // 卖出 200 > 总买入 150
    )
    expect(lots).toHaveLength(0)
  })

  it('场景5: 空输入应返回空数组', () => {
    expect(buildFifoLots([], [])).toEqual([])
  })
})

// ============ B. calculatePenaltyFee(7天惩罚费) ============
describe('calculatePenaltyFee', () => {
  it('场景1: 全部批次持有 ≥7 天时,惩罚费为 0', () => {
    // 买入 1-01,卖出 1-10,持有 9 天 ≥7
    const lots = buildFifoLots([{ date: '2026-01-01', shares: 100 }], [])
    const { penaltyFee } = calculatePenaltyFee(lots, 100, '2026-01-10', 1.5)
    expect(penaltyFee.toNumber()).toBe(0)
  })

  it('场景2: 全部批次持有 <7 天时,惩罚费 = 份额×净值×1.5%', () => {
    // 买入 1-01,卖出 1-05,持有 4 天 <7
    const lots = buildFifoLots([{ date: '2026-01-01', shares: 100 }], [])
    const { penaltyFee } = calculatePenaltyFee(lots, 100, '2026-01-05', 1.5)
    // 100 × 1.5 × 0.015 = 2.25
    expect(penaltyFee.toNumber()).toBeCloseTo(2.25, 4)
  })

  it('场景2b: 精度验证 - 200份 × 1.0净值 × 1.5% = 3.0', () => {
    const lots = buildFifoLots([{ date: '2026-01-01', shares: 200 }], [])
    const { penaltyFee } = calculatePenaltyFee(lots, 200, '2026-01-03', 1.0)
    expect(penaltyFee.toNumber()).toBeCloseTo(3.0, 4)
  })

  it('场景3: 混合批次时,只对持有<7天的部分计费', () => {
    // 批次1: 1-01 买入 100(卖出日 1-10,持有9天 ≥7,不计费)
    // 批次2: 1-08 买入 100(卖出日 1-10,持有2天 <7,计费)
    // 卖出 200 跨两个批次
    const lots = buildFifoLots(
      [
        { date: '2026-01-01', shares: 100 },
        { date: '2026-01-08', shares: 100 },
      ],
      [],
    )
    const { penaltyFee } = calculatePenaltyFee(lots, 200, '2026-01-10', 1.0)
    // 只有批次2的 100 份计费:100 × 1.0 × 0.015 = 1.5
    expect(penaltyFee.toNumber()).toBeCloseTo(1.5, 4)
  })

  it('场景4: 卖出份额跨多批次时,各批次分别计算并累加', () => {
    // 三个批次都 <7 天,卖出跨全部
    // 批次1: 1-01 买 50(卖出 1-05,持有4天)→ 50×1.0×0.015 = 0.75
    // 批次2: 1-02 买 50(卖出 1-05,持有3天)→ 50×1.0×0.015 = 0.75
    // 批次3: 1-03 买 50(卖出 1-05,持有2天)→ 50×1.0×0.015 = 0.75
    // 合计 2.25
    const lots = buildFifoLots(
      [
        { date: '2026-01-01', shares: 50 },
        { date: '2026-01-02', shares: 50 },
        { date: '2026-01-03', shares: 50 },
      ],
      [],
    )
    const { penaltyFee } = calculatePenaltyFee(lots, 150, '2026-01-05', 1.0)
    expect(penaltyFee.toNumber()).toBeCloseTo(2.25, 4)
  })

  it('场景5: 持有恰好 7 天时不计费(边界:7天不惩罚)', () => {
    // 1-01 买入,1-08 卖出,持有 7 天 → 不计费(diff=7,7<7 为 false)
    const lots = buildFifoLots([{ date: '2026-01-01', shares: 100 }], [])
    const { penaltyFee } = calculatePenaltyFee(lots, 100, '2026-01-08', 1.5)
    expect(penaltyFee.toNumber()).toBe(0)
  })

  it('场景6: 卖出份额为 0 时,惩罚费为 0', () => {
    const lots = buildFifoLots([{ date: '2026-01-01', shares: 100 }], [])
    const { penaltyFee } = calculatePenaltyFee(lots, 0, '2026-01-03', 1.5)
    expect(penaltyFee.toNumber()).toBe(0)
  })

  it('场景7: 卖出份额超过批次总量时,只对实际批次计费', () => {
    // 只有 100 份批次(<7天),但请求卖出 500 份
    // 实际只能扣 100 份:100 × 1.0 × 0.015 = 1.5
    const lots = buildFifoLots([{ date: '2026-01-01', shares: 100 }], [])
    const { penaltyFee } = calculatePenaltyFee(lots, 500, '2026-01-03', 1.0)
    expect(penaltyFee.toNumber()).toBeCloseTo(1.5, 4)
  })
})
