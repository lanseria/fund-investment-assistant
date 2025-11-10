import type { Holding } from './holding'

export interface LeaderboardUser {
  id: number // 新增用户ID
  rank: number
  username: string
  profitRate: number
  holdingCount: number
  todayProfitRate: number
  totalCost: number
  todayProfitLoss: number
  // 可选字段，用于存储展开后的持仓数据
  holdings?: Holding[]
}
