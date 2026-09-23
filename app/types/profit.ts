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

/** 基金收益总览单行 (持有中 + 已清仓的所有基金) */
export interface FundProfitRow {
  code: string
  name: string
  sector: string | null
  /** held: 持有中 / sold: 已清仓 */
  status: 'held' | 'sold'
  /** 首次交易日期 (yyyy-MM-dd) */
  firstTradeDate: string | null
  /** 最近交易日期 (yyyy-MM-dd) */
  lastTradeDate: string | null
  shares: number | null
  costPrice: number | null
  /** 持有总成本 = 份额 × 成本价 */
  totalCost: number | null
  /** 当前持有金额 = 份额 × 最新已确认净值 */
  holdingAmount: number | null
  /** 日收益(已确认口径) = 份额 × (最新净值 - 前一交易日净值);无前一净值为 null */
  dayProfit: number | null
  dayProfitRate: number | null
  /** 今日估算收益 (估值更新时间为今日时才有值) */
  estimateProfit: number | null
  /** 持有收益(浮动) = 持有金额 - 持有成本 */
  holdingProfit: number | null
  holdingProfitRate: number | null
  /** 累计收益 = 持有收益(浮动) + 已落袋盈亏;已清仓基金即其历史全部落袋盈亏 */
  totalProfit: number
  latestNav: number | null
}

export interface FundProfitsData {
  funds: FundProfitRow[]
  summary: {
    /** 涉及基金总数 (含已清仓) */
    fundCount: number
    heldCount: number
    soldCount: number
    /** 持有中基金的市值合计 */
    totalHoldingAmount: number
    /** 全部基金累计收益合计 */
    totalProfit: number
  }
}
