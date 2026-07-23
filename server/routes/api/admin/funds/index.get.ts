import { eq, sql } from 'drizzle-orm'
import { funds, holdings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 权限校验：确保是管理员
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const db = useDb()

  // LEFT JOIN holdings 聚合统计每只基金的持仓人数(shares > 0)与关注人数(shares 为 null/0)
  // 结果按基金代码升序
  return await db.select({
    code: funds.code,
    name: funds.name,
    fundType: funds.fundType,
    sector: funds.sector,
    yesterdayNav: funds.yesterdayNav,
    todayEstimateNav: funds.todayEstimateNav,
    percentageChange: funds.percentageChange,
    todayEstimateUpdateTime: funds.todayEstimateUpdateTime,
    // 持仓人数：shares 不为空且 > 0
    holderCount: sql<number>`count(${holdings.fundCode}) filter (where ${holdings.shares} is not null and ${holdings.shares} > 0)`.as('holder_count'),
    // 关注人数：shares 为空或 = 0
    watcherCount: sql<number>`count(${holdings.fundCode}) filter (where ${holdings.shares} is null or ${holdings.shares} = 0)`.as('watcher_count'),
  })
    .from(funds)
    .leftJoin(holdings, eq(funds.code, holdings.fundCode))
    .groupBy(funds.code)
    .orderBy(funds.code)
})
