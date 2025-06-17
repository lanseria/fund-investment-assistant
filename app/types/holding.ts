// app/types/holding.ts
export interface Holding {
  code: string
  name: string
  yesterday_nav: number
  holding_amount: number
  today_estimate_nav: number | null
}

export interface HoldingHistoryPoint {
  date: string
  nav: number
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
  // ... 其他可能的均线
}