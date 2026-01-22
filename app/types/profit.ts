export interface DailyProfitPoint {
  date: string
  totalAssets: number // 当日总资产
  dayProfit: number // 当日盈亏额
  dayProfitRate: number // 当日收益率
  totalProfit: number // 累计盈亏额
  totalProfitRate: number // 累计收益率
}

export interface ProfitAnalysisData {
  summary: {
    yesterdayProfit: number
    yearProfit: number
    totalProfitRate: number
    totalAssets: number
  }
  history: DailyProfitPoint[] // 历史曲线数据
  calendar: Record<string, number> // 日期 -> 盈亏额 映射，用于日历
}
