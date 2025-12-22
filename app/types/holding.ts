// 待确认交易的类型定义
export interface PendingTransaction {
  id: number
  // [修改] 增加转出转入类型
  type: 'buy' | 'sell' | 'convert_out' | 'convert_in'
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
  bias20: number | null
  // 该基金关联的待确认交易列表
  pendingTransactions?: PendingTransaction[]
  // 最近的交易历史 (已确认)
  recentTransactions?: RecentTransaction[]
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
}

// 新增类型：用于描述按板块分组后的数据结构
export interface GroupedHolding {
  sectorKey: string
  sectorLabel: string
  holdings: Holding[]
  holdingCount: number
  groupTotalAmount: number
  groupTotalProfitLoss: number
}
