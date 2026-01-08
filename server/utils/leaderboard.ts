import type { LeaderboardUser } from '~/types/leaderboard'
// server/utils/leaderboard.ts
import { sql } from 'drizzle-orm'
import { funds, holdings, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export async function getLeaderboardData(): Promise<LeaderboardUser[]> {
  const db = useDb()

  // [修改] 更新 SQL 查询以包含总成本和今日盈亏
  const query = sql`
    WITH user_portfolio AS (
      SELECT
        h.user_id,
        -- 持仓总成本 (份额 * 成本价)
        SUM(h.shares * h.cost_price) as total_cost,
        -- 昨日持仓总市值 (份额 * 昨日净值)
        SUM(h.shares * f.yesterday_nav::real) as total_yesterday_value,
        -- 预估总市值 (份额 * 估算净值)，回退到昨日净值
        SUM(h.shares * COALESCE(f.today_estimate_nav, f.yesterday_nav::real)) as total_estimate_value,
        -- 持有基金数量
        COUNT(h.fund_code) as holding_count
      FROM ${holdings} as h
      JOIN ${funds} as f ON h.fund_code = f.code
      GROUP BY h.user_id
    )
    SELECT
      -- [修改] 选择真实的用户 ID
      u.id,
      u.username, -- [修改] 不再匿名化，显示完整用户名
      u.is_ai_agent, -- [新增] 获取 AI 标识
      -- 总收益率 (基于成本)
      CASE 
        WHEN up.total_cost > 0 THEN ((up.total_estimate_value - up.total_cost) / up.total_cost) * 100
        ELSE 0
      END as profit_rate,
      -- 日收益率 (基于昨日市值)
      CASE
        WHEN up.total_yesterday_value > 0 THEN ((up.total_estimate_value - up.total_yesterday_value) / up.total_yesterday_value) * 100
        ELSE 0
      END as today_profit_rate,
      up.holding_count,
      -- 直接选择持仓总成本
      up.total_cost,
      -- 计算今日预估总盈亏
      (up.total_estimate_value - up.total_yesterday_value) as today_profit_loss
    FROM user_portfolio as up
    JOIN ${users} as u ON up.user_id = u.id
    -- 过滤掉没有有效成本或昨日市值的用户
    WHERE up.total_cost > 0 AND up.total_yesterday_value > 0
    ORDER BY profit_rate DESC
    LIMIT 20;
  `

  const result = await db.execute(query)

  // [修改] 映射新字段到返回对象
  return result.rows.map((row: any, index: number) => ({
    id: Number(row.id), // [新增] 映射用户 ID
    rank: index + 1,
    username: row.username,
    isAiAgent: Boolean(row.is_ai_agent), // [新增] 映射字段
    profitRate: Number(row.profit_rate),
    holdingCount: Number(row.holding_count),
    todayProfitRate: Number(row.today_profit_rate),
    totalCost: Number(row.total_cost),
    todayProfitLoss: Number(row.today_profit_loss),
  }))
}
