import { eq, sql } from 'drizzle-orm'
import { funds, holdings, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async () => {
  const db = useDb()

  // 计算每个用户的当前持仓总市值
  // 使用 COALESCE 优先取今日估值，否则取昨日净值
  const userHoldingsValue = await db
    .select({
      userId: holdings.userId,
      totalValue: sql<number>`SUM(${holdings.shares} * COALESCE(${funds.todayEstimateNav}, ${funds.yesterdayNav}))`,
    })
    .from(holdings)
    .leftJoin(funds, eq(holdings.fundCode, funds.code))
    .groupBy(holdings.userId)

  let updatedCount = 0

  // 批量更新用户表
  for (const record of userHoldingsValue) {
    if (record.totalValue > 0) {
      await db.update(users)
        .set({ totalAssets: String(record.totalValue) })
        .where(eq(users.id, record.userId))
      updatedCount++
    }
  }

  return { message: `已根据当前持仓市值初始化了 ${updatedCount} 个用户的总资产。` }
})
