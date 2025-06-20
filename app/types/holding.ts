// app/types/holding.ts
export interface Holding {
  code: string
  name: string
  shares: number
  yesterdayNav: number
  holdingAmount: number
  holdingProfitAmount: number | null
  holdingProfitRate: number | null
  todayEstimateNav: number | null
  todayEstimateAmount: number | null
  percentageChange: number | null
  todayEstimateUpdateTime: string | null
  // 策略信号
  signals: Record<string, string>
}

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
