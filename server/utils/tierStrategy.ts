// server/utils/tierStrategy.ts
// 档位策略决策引擎：所有基金共用同一套规则，输入结构化档位 + 技术指标上下文，
// 输出 buy/sell/clear/hold 决策。纯函数、不依赖数据库，便于单测与跨端复用。

import type { StrategyBuyTier, StrategySellTier, StrategyTiers } from '~~/shared/strategyTiers'
import { computeBiasPct, computeRsi } from './indicators'

/**
 * 技术指标上下文 (全部基于已确认净值序列计算)
 */
export interface TierIndicatorContext {
  /** 基准净值 (最新已确认净值) */
  nav: number
  /** 基准日期 (YYYY-MM-DD) */
  date: string | null
  ma20: number | null
  ma60: number | null
  /** 年线；历史不足 250 日时为 null */
  ma250: number | null
  /** 14 日 RSI (与策略引擎 RSI14 同口径) */
  rsi14: number | null
  /** 20 日乖离率 (%, 如 -5.1 表示低于 MA20 5.1%) */
  bias20: number | null
}

export type TierAction = 'buy' | 'sell' | 'clear' | 'hold'

export interface TierDecision {
  action: TierAction
  /** buy: 买入金额 (元, 已应用减半等修正) */
  amount: number | null
  /** sell/clear: 卖出比例 (%) */
  percent: number | null
  /** 命中的档位 */
  buyTier: StrategyBuyTier | null
  sellTier: StrategySellTier | null
  /** 低吸前置条件是否满足 (null=无条件/无法判定但放行) */
  triggerMatched: boolean | null
  /** 是否因低于年线而金额减半 */
  halved: boolean
  /** 人类可读的决策理由 */
  reason: string
}

/**
 * 从已确认净值序列 (升序) 构建指标上下文。
 * @param history 净值序列 [{ date, nav }]，按时间升序
 */
export function buildTierIndicatorContext(history: { date: string, nav: number }[]): TierIndicatorContext | null {
  if (history.length === 0)
    return null

  const navs = history.map(p => p.nav)
  const nav = navs[navs.length - 1]!

  const ma = (period: number): number | null => {
    if (navs.length < period)
      return null
    const window = navs.slice(-period)
    return Number((window.reduce((s, v) => s + v, 0) / period).toFixed(4))
  }

  const ma20 = ma(20)
  return {
    nav,
    date: history[history.length - 1]!.date ?? null,
    ma20,
    ma60: ma(60),
    ma250: ma(250),
    rsi14: computeRsi(navs, 14),
    bias20: computeBiasPct(nav, ma20),
  }
}

/**
 * 低吸前置条件 (任一满足；无法判定的条件视为不满足；所有条件都无法判定时按净值档位直接触发)
 */
function evaluateTrigger(tiers: StrategyTiers, ctx: TierIndicatorContext): boolean | null {
  const { rsi14Max, bias20MinPct } = tiers.trigger
  const hasRsiCondition = rsi14Max !== null
  const hasBiasCondition = bias20MinPct !== null
  if (!hasRsiCondition && !hasBiasCondition)
    return null // 未配置条件，仅按净值档位触发

  let evaluable = false
  if (hasRsiCondition && ctx.rsi14 !== null) {
    evaluable = true
    if (ctx.rsi14 <= rsi14Max!)
      return true
  }
  if (hasBiasCondition && ctx.bias20 !== null) {
    evaluable = true
    if (ctx.bias20 <= bias20MinPct!)
      return true
  }
  // 所有条件都无法判定 (指标数据缺失) 时，放行按档位执行
  return evaluable ? false : null
}

/**
 * 执行档位策略决策。优先级: 泡沫清仓 > 高抛 > 低吸 > 持有。
 */
export function evaluateStrategyTiers(tiers: StrategyTiers, ctx: TierIndicatorContext): TierDecision {
  const base: TierDecision = {
    action: 'hold',
    amount: null,
    percent: null,
    buyTier: null,
    sellTier: null,
    triggerMatched: null,
    halved: false,
    reason: '',
  }

  if (!tiers.enabled)
    return { ...base, reason: '档位策略已停用' }

  // 1. 泡沫清仓：两个条件均配置且同时满足
  if (tiers.clearRule) {
    const { rsi14Min, bias20MinPct } = tiers.clearRule
    const rsiOk = rsi14Min !== null && ctx.rsi14 !== null && ctx.rsi14 >= rsi14Min
    const biasOk = bias20MinPct !== null && ctx.bias20 !== null && ctx.bias20 >= bias20MinPct
    if (rsiOk && biasOk) {
      return {
        ...base,
        action: 'clear',
        percent: 100,
        reason: `泡沫清仓：RSI14 ${ctx.rsi14} ≥ ${rsi14Min} 且 bias20 ${ctx.bias20}% ≥ ${bias20MinPct}%`,
      }
    }
  }

  // 2. 高抛：净值 ≥ 档位阈值时触发最深一档 (阈值最高的满足档)
  const sellHit = tiers.sellTiers.filter(t => ctx.nav >= t.nav)
  if (sellHit.length > 0) {
    const deepest = sellHit.reduce((a, b) => (b.nav >= a.nav ? b : a))
    return {
      ...base,
      action: 'sell',
      percent: deepest.percent,
      sellTier: deepest,
      reason: `高抛：净值 ${ctx.nav} ≥ 档位 ${deepest.nav}，减仓 ${deepest.percent}%`,
    }
  }

  // 3. 低吸：净值 ≤ 档位阈值时触发最深一档 (阈值最低的满足档)
  const triggerMatched = evaluateTrigger(tiers, ctx)
  const buyHit = tiers.buyTiers.filter(t => ctx.nav <= t.nav)
  if (buyHit.length > 0) {
    if (triggerMatched === false) {
      return {
        ...base,
        triggerMatched,
        reason: `净值 ${ctx.nav} 已进入低吸档，但前置条件未满足 (RSI14 ≤ ${tiers.trigger.rsi14Max} 或 bias20 ≤ ${tiers.trigger.bias20MinPct}%)，暂不买入`,
      }
    }
    const deepest = buyHit.reduce((a, b) => (b.nav <= a.nav ? b : a))
    const halved = tiers.halveBelowMa250 && ctx.ma250 !== null && ctx.nav < ctx.ma250
    const amount = halved ? Math.round(deepest.amount / 2) : deepest.amount
    const halveNote = halved ? '(低于年线 MA250，金额减半)' : ''
    return {
      ...base,
      action: 'buy',
      amount,
      buyTier: deepest,
      triggerMatched,
      halved,
      reason: `低吸：净值 ${ctx.nav} ≤ 档位 ${deepest.nav}，买入 ¥${amount}${halveNote}`,
    }
  }

  return {
    ...base,
    triggerMatched,
    reason: `观望：净值 ${ctx.nav} 未触及任何档位 (低吸最高档 ${tiers.buyTiers[0]?.nav ?? '-'} / 高抛最低档 ${tiers.sellTiers[0]?.nav ?? '-'})`,
  }
}

/**
 * 档位策略的人类可读摘要，用于 AI 交易上下文与 MCP 输出。
 */
export function describeStrategyTiers(tiers: StrategyTiers): string {
  if (!tiers.enabled)
    return '档位策略：已停用'
  const buy = tiers.buyTiers.map(t => `≤${t.nav} 买¥${t.amount}`).join('；')
  const sell = tiers.sellTiers.map(t => `≥${t.nav} 减${t.percent}%`).join('；')
  const trigger = [
    tiers.trigger.rsi14Max !== null ? `RSI14≤${tiers.trigger.rsi14Max}` : null,
    tiers.trigger.bias20MinPct !== null ? `bias20≤${tiers.trigger.bias20MinPct}%` : null,
  ].filter(Boolean).join(' 或 ')
  const clear = tiers.clearRule
    ? `清仓: RSI14≥${tiers.clearRule.rsi14Min} 且 bias20≥${tiers.clearRule.bias20MinPct}%`
    : ''
  return [
    `低吸(${trigger || '无条件'})：${buy || '无'}`,
    `高抛：${sell || '无'}`,
    clear,
    tiers.halveBelowMa250 ? '低于年线低吸减半' : '',
  ].filter(Boolean).join('｜')
}
