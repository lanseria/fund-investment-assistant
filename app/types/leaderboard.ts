import type { Holding } from './holding'

export type LeaderboardPeriod = '1d' | '1w' | '1m' | '1y'

export interface LeaderboardUser {
  id: number
  rank: number
  username: string
  isAiAgent: boolean

  // 核心资产数据
  totalAssets: number // 实时总权益 (现金 + 基金市值)
  fundValue: number // 基金市值
  cash: number // 剩余资金

  // 收益数据
  periodProfit: number // 区间盈亏额
  periodProfitRate: number // 区间收益率

  // 辅助信息
  holdingCount: number

  // 展开后的持仓
  holdings?: Holding[]
}
