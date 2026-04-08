import type { Holding } from './holding'

export type LeaderboardPeriod = '1d' | '1w' | '1m' | '1y'

export interface LeaderboardUser {
  id: number
  rank: number
  username: string
  aiMode: 'auto' | 'draft' | 'off'
  aiSystemPrompt?: string | null

  // 核心资产数据
  totalAssets: number // 实时总权益 (现金 + 基金市值)
  fundValue: number // 基金市值
  cash: number // 剩余资金

  // 收益数据
  periodProfit: number // 区间盈亏额
  periodProfitRate: number // 区间收益率
  periodProfitRateOnCost?: number // 基金总投资收益率

  // 辅助信息
  holdingCount: number

  // 展开后的持仓
  holdings?: Holding[]

  // 当日操作统计
  todayCounts?: {
    total: number
    buy: number
    sell: number
    convert_in: number
    convert_out: number
    pending: number
    draft: number
  }
}
