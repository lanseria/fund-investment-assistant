// 待确认交易的类型定义
export interface PendingTransaction {
  id: number
  // 增加转出转入类型
  type: 'buy' | 'sell' | 'convert_out' | 'convert_in'
  status: 'pending' | 'draft'
  orderAmount: number | null
  orderShares: number | null
  orderDate: string
  createdAt: string
}

// 最近已确认交易的类型定义
export interface RecentTransaction {
  id: number
  type: 'buy' | 'sell' | 'convert_out' | 'convert_in'
  date: string // 交易日期 (orderDate)
  amount: number | null // 确认金额
  shares: number | null // 确认份额
  nav: number | null // 确认净值
}

/** 赎回费阶梯项 */
export interface RedemptionFeeItem {
  holdingPeriod: string
  rate: string
}

/** 基金费率信息(仅前端展示用) */
export interface FundFees {
  fundCode: string
  purchaseFee: string | null
  redemptionFees: RedemptionFeeItem[] | null
  managementFee: string | null
  custodyFee: string | null
  rawText: string | null
}

export interface Holding {
  code: string
  name: string
  sector: string | null
  attentionLevel: number
  /** 全局操作策略 (基金级,所有用户共享, 作为 AI 分析参考) */
  operationStrategy: string | null
  // shares 和 costPrice 可以为 null
  shares: number | null
  costPrice: number | null
  yesterdayNav: number
  // 以下字段在”关注”状态下也为 null
  holdingAmount: number | null
  holdingProfitAmount: number | null
  holdingProfitRate: number | null
  todayEstimateNav: number | null
  todayEstimateAmount: number | null
  percentageChange: number | null
  todayEstimateUpdateTime: string | null
  signals: Record<string, string>
  bias20: number | null
  // 该基金关联的待确认交易列表
  pendingTransactions?: PendingTransaction[]
  // 最近的交易历史 (已确认)
  recentTransactions?: RecentTransaction[]
  /** 基金费率信息(仅展示用,可能为 null) */
  fees?: FundFees | null
}

export type SortableKey = 'holdingAmount' | 'percentageChange' | 'holdingProfitRate' | 'bias20'

export interface HoldingHistoryPoint {
  date: string
  nav: number
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
  ma120?: number | null
}

export interface HoldingSummary {
  totalHoldingAmount: number
  totalEstimateAmount: number
  totalProfitLoss: number
  totalPercentageChange: number
  count: number
  /** 用户可用现金 */
  cash: number
  /** 总资产 = 现金 + 预估总市值 */
  totalAssets: number
  /** 估值未更新（非今日）的持仓数 */
  staleCount: number
}

/**
 * 重仓股单行(detail 接口返回:季报持仓 + 最新行情快照;行情接口不可用时行情字段为 null)
 */
export interface FundStockHoldingStock {
  /** 股票代码(6 位) */
  stockCode: string
  /** 股票名称 */
  stockName: string
  /** 占净值比例 (%) */
  pct: number
  /** 最新价 */
  price: number | null
  /** 当日涨跌幅 (%),如 -4.23 表示 -4.23% */
  changePct: number | null
  /** 行情日期(yyyy-mm-dd) */
  quoteDate: string | null
  /** 行情时间(HH:mm:ss,与 quoteDate 组合即行情更新时间) */
  quoteTime: string | null
}

/**
 * 基金重仓股持仓汇总(detail 接口 stockHoldings 字段;无股票持仓的基金为 null)
 */
export interface FundStockHoldingsSummary {
  /** 持仓报告期(yyyy-mm-dd,季报口径) */
  reportDate: string
  /** 重仓合计占净值比例 (%) */
  coverage: number
  /** 按占净值比降序 */
  stocks: FundStockHoldingStock[]
}
