// shared/pullbackStrategy.ts
// 「强势基金回调买入法」场外降级版（Martin Luk 回调买入法的基金化改造）：
// 参数、类型与仓位计算前后端共享。
//
// 为什么是"降级版"：策略原文面向可盘中交易的场内 ETF/LOF（分钟级买点 + 即时止损），
// 场外基金净值为 T-1、无成交量与开高低价、且本系统不支持挂单，因此这里只保留
// 日线可用部分：EMA9/21/50 + 回调低点抬高 + 波动收敛 + 支撑区聚合 + R 倍数风险计划。

/** 由日净值序列推导出的当前阶段 */
export type PullbackStatus
  /** 历史净值不足，无法判定整理结构 */
  = | 'insufficient'
  /** 不满足"强势"前提（近1/3/6月涨幅未达门槛） */
    | 'not_strong'
  /** 强势但无整理结构（既未收敛，也无低点抬高） */
    | 'no_base'
  /** 强势整理中：等待回踩支撑区 */
    | 'watching'
  /** 回踩支撑区并重新站上走平/向上的 EMA9（买入触发） */
    | 'buy_ready'
  /** 跌破支撑区下沿，形态失效 */
    | 'breakdown'
  /** 场内基金等不适用对象 */
    | 'unsupported'

export const PULLBACK_STATUS_LABEL: Record<PullbackStatus, string> = {
  insufficient: '历史数据不足',
  not_strong: '不符合（非强势）',
  no_base: '不符合（无整理结构）',
  watching: '强势整理中·等回踩',
  buy_ready: '回踩触发·可分批低吸',
  breakdown: '跌破支撑·形态失效',
  unsupported: '不适用（仅场内）',
}

/**
 * 策略参数。所有阈值集中在此，便于单测覆盖与后续调整。
 */
export interface PullbackParams {
  /** 快速均线周期（原文 9 日 EMA） */
  emaFast: number
  /** 中期均线（原文 21 日 EMA） */
  emaMid: number
  /** 慢速均线（原文 50 日 EMA） */
  emaSlow: number
  /** 均线走平/向上的斜率观察窗口（交易日） */
  slopeBars: number
  /** 分形摆动高低点左右各取几根 K 线确认 */
  pivotBars: number
  /** 波动收敛观察窗口（交易日），与前一窗口比较 */
  contractionWindow: number
  /** 近期区间幅度 / 前一区间幅度 ≤ 该值判定为"波动越来越小" */
  contractionRatio: number
  /** 支撑位聚簇容差（%），相近价位合并为同一支撑区 */
  zoneTolerancePct: number
  /** 结构回看窗口（交易日），用于取近期高点 */
  structureLookback: number
  /** 止损缓冲（%），置于支撑区下沿之下 */
  stopBufferPct: number
  /** 止损距离下限（%）。过近则噪声触发，按最小带宽外推 */
  minStopPct: number
  /** 止损距离上限（%）。原文要求多数交易控制在 2.5%~3% */
  maxStopPct: number
  /** 单笔计划账户风险（占账户总资产 %），原文约 0.5% */
  riskPerTradePct: number
  /** 分批止盈的 R 倍数 */
  targetR: number[]
  /** 各 R 倍数对应减仓比例（%），与 targetR 一一对应 */
  targetPortions: number[]
  /** "强势"门槛：近1月 / 近3月 / 近6月涨幅（%），任一达到即视为强势 */
  strongPerf: { m1: number, m3: number, m6: number }
}

export const PULLBACK_PARAMS: PullbackParams = {
  emaFast: 9,
  emaMid: 21,
  emaSlow: 50,
  slopeBars: 5,
  pivotBars: 3,
  contractionWindow: 10,
  contractionRatio: 0.8,
  zoneTolerancePct: 1.5,
  structureLookback: 60,
  stopBufferPct: 0.5,
  minStopPct: 1.5,
  maxStopPct: 3,
  riskPerTradePct: 0.5,
  targetR: [3, 5],
  targetPortions: [50, 30],
  strongPerf: { m1: 10, m3: 20, m6: 30 },
}

/** 支撑区构成成分 */
export interface PullbackZonePart {
  type: 'emaFast' | 'emaMid' | 'emaSlow' | 'swingHigh' | 'swingLow' | 'recentHigh'
  value: number
  label: string
}

/** 由相近价位聚合出的支撑区 */
export interface PullbackZone {
  low: number
  high: number
  mid: number
  /** 成分加权得分，越高越可信 */
  score: number
  parts: PullbackZonePart[]
}

export interface PullbackStructure {
  bars: number
  perf1m: number | null
  perf3m: number | null
  perf6m: number | null
  strong: boolean
  strongReasons: string[]
  swingLows: { date: string, nav: number }[]
  /** true=低点抬高 / false=低点未抬高 / null=摆动低点不足无法判定 */
  lowsRising: boolean | null
  /** 近期区间幅度 ÷ 前一区间幅度；<1 表示波动收敛 */
  contractionRatio: number | null
  contracting: boolean
  aboveEma: boolean
  emaFastUp: boolean
  emaMidUp: boolean
  /** 距区间高点回撤（%） */
  drawdownFromHighPct: number
}

export interface PullbackSeries {
  dates: string[]
  nav: number[]
  emaFast: (number | null)[]
  emaMid: (number | null)[]
  emaSlow: (number | null)[]
  /** 滚动区间幅度（%），用于观察"上下波动越来越小" */
  rangePct: (number | null)[]
}

export interface PullbackSignal {
  date: string
  nav: number
  reason: string
}

/** 风险计划的价格部分（不含金额/份额，金额部分由账户信息在前端计算） */
export interface PullbackLevels {
  /** 入场参考价（最新已确认净值） */
  entry: number
  stop: number
  /** 止损距离（%） */
  stopPct: number
  /** 每份风险 R（元/份） */
  perShareRisk: number
  stopSource: string
  /** 支撑区过远，止损被 3% 纪律上限收紧 */
  stopTightened: boolean
  /** 支撑过近，止损被最小带宽外推 */
  stopWidened: boolean
  targets: { r: number, nav: number, portionPct: number }[]
  /** 未在 R 倍数内了结的剩余仓位跟踪方式 */
  remainderPct: number
}

export interface PullbackAccount {
  /** 账户总资产（元），优先生效 */
  totalAssets: number
  /** 可用现金（元） */
  cash: number
}

export interface PullbackRiskPlan {
  /** 风险基数（总资产优先，缺失时退化为现金） */
  riskBase: number
  /** 允许亏损金额（元） */
  riskAmount: number
  /** 建议买入金额（元，按 10 元向下取整） */
  amount: number
  /** 未取整的建议金额（元） */
  amountExact: number
  /** 估算份额（份） */
  shares: number
  /** 按取整后金额回算的实际风险（元） */
  actualRisk: number
  amountPctOfAssets: number
  amountPctOfCash: number
  /** 建议金额被可用现金截断 */
  cappedByCash: boolean
}

export interface PullbackStrategyResponse {
  supported: boolean
  unsupportedReason: string | null
  code: string
  name: string
  fundType: string
  latestNav: number | null
  latestDate: string | null
  status: PullbackStatus
  statusLabel: string
  series: PullbackSeries | null
  structure: PullbackStructure | null
  zones: PullbackZone[]
  primaryZone: PullbackZone | null
  /** 关键支撑区：得分最高者，跌破其下沿判定形态失效 */
  keyZone: PullbackZone | null
  levels: PullbackLevels | null
  signals: { buy: PullbackSignal[], sell: PullbackSignal[] }
  dataNote: string | null
  params: PullbackParams
  limitations: string[]
}

/**
 * 场外降级说明。始终随接口返回并在图上展示，避免用户按场内规则操作。
 */
export const PULLBACK_LIMITATIONS: string[] = [
  '场外基金净值为 T-1 公布，当日无法盘中触发买点，本图以日线口径给出次日分批低吸计划。',
  '本系统不支持挂止损单/条件单，止损位仅为纪律参考，需自行在交易平台执行。',
  'AVWAP 需要成交量数据，场外基金无成交量，已用 EMA 与前高/前低聚合支撑区替代。',
  '跳空缺口与日内高低点需要开高低价，场外只有单位净值，相关要素不参与判定。',
  '1/5/15 分钟突破触发仅适用于场内 ETF/LOF，场外不可执行，故本图不含分钟子图。',
  '不足 7 天赎回费率为 1.5%，若止损距离小于该费率，单笔期望为负，请先核对持有期。',
  '选基环节（近1/3/6月涨幅排名、流动性、规模、溢价率）需要全市场数据，不在本图范围内。',
]

/**
 * 仓位计算：买入份额 = 账户允许亏损金额 ÷ 每份风险。
 *
 * 与原文一致：先定买点与止损点 → 用允许亏损金额除以每份风险得到份额 → 金额受可用现金约束。
 * 金额按 10 元向下取整（场外按金额申购），份额为估算值。
 */
export function computePullbackRiskPlan(
  levels: Pick<PullbackLevels, 'entry' | 'perShareRisk'>,
  account: PullbackAccount,
  params: PullbackParams = PULLBACK_PARAMS,
): PullbackRiskPlan | null {
  const entry = Number(levels?.entry)
  const perShareRisk = Number(levels?.perShareRisk)
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(perShareRisk) || perShareRisk <= 0)
    return null

  const totalAssets = Number(account?.totalAssets) || 0
  const cash = Number(account?.cash) || 0
  const riskBase = totalAssets > 0 ? totalAssets : cash
  if (!(riskBase > 0))
    return null

  const riskAmount = riskBase * params.riskPerTradePct / 100
  const sharesRaw = riskAmount / perShareRisk
  const amountExact = sharesRaw * entry
  // 现金未知（0）时不截断，仅在有确切现金时约束
  const cashCap = cash > 0 ? cash : Number.POSITIVE_INFINITY
  const cappedByCash = amountExact > cashCap
  const capped = Math.min(amountExact, cashCap)
  let amount = Math.floor(capped / 10) * 10
  if (amount === 0 && capped >= 10)
    amount = 10

  const shares = Number((amount / entry).toFixed(2))
  const actualRisk = Number((shares * perShareRisk).toFixed(2))

  return {
    riskBase: Number(riskBase.toFixed(2)),
    riskAmount: Number(riskAmount.toFixed(2)),
    amount: Number(amount.toFixed(2)),
    amountExact: Number(amountExact.toFixed(2)),
    shares,
    actualRisk,
    amountPctOfAssets: totalAssets > 0 ? Number((amount / totalAssets * 100).toFixed(2)) : 0,
    amountPctOfCash: cash > 0 ? Number((amount / cash * 100).toFixed(2)) : 0,
    cappedByCash,
  }
}
