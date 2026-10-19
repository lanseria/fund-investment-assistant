import { describe, expect, it } from 'vitest'
import { buildTierIndicatorContext, describeStrategyTiers, evaluateStrategyTiers } from '../server/utils/tierStrategy'
import { generateDefaultTiers, normalizeStrategyTiers, parseStrategyTiers } from '../shared/strategyTiers'

// 恒定净值的 300 日序列 (用于构造充足的指标历史)
function flatHistory(n: number, nav: number) {
  return Array.from({ length: n }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, nav }))
}

const tiers = {
  version: 1 as const,
  enabled: true,
  trigger: { rsi14Max: 35, bias20MinPct: -5 },
  buyTiers: [
    { nav: 1.0, amount: 500 },
    { nav: 0.95, amount: 800 },
    { nav: 0.9, amount: 1000 },
  ],
  sellTiers: [
    { nav: 1.2, percent: 20 },
    { nav: 1.4, percent: 20 },
  ],
  clearRule: { rsi14Min: 85, bias20MinPct: 20 },
  halveBelowMa250: true,
  note: '',
}

describe('normalizeStrategyTiers', () => {
  it('买入档位按净值降序、卖出按升序，金额与比例保留', () => {
    const t = normalizeStrategyTiers({
      ...tiers,
      buyTiers: [{ nav: 0.9, amount: 1000 }, { nav: 1.0, amount: 500 }],
      sellTiers: [{ nav: 1.4, percent: 20 }, { nav: 1.2, percent: 10 }],
    })
    expect(t.buyTiers.map(x => x.nav)).toEqual([1.0, 0.9])
    expect(t.buyTiers.map(x => x.amount)).toEqual([500, 1000])
    expect(t.sellTiers.map(x => x.nav)).toEqual([1.2, 1.4])
  })
})

describe('parseStrategyTiers', () => {
  it('非法输入返回 null', () => {
    expect(parseStrategyTiers(null)).toBeNull()
    expect(parseStrategyTiers({ version: 2 })).toBeNull() // v2 现金百分比制未启用
    expect(parseStrategyTiers({ ...tiers, buyTiers: [{ nav: -1, amount: 500 }] })).toBeNull()
    expect(parseStrategyTiers({ ...tiers, buyTiers: [{ nav: 1, amount: 0 }] })).toBeNull()
  })

  it('合法 v1 金额制可解析', () => {
    const t = parseStrategyTiers(tiers)
    expect(t?.version).toBe(1)
    expect(t?.buyTiers[0]!.amount).toBe(500)
  })
})

describe('evaluateStrategyTiers', () => {
  it('净值在档位之间时观望', () => {
    const d = evaluateStrategyTiers(tiers, { nav: 1.1, date: '2026-10-08', ma20: 1.1, ma60: 1.1, ma250: 1.2, rsi14: 50, bias20: 0 })
    expect(d.action).toBe('hold')
  })

  it('进入低吸档 + 触发条件满足 → 买入最深档；低于年线金额减半', () => {
    const d = evaluateStrategyTiers(tiers, { nav: 0.94, date: null, ma20: 1.0, ma60: 1.05, ma250: 1.3, rsi14: 30, bias20: -6 })
    expect(d.action).toBe('buy')
    expect(d.buyTier?.nav).toBe(0.95)
    expect(d.amount).toBe(400) // 800 / 2
    expect(d.halved).toBe(true)
    expect(d.reason).toContain('买入 ¥400')
  })

  it('进入低吸档但触发条件不满足 → 持有并说明', () => {
    const d = evaluateStrategyTiers(tiers, { nav: 0.94, date: null, ma20: 1.0, ma60: null, ma250: null, rsi14: 45, bias20: -3 })
    expect(d.action).toBe('hold')
    expect(d.reason).toContain('前置条件未满足')
  })

  it('触发条件只满足其一即可买入；高于年线不减半', () => {
    const d = evaluateStrategyTiers(tiers, { nav: 0.85, date: null, ma20: 0.9, ma60: null, ma250: 0.7, rsi14: 50, bias20: -8 })
    expect(d.action).toBe('buy')
    expect(d.buyTier?.nav).toBe(0.9)
    expect(d.amount).toBe(1000)
    expect(d.halved).toBe(false)
  })

  it('达到高抛档 → 卖出最高满足档', () => {
    const d = evaluateStrategyTiers(tiers, { nav: 1.45, date: null, ma20: 1.2, ma60: null, ma250: 1.0, rsi14: 60, bias20: 10 })
    expect(d.action).toBe('sell')
    expect(d.sellTier?.nav).toBe(1.4)
    expect(d.percent).toBe(20)
  })

  it('泡沫条件同时满足 → 清仓', () => {
    const d = evaluateStrategyTiers(tiers, { nav: 1.45, date: null, ma20: 1.1, ma60: null, ma250: 1.0, rsi14: 88, bias20: 25 })
    expect(d.action).toBe('clear')
    expect(d.percent).toBe(100)
  })

  it('停用后一律观望', () => {
    const d = evaluateStrategyTiers({ ...tiers, enabled: false }, { nav: 0.5, date: null, ma20: 1, ma60: null, ma250: null, rsi14: 5, bias20: -50 })
    expect(d.action).toBe('hold')
    expect(d.reason).toContain('已停用')
  })
})

describe('buildTierIndicatorContext', () => {
  it('序列不足时均线为 null，但仍能给出净值', () => {
    const ctx = buildTierIndicatorContext([{ date: '2026-10-01', nav: 1 }, { date: '2026-10-02', nav: 1.1 }])
    expect(ctx?.nav).toBe(1.1)
    expect(ctx?.ma20).toBeNull()
    expect(ctx?.ma250).toBeNull()
  })

  it('充分序列计算出均线与指标', () => {
    const ctx = buildTierIndicatorContext(flatHistory(300, 1))
    expect(ctx?.ma20).toBeCloseTo(1, 4)
    expect(ctx?.ma250).toBeCloseTo(1, 4)
    expect(ctx?.bias20).toBe(0)
    expect(ctx?.rsi14).toBeNull() // 恒定序列无波动
  })
})

describe('generateDefaultTiers / describeStrategyTiers', () => {
  it('默认模板围绕基准净值生成 (v1 金额制)', () => {
    const t = generateDefaultTiers(2)
    expect(t.version).toBe(1)
    expect(t.buyTiers[0]!.nav).toBeCloseTo(1.9, 4)
    expect(t.buyTiers[0]!.amount).toBe(500)
    expect(t.sellTiers[0]!.nav).toBeCloseTo(2.2, 4)
  })

  it('摘要包含金额档位信息', () => {
    const s = describeStrategyTiers(tiers)
    expect(s).toContain('RSI14≤35')
    expect(s).toContain('≤1 买¥500')
    expect(s).toContain('≥1.2 减20%')
  })
})