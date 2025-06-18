// app/types/holding.ts
export interface Holding {
  code: string
  name: string
  shares: number
  yesterday_nav: number
  holding_amount: number
  today_estimate_nav: number | null
  today_estimate_amount: number | null
  percentage_change: number | null
  today_estimate_update_time: string | null // datetime 字符串
}

export interface HoldingHistoryPoint {
  date: string
  nav: number
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
  // ... 其他可能的均线
}
