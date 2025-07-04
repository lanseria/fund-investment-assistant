// app/types/holding.ts
export interface Holding {
  code: string
  name: string
  shares: number
  // [新增] 成本价
  costPrice: number
  yesterdayNav: number
  // 下面这些都是从后端计算好的，保持不变
  holdingAmount: number
  holdingProfitAmount: number | null
  holdingProfitRate: number | null
  todayEstimateNav: number | null
  todayEstimateAmount: number | null
  percentageChange: number | null
  todayEstimateUpdateTime: string | null
  signals: Record<string, string>
}

export type SortableKey = 'holdingAmount' | 'percentageChange' | 'holdingProfitRate'

export interface HoldingHistoryPoint {
  date: string
  nav: number
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
}

export interface HoldingSummary {
  totalHoldingAmount: number
  totalEstimateAmount: number
  totalProfitLoss: number
  totalPercentageChange: number
  count: number
}
