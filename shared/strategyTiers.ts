// shared/strategyTiers.ts
// 结构化档位策略的类型、默认模板与校验，前后端共享 (Nuxt shared 目录)。
// 存储于 funds.strategy_tiers (JSONB，全局共享)，取代纯文字策略中"写死"的档位，
// 使低吸/高抛档位可手动配置、可图表化可视化、可被统一引擎执行。

import { z } from 'zod'

/**
 * 低吸档位：确认净值 ≤ nav 时买入 amount 元
 */
export const strategyBuyTierSchema = z.object({
  /** 触发净值 (含)，如 1.024 表示净值跌到 1.024 及以下触发 */
  nav: z.number().positive(),
  /** 买入金额 (元) */
  amount: z.number().positive(),
})

/**
 * 高抛档位：确认净值 ≥ nav 时卖出持仓的 percent %
 */
export const strategySellTierSchema = z.object({
  /** 触发净值 (含) */
  nav: z.number().positive(),
  /** 卖出比例 (%)，如 20 表示减仓 20% */
  percent: z.number().min(1).max(100),
})

/**
 * 泡沫清仓条件：两个条件都配置且同时满足时一次性清仓
 */
export const strategyClearRuleSchema = z.object({
  /** RSI14 下限 (含)，如 85 */
  rsi14Min: z.number().min(50).max(100).nullable(),
  /** 20 日乖离率下限 (含，百分数数值，如 20 表示 +20%) */
  bias20MinPct: z.number().min(0).max(100).nullable(),
})

/**
 * 档位策略整体结构
 */
export const strategyTiersSchema = z.object({
  /** 结构版本，当前固定为 1 */
  version: z.literal(1),
  /** 是否启用 (关闭后引擎与 AI 均忽略档位) */
  enabled: z.boolean(),
  /**
   * 低吸前置触发条件 (任一满足即可，都为 null 表示无条件、仅按档位净值触发)：
   * - rsi14Max: RSI14 上限 (含)，如 35
   * - bias20MinPct: 20 日乖离率上限 (含，负数，如 -5 表示 bias20 ≤ -5%)
   */
  trigger: z.object({
    rsi14Max: z.number().min(0).max(100).nullable(),
    bias20MinPct: z.number().min(-100).max(0).nullable(),
  }),
  /** 低吸档位列表 (nav 降序 = 越跌越深) */
  buyTiers: z.array(strategyBuyTierSchema).max(8),
  /** 高抛档位列表 (nav 升序 = 越涨越高) */
  sellTiers: z.array(strategySellTierSchema).max(8),
  /** 泡沫清仓条件，null 表示不启用 */
  clearRule: strategyClearRuleSchema.nullable(),
  /** 净值低于年线 (MA250) 时低吸金额减半 */
  halveBelowMa250: z.boolean(),
  /** 备注 (自由文本，仅供人读，不参与决策) */
  note: z.string().max(500).optional(),
})

export type StrategyBuyTier = z.infer<typeof strategyBuyTierSchema>
export type StrategySellTier = z.infer<typeof strategySellTierSchema>
export type StrategyClearRule = z.infer<typeof strategyClearRuleSchema>
export type StrategyTiers = z.infer<typeof strategyTiersSchema>

/**
 * 生成默认档位模板：以当前净值 baseNav 为基准，
 * 低吸档位 -5% / -10% / -15% / -20%，高抛档位 +10% / +20% / +30%，
 * 触发条件 RSI14 ≤ 35 或 bias20 ≤ -5%。
 */
export function generateDefaultTiers(baseNav: number): StrategyTiers {
  const round4 = (n: number) => Number(n.toFixed(4))
  return {
    version: 1,
    enabled: true,
    trigger: { rsi14Max: 35, bias20MinPct: -5 },
    buyTiers: [
      { nav: round4(baseNav * 0.95), amount: 500 },
      { nav: round4(baseNav * 0.90), amount: 600 },
      { nav: round4(baseNav * 0.85), amount: 800 },
      { nav: round4(baseNav * 0.80), amount: 1000 },
    ],
    sellTiers: [
      { nav: round4(baseNav * 1.10), percent: 20 },
      { nav: round4(baseNav * 1.20), percent: 20 },
      { nav: round4(baseNav * 1.30), percent: 10 },
    ],
    clearRule: { rsi14Min: 85, bias20MinPct: 20 },
    halveBelowMa250: true,
    note: '',
  }
}

/** 低吸首档相对最新确认净值的折扣 (与默认模板一致：-5%) */
export const TIER_FIRST_BUY_DISCOUNT = 0.95

/**
 * 以最新确认净值重铺档位净值 (v1 金额制最小版，供每周定时任务使用)：
 * - 保留：版本 / 启用状态 / 低吸触发条件 / 买入金额 / 高抛减仓比例 / 清仓条件 / 年线减半 / 备注
 * - 低吸首档锚定在 `nav × 0.95`，其余低吸档按"原档距比例"同步缩放 (形状不变)
 * - 高抛档位按同一比例缩放；若缩放后不再严格高于最新净值，则保留原高抛档 (避免误触高抛)
 * - 纯函数、幂等：用同一 nav 连续调用两次结果一致
 *
 * @returns 重铺后的档位；未启用、无低吸档或数值异常时返回 null (调用方应跳过该基金)
 */
export function repaveStrategyTiersNavs(tiers: StrategyTiers, nav: number): StrategyTiers | null {
  if (!tiers.enabled || tiers.buyTiers.length === 0)
    return null
  if (!Number.isFinite(nav) || nav <= 0)
    return null

  const round4 = (n: number) => Number(n.toFixed(4))
  const oldFirst = tiers.buyTiers[0]!.nav
  if (!(oldFirst > 0))
    return null

  const firstBuyNav = round4(nav * TIER_FIRST_BUY_DISCOUNT)
  if (!(firstBuyNav > 0))
    return null

  // 低吸：首档 -5%，其余档保持相对首档的比例
  const buyTiers = tiers.buyTiers.map(t => ({
    nav: round4(firstBuyNav * (t.nav / oldFirst)),
    amount: t.amount,
  }))
  for (let i = 0; i < buyTiers.length; i++) {
    if (!(buyTiers[i]!.nav > 0))
      return null
    // 归一化后低吸档按 nav 降序；重铺后必须仍严格递减
    if (i > 0 && !(buyTiers[i]!.nav < buyTiers[i - 1]!.nav))
      return null
  }

  // 高抛：同比例缩放；仅在所有缩放结果仍高于最新净值时采用，否则保留原高抛档位
  let sellTiers = tiers.sellTiers
  if (sellTiers.length > 0) {
    const scaled = sellTiers.map(t => ({
      nav: round4(firstBuyNav * (t.nav / oldFirst)),
      percent: t.percent,
    }))
    const valid = scaled.every((t, i) =>
      t.nav > nav && (i === 0 || t.nav > scaled[i - 1]!.nav),
    )
    if (valid)
      sellTiers = scaled
  }

  return {
    ...tiers,
    buyTiers,
    sellTiers,
  }
}

/**
 * 规范化档位：数值修正 + 排序 (买入按 nav 降序、卖出按 nav 升序)。
 * 用于保存前与读取后的兜底清洗。
 */
export function normalizeStrategyTiers(input: StrategyTiers): StrategyTiers {
  return {
    ...input,
    buyTiers: [...input.buyTiers]
      .sort((a, b) => b.nav - a.nav)
      .map(t => ({ nav: Number(t.nav.toFixed(4)), amount: Math.round(t.amount * 100) / 100 })),
    sellTiers: [...input.sellTiers]
      .sort((a, b) => a.nav - b.nav)
      .map(t => ({ nav: Number(t.nav.toFixed(4)), percent: Math.round(t.percent * 10) / 10 })),
  }
}

/** 解析 funds.strategy_tiers 的 JSON 值；无效或版本不兼容时返回 null */
export function parseStrategyTiers(raw: unknown): StrategyTiers | null {
  const result = strategyTiersSchema.safeParse(raw)
  return result.success ? normalizeStrategyTiers(result.data) : null
}
