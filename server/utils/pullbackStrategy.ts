// server/utils/pullbackStrategy.ts
// 「强势基金回调买入法（场外日线分批版）」决策引擎。
// 纯函数、不依赖数据库与 Nitro 运行时，便于单测与跨端复用。
//
// 只使用日净值序列（场外基金口径）：
// - 强势判定：近 1/3/6 月涨幅门槛
// - 整理判定：摆动低点抬高 + 区间波动收敛
// - 位置判定：是否站上走平/向上的 EMA9 / EMA21 / EMA50
// - 支撑区聚合：EMA 与前期高/低点落在相近价位时合并为一个支撑区
// - 风险计划：R = 入场价 - 止损价，3R/5R 分批止盈

import type {
  PullbackLevels,
  PullbackParams,
  PullbackSeries,
  PullbackSignal,
  PullbackStatus,
  PullbackStructure,
  PullbackZone,
  PullbackZonePart,
} from '~~/shared/pullbackStrategy'
import { PULLBACK_PARAMS } from '~~/shared/pullbackStrategy'

export interface NavPoint {
  date: string
  nav: number
}

export interface PullbackAnalysis {
  status: PullbackStatus
  series: PullbackSeries
  structure: PullbackStructure | null
  zones: PullbackZone[]
  /** 主支撑区：价格下方得分最高者，用于风险计划与色带强调 */
  primaryZone: PullbackZone | null
  /** 关键支撑区：全部候选中得分最高者，跌破其下沿判定形态失效 */
  keyZone: PullbackZone | null
  levels: PullbackLevels | null
  signals: { buy: PullbackSignal[], sell: PullbackSignal[] }
  dataNote: string | null
}

const r2 = (n: number) => Number(n.toFixed(2))
const r4 = (n: number) => Number(n.toFixed(4))

/**
 * EMA 序列。前 period-1 个位置为 null，第 period 个位置以 SMA 播种，
 * 其后按 EMA = close * k + prev * (1 - k) 递推（k = 2 / (period + 1)）。
 */
export function computeEmaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array.from<number | null>({ length: values.length }).fill(null)
  if (!Number.isInteger(period) || period < 1 || values.length < period)
    return out

  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++)
    seed += values[i]!

  let ema = seed / period
  out[period - 1] = r4(ema)
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k)
    out[i] = r4(ema)
  }
  return out
}

/** 滚动区间幅度（%）：窗口内 (最高 - 最低) / 最低，用于观察波动收敛 */
export function rollingRangePct(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = Array.from<number | null>({ length: values.length }).fill(null)
  if (window < 2)
    return out
  for (let i = window - 1; i < values.length; i++) {
    const slice = values.slice(i - window + 1, i + 1)
    const high = Math.max(...slice)
    const low = Math.min(...slice)
    out[i] = low > 0 ? r2((high - low) / low * 100) : null
  }
  return out
}

/** 分形摆动低点：窗口内严格低于左右各 bars 根 K 线，返回升序下标（最多保留最后 limit 个） */
export function findPivotLows(values: number[], bars = 3, limit = 4): number[] {
  const out: number[] = []
  if (bars < 1)
    return out
  for (let i = bars; i + bars < values.length; i++) {
    const v = values[i]!
    let isLow = true
    for (let j = i - bars; j <= i + bars && isLow; j++) {
      if (j !== i && values[j]! <= v)
        isLow = false
    }
    if (isLow)
      out.push(i)
  }
  return out.slice(-limit)
}

/** 分形摆动高点：窗口内严格高于左右各 bars 根 K 线 */
export function findPivotHighs(values: number[], bars = 3, limit = 4): number[] {
  const out: number[] = []
  if (bars < 1)
    return out
  for (let i = bars; i + bars < values.length; i++) {
    const v = values[i]!
    let isHigh = true
    for (let j = i - bars; j <= i + bars && isHigh; j++) {
      if (j !== i && values[j]! >= v)
        isHigh = false
    }
    if (isHigh)
      out.push(i)
  }
  return out.slice(-limit)
}

/** 近 bars 个交易日的涨幅（%）；数据不足返回 null */
export function perfOverBars(values: number[], bars: number): number | null {
  if (values.length < bars + 1)
    return null
  const past = values[values.length - 1 - bars]!
  if (!(past > 0))
    return null
  return r2((values[values.length - 1]! - past) / past * 100)
}

/**
 * 支撑位聚簇：把价位相近（相邻间距 ≤ tolerance%）的候选位合并为一个支撑区。
 * 候选位按价位升序排序后顺序归组。
 */
export function clusterLevels(
  candidates: { part: PullbackZonePart, weight: number }[],
  tolerancePct: number,
): PullbackZone[] {
  const valid = candidates
    .filter(c => Number.isFinite(c.part.value) && c.part.value > 0)
    .sort((a, b) => a.part.value - b.part.value)
  if (valid.length === 0)
    return []

  const groups: { part: PullbackZonePart, weight: number }[][] = []
  for (const c of valid) {
    const current = groups[groups.length - 1]
    const groupHigh = current ? current[current.length - 1]!.part.value : 0
    const gapPct = current ? (c.part.value - groupHigh) / groupHigh * 100 : Number.POSITIVE_INFINITY
    if (current && gapPct <= tolerancePct)
      current.push(c)
    else
      groups.push([c])
  }

  return groups.map((group) => {
    const values = group.map(g => g.part.value)
    const low = Math.min(...values)
    const high = Math.max(...values)
    return {
      low: r4(low),
      high: r4(high),
      mid: r4((low + high) / 2),
      score: group.reduce((sum, g) => sum + g.weight, 0),
      parts: group.map(g => ({ ...g.part, value: r4(g.part.value) })),
    }
  })
}

/**
 * 选择主支撑区：优先取位于当前净值下方（含 1% 容差）且得分最高者；
 * 否则取距离当前净值最近的支撑区。
 */
export function pickPrimaryZone(zones: PullbackZone[], nav: number): PullbackZone | null {
  if (zones.length === 0)
    return null
  const below = zones.filter(z => z.mid <= nav * 1.01)
  const pool = below.length > 0 ? below : zones
  return pool.reduce((best, z) => {
    if (!best)
      return z
    if (z.score !== best.score)
      return z.score > best.score ? z : best
    return z.mid > best.mid ? z : best
  }, null as PullbackZone | null)
}

/** 构建支撑区候选位（场外口径：EMA 与前高/前低，无 AVWAP） */
function buildZoneCandidates(opts: {
  emaFast: number | null
  emaMid: number | null
  emaSlow: number | null
  swingHigh: number | null
  swingLow: number | null
  recentHigh: number | null
}): { part: PullbackZonePart, weight: number }[] {
  const list: { part: PullbackZonePart, weight: number }[] = []
  const push = (type: PullbackZonePart['type'], value: number | null, label: string, weight: number) => {
    if (value !== null && Number.isFinite(value) && value > 0)
      list.push({ part: { type, value, label }, weight })
  }
  push('emaFast', opts.emaFast, 'EMA9', 1)
  push('emaMid', opts.emaMid, 'EMA21', 3)
  push('emaSlow', opts.emaSlow, 'EMA50', 2)
  push('swingHigh', opts.swingHigh, '前期高点', 2)
  push('swingLow', opts.swingLow, '前期低点', 2)
  push('recentHigh', opts.recentHigh, '区间高点', 1)
  return list
}

/**
 * 主入口：基于日净值序列（升序）完成整理判定与风险计划。
 */
export function analyzePullback(
  history: NavPoint[],
  params: PullbackParams = PULLBACK_PARAMS,
): PullbackAnalysis {
  const navs = history.map(p => p.nav)
  const dates = history.map(p => p.date)
  const emaFast = computeEmaSeries(navs, params.emaFast)
  const emaMid = computeEmaSeries(navs, params.emaMid)
  const emaSlow = computeEmaSeries(navs, params.emaSlow)
  const rangePct = rollingRangePct(navs, params.contractionWindow)
  const series: PullbackSeries = { dates, nav: navs, emaFast, emaMid, emaSlow, rangePct }

  const minBars = params.emaSlow + params.contractionWindow + params.pivotBars * 2 + 2
  if (navs.length < minBars) {
    return {
      status: 'insufficient',
      series,
      structure: null,
      zones: [],
      primaryZone: null,
      keyZone: null,
      levels: null,
      signals: { buy: [], sell: [] },
      dataNote: `历史净值仅 ${navs.length} 条，至少需要 ${minBars} 条（约 ${Math.ceil(minBars / 21)} 个月）才能判定整理结构。请先同步历史数据。`,
    }
  }

  const last = navs.length - 1
  const nav = navs[last]!

  // --- 1. 强势判定：近 1/3/6 月涨幅门槛 ---
  const perf1m = perfOverBars(navs, 21)
  const perf3m = perfOverBars(navs, 63)
  const perf6m = perfOverBars(navs, 126)
  const checks = [
    { key: '近1月', value: perf1m, threshold: params.strongPerf.m1 },
    { key: '近3月', value: perf3m, threshold: params.strongPerf.m3 },
    { key: '近6月', value: perf6m, threshold: params.strongPerf.m6 },
  ]
  const strongReasons = checks
    .filter(c => c.value !== null && c.value >= c.threshold)
    .map(c => `${c.key}涨幅 ${c.value!.toFixed(1)}% ≥ ${c.threshold}%`)
  const strong = strongReasons.length > 0

  // --- 2. 整理判定：低点抬高 + 波动收敛 ---
  const lowIdx = findPivotLows(navs, params.pivotBars, 4)
  const swingLows = lowIdx.map(i => ({ date: dates[i]!, nav: navs[i]! }))
  const lastLows = swingLows.slice(-3)
  let lowsRising: boolean | null = null
  if (lastLows.length >= 2)
    lowsRising = lastLows.every((p, i) => i === 0 || p.nav > lastLows[i - 1]!.nav * 1.002)

  const recentRange = rangePct[last] ?? null
  const priorIdx = last - params.contractionWindow
  const priorRange = priorIdx >= 0 ? rangePct[priorIdx] ?? null : null
  const contractionRatio = recentRange !== null && priorRange !== null && priorRange > 0
    ? r2(recentRange / priorRange)
    : null
  const contracting = contractionRatio !== null && contractionRatio <= params.contractionRatio

  // --- 3. 位置判定：均线方向与站上 ---
  const slopeIdx = Math.max(0, last - params.slopeBars)
  const e9 = emaFast[last]!
  const e21 = emaMid[last]!
  const e50 = emaSlow[last]!
  const emaFastPrev = emaFast[slopeIdx] ?? null
  const emaMidPrev = emaMid[slopeIdx] ?? null
  const emaFastUp = emaFastPrev !== null && e9 >= emaFastPrev * (1 - 0.002)
  const emaMidUp = emaMidPrev !== null && e21 >= emaMidPrev * (1 - 0.002)
  const aboveEma = nav > e9 && nav > e21

  const lookback = Math.min(params.structureLookback, navs.length)
  const recentHigh = Math.max(...navs.slice(navs.length - lookback))
  const drawdownFromHighPct = recentHigh > 0 ? r2((recentHigh - nav) / recentHigh * 100) : 0

  const structure: PullbackStructure = {
    bars: navs.length,
    perf1m,
    perf3m,
    perf6m,
    strong,
    strongReasons,
    swingLows,
    lowsRising,
    contractionRatio,
    contracting,
    aboveEma,
    emaFastUp,
    emaMidUp,
    drawdownFromHighPct,
  }

  // --- 4. 支撑区聚合 ---
  const highIdx = findPivotHighs(navs, params.pivotBars, 4)
  const swingHigh = highIdx.length > 0 ? navs[highIdx[highIdx.length - 1]!]! : null
  const swingLow = lowIdx.length > 0 ? navs[lowIdx[lowIdx.length - 1]!]! : null
  const zones = clusterLevels(
    buildZoneCandidates({ emaFast: e9, emaMid: e21, emaSlow: e50, swingHigh, swingLow, recentHigh }),
    params.zoneTolerancePct,
  )
  const primaryZone = pickPrimaryZone(zones, nav)
  // 关键支撑区：成分得分最高者。价格跌破它的下沿即视为强势整理形态失效
  const keyZone = zones.reduce((best, z) => {
    if (!best)
      return z
    if (z.score !== best.score)
      return z.score > best.score ? z : best
    return z.mid > best.mid ? z : best
  }, null as PullbackZone | null)

  // --- 5. 状态机 ---
  const inZone = primaryZone
    ? nav >= primaryZone.low * (1 - 0.005) && nav <= primaryZone.high * (1 + 0.01)
    : false
  let status: PullbackStatus
  if (!strong)
    status = 'not_strong'
  else if (keyZone && nav < keyZone.low * 0.995)
    status = 'breakdown'
  else if (inZone && aboveEma && emaFastUp)
    status = 'buy_ready'
  else if ((contracting || lowsRising === true) && nav > e9)
    status = 'watching'
  else
    status = 'no_base'

  // --- 6. 风险计划：R = 入场价 - 止损价 ---
  // 只在整理结构有效（等回踩 / 已触发）时给出计划；形态失效或非强势一律不给进场计划，
  // 避免"跌破支撑还推荐入场"与"不接刀"的纪律相冲突。
  let levels: PullbackLevels | null = null
  if (primaryZone && nav > 0 && (status === 'buy_ready' || status === 'watching')) {
    const supportLow = Math.min(primaryZone.low, swingLow ?? Number.POSITIVE_INFINITY)
    const rawStop = supportLow * (1 - params.stopBufferPct / 100)
    const rawStopPct = (nav - rawStop) / nav * 100

    let stop = rawStop
    let stopTightened = false
    let stopWidened = false
    let stopSource = `支撑区下沿 ${r4(supportLow)} 下方 ${params.stopBufferPct}% 缓冲`

    if (!(rawStopPct > 0)) {
      stop = nav * (1 - params.minStopPct / 100)
      stopWidened = true
      stopSource = `支撑位高于入场价，按最小止损带宽 ${params.minStopPct}% 外推`
    }
    else if (rawStopPct > params.maxStopPct) {
      stop = nav * (1 - params.maxStopPct / 100)
      stopTightened = true
      stopSource = `支撑区距离 ${rawStopPct.toFixed(2)}% 过宽，按纪律上限 ${params.maxStopPct}% 收紧`
    }
    else if (rawStopPct < params.minStopPct) {
      stop = nav * (1 - params.minStopPct / 100)
      stopWidened = true
      stopSource = `支撑过近（${rawStopPct.toFixed(2)}%），按最小带宽 ${params.minStopPct}% 外推`
    }

    const perShareRisk = nav - stop
    levels = {
      entry: r4(nav),
      stop: r4(stop),
      stopPct: r2((nav - stop) / nav * 100),
      perShareRisk: r4(perShareRisk),
      stopSource,
      stopTightened,
      stopWidened,
      targets: params.targetR.map((r, i) => ({
        r,
        nav: r4(nav + perShareRisk * r),
        portionPct: params.targetPortions[i] ?? 0,
      })),
      remainderPct: Math.max(0, 100 - params.targetPortions.reduce((s, v) => s + v, 0)),
    }
  }

  // --- 7. 历史信号：回踩后重新站上 EMA9（买入）/ 跌破 EMA9（剩余仓位跟踪） ---
  const buy: PullbackSignal[] = []
  const sell: PullbackSignal[] = []
  let lastBuyIdx = -Infinity
  for (let i = Math.max(1, params.emaSlow); i < navs.length; i++) {
    const prevE9 = emaFast[i - 1] ?? null
    const curE9 = emaFast[i] ?? null
    const curE21 = emaMid[i] ?? null
    const baseE9 = emaFast[Math.max(0, i - params.slopeBars)] ?? null
    if (prevE9 === null || curE9 === null || curE21 === null || baseE9 === null)
      continue

    const reclaimed = navs[i - 1]! <= prevE9 && navs[i]! > curE9
    if (reclaimed && navs[i]! > curE21 && curE9 >= baseE9 * (1 - 0.002) && i - lastBuyIdx >= 5) {
      buy.push({
        date: dates[i]!,
        nav: r4(navs[i]!),
        reason: `回踩后重新站上走平/向上的 EMA${params.emaFast}，且位于 EMA${params.emaMid} 上方`,
      })
      lastBuyIdx = i
    }

    const lost = navs[i - 1]! > prevE9 && navs[i]! < curE9
    if (lost) {
      sell.push({
        date: dates[i]!,
        nav: r4(navs[i]!),
        reason: `跌破 EMA${params.emaFast}，剩余仓位按纪律减仓/离场跟踪`,
      })
    }
  }

  const dataNote = `最新净值 ${r4(nav)}（${dates[last]}）`
  return {
    status,
    series,
    structure,
    zones,
    primaryZone,
    keyZone,
    levels,
    signals: { buy, sell: sell.slice(-20) },
    dataNote,
  }
}
