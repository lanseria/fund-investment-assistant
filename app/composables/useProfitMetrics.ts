import type { DailyProfitPoint } from '~/types/profit'

export interface ProfitMetrics {
  /** 累计盈亏 */
  totalProfit: number
  /** 累计收益率 (%) */
  totalProfitRate: number
  /** 最大回撤 (%) - 峰值到谷值的最大跌幅 */
  maxDrawdown: number
  /** 年化收益率 (%) - 根据持仓天数折算 */
  annualizedReturn: number
  /** 年化波动率 (%) - 日收益率标准差 × √252 */
  annualizedVolatility: number
  /** 夏普比率 - (年化收益 / 年化波动)，无风险利率假设 0 */
  sharpeRatio: number
  /** 盈利天数 */
  profitableDays: number
  /** 亏损天数 */
  losingDays: number
}

/**
 * 从收益历史时间序列计算风险与表现指标。
 * 纯前端计算，不依赖后端改动。
 *
 * @param history 日级收益序列
 * @returns 风险指标集合
 */
export function calcProfitMetrics(history: DailyProfitPoint[]): ProfitMetrics {
  if (!history || history.length === 0) {
    return {
      totalProfit: 0,
      totalProfitRate: 0,
      maxDrawdown: 0,
      annualizedReturn: 0,
      annualizedVolatility: 0,
      sharpeRatio: 0,
      profitableDays: 0,
      losingDays: 0,
    }
  }

  const last = history[history.length - 1]!

  // --- 1. 最大回撤 ---
  // 遍历累计收益序列，追踪历史峰值，计算每个点相对峰值的回撤
  let peak = -Infinity
  let maxDrawdown = 0
  for (const p of history) {
    if (p.totalProfit > peak)
      peak = p.totalProfit
    if (peak > 0) {
      const drawdown = (peak - p.totalProfit) / peak * 100
      if (drawdown > maxDrawdown)
        maxDrawdown = drawdown
    }
  }

  // --- 2. 日收益率序列（用于波动率和夏普） ---
  const dayRates = history.map(p => p.dayProfitRate).filter(r => Number.isFinite(r))

  // --- 3. 年化波动率 = 日收益率标准差 × √252 ---
  let annualizedVolatility = 0
  if (dayRates.length > 1) {
    const mean = dayRates.reduce((s, r) => s + r, 0) / dayRates.length
    const variance = dayRates.reduce((s, r) => s + (r - mean) ** 2, 0) / (dayRates.length - 1)
    annualizedVolatility = Math.sqrt(variance) * Math.sqrt(252)
  }

  // --- 4. 年化收益率 ---
  // 持仓天数（交易日近似为自然日 × 5/7，这里直接用总天数折算）
  const totalDays = history.length
  let annualizedReturn = 0
  if (totalDays > 0 && last.totalProfitRate !== 0) {
    annualizedReturn = last.totalProfitRate * (365 / totalDays)
  }

  // --- 5. 夏普比率（无风险利率设为 0） ---
  const sharpeRatio = annualizedVolatility > 0
    ? annualizedReturn / annualizedVolatility
    : 0

  // --- 6. 盈亏天数统计 ---
  const profitableDays = history.filter(p => p.dayProfit > 0.01).length
  const losingDays = history.filter(p => p.dayProfit < -0.01).length

  return {
    totalProfit: last.totalProfit,
    totalProfitRate: last.totalProfitRate,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    annualizedReturn: Number(annualizedReturn.toFixed(2)),
    annualizedVolatility: Number(annualizedVolatility.toFixed(2)),
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    profitableDays,
    losingDays,
  }
}

/**
 * composable 包装，方便在 setup 中直接使用。
 */
export function useProfitMetrics(history: Ref<DailyProfitPoint[] | null | undefined> | ComputedRef<DailyProfitPoint[]>) {
  return computed(() => {
    const h = isRef(history) ? history.value : (history as any).value
    return calcProfitMetrics(h || [])
  })
}
