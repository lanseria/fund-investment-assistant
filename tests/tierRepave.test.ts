import type { StrategyTiers } from '~~/shared/strategyTiers'
import { describe, expect, it } from 'vitest'
import { repaveStrategyTiersNavs, TIER_FIRST_BUY_DISCOUNT } from '~~/shared/strategyTiers'

/** 基准档位：低吸 4 档、高抛 3 档，金额/比例固定 */
function baseTiers(): StrategyTiers {
  return {
    version: 1,
    enabled: true,
    trigger: { rsi14Max: 35, bias20MinPct: -5 },
    buyTiers: [
      { nav: 1.9, amount: 500 },
      { nav: 1.8, amount: 600 },
      { nav: 1.7, amount: 800 },
      { nav: 1.6, amount: 1000 },
    ],
    sellTiers: [
      { nav: 2.2, percent: 20 },
      { nav: 2.4, percent: 20 },
      { nav: 2.6, percent: 10 },
    ],
    clearRule: { rsi14Min: 85, bias20MinPct: 20 },
    halveBelowMa250: true,
    note: 'v4 原始备注',
  }
}

describe('repaveStrategyTiersNavs', () => {
  it('首档锚定最新净值 × 0.95，其余档位按原档距比例缩放', () => {
    expect(TIER_FIRST_BUY_DISCOUNT).toBe(0.95)
    const next = repaveStrategyTiersNavs(baseTiers(), 1.5)
    expect(next).not.toBeNull()
    expect(next!.buyTiers.map(t => t.nav)).toEqual([1.425, 1.35, 1.275, 1.2])
    // 金额保留
    expect(next!.buyTiers.map(t => t.amount)).toEqual([500, 600, 800, 1000])
  })

  it('高抛档位同比例缩放 (仍高于净值时)', () => {
    const next = repaveStrategyTiersNavs(baseTiers(), 1.5)
    expect(next!.sellTiers.map(t => t.nav)).toEqual([1.65, 1.8, 1.95])
    expect(next!.sellTiers.map(t => t.percent)).toEqual([20, 20, 10])
  })

  it('保留触发条件 / 清仓条件 / 年线减半 / 备注', () => {
    const next = repaveStrategyTiersNavs(baseTiers(), 1.5)!
    expect(next.trigger).toEqual({ rsi14Max: 35, bias20MinPct: -5 })
    expect(next.clearRule).toEqual({ rsi14Min: 85, bias20MinPct: 20 })
    expect(next.halveBelowMa250).toBe(true)
    expect(next.note).toBe('v4 原始备注')
    expect(next.version).toBe(1)
    expect(next.enabled).toBe(true)
  })

  it('缩放后高抛档不再高于净值时保留原高抛档 (避免误触高抛)', () => {
    const tiers = baseTiers()
    tiers.sellTiers = [{ nav: 1.95, percent: 20 }]
    const next = repaveStrategyTiersNavs(tiers, 1.5)!
    // 1.95 × (1.425 / 1.9) = 1.4625 < 1.5，故保留原 1.95
    expect(next.sellTiers).toEqual([{ nav: 1.95, percent: 20 }])
    // 低吸仍然重铺
    expect(next.buyTiers[0]!.nav).toBe(1.425)
  })

  it('幂等：同一净值连续重铺两次结果一致', () => {
    const first = repaveStrategyTiersNavs(baseTiers(), 1.5)!
    const second = repaveStrategyTiersNavs(first, 1.5)!
    expect(second.buyTiers).toEqual(first.buyTiers)
    expect(second.sellTiers).toEqual(first.sellTiers)
  })

  it('未启用 / 无低吸档 / 净值非法 → 返回 null', () => {
    expect(repaveStrategyTiersNavs({ ...baseTiers(), enabled: false }, 1.5)).toBeNull()
    expect(repaveStrategyTiersNavs({ ...baseTiers(), buyTiers: [] }, 1.5)).toBeNull()
    expect(repaveStrategyTiersNavs(baseTiers(), 0)).toBeNull()
    expect(repaveStrategyTiersNavs(baseTiers(), Number.NaN)).toBeNull()
  })

  it('重铺后低吸档必须严格递减，否则返回 null', () => {
    const tiers = baseTiers()
    tiers.buyTiers = [
      { nav: 1.9, amount: 500 },
      { nav: 1.9, amount: 600 }, // 重复档位
    ]
    expect(repaveStrategyTiersNavs(tiers, 1.5)).toBeNull()
  })

  it('不修改入参', () => {
    const tiers = baseTiers()
    const snapshot = JSON.stringify(tiers)
    repaveStrategyTiersNavs(tiers, 1.5)
    expect(JSON.stringify(tiers)).toBe(snapshot)
  })
})