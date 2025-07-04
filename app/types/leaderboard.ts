// app/types/leaderboard.ts
export interface LeaderboardUser {
  rank: number
  username: string
  profitRate: number
  holdingCount: number
  todayProfitRate: number // [新增] 日收益率
}
