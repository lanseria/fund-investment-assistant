export interface Holding {
  code: string
  name: string
  sector: string | null
  // shares 和 costPrice 可以为 null
  shares: number | null
  costPrice: number | null
  yesterdayNav: number
  // 以下字段在“关注”状态下也为 null
  holdingAmount: number | null
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
