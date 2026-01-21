import BigNumber from 'bignumber.js'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })
  }

  const db = useDb()

  // 1. 获取所有用户
  const usersList = await db.query.users.findMany({
    orderBy: (users, { asc }) => [asc(users.createdAt)],
    columns: {
      id: true,
      username: true,
      role: true,
      isAiAgent: true,
      aiSystemPrompt: true,
      availableCash: true, // 获取可用现金
      createdAt: true,
    },
  })

  // 2. 获取所有持仓并关联基金信息
  const allHoldings = await db.query.holdings.findMany({
    with: {
      fund: true,
    },
  })

  // 3. 在内存中聚合计算每个用户的资产和持仓计数
  const userStatsMap = new Map<number, { fundValue: number, holdingCount: number, watchingCount: number }>()

  for (const h of allHoldings) {
    if (!h.fund)
      continue

    // 优先使用今日实时估值，否则使用昨日净值
    const price = h.fund.todayEstimateNav ? Number(h.fund.todayEstimateNav) : Number(h.fund.yesterdayNav)
    const shares = new BigNumber(h.shares || 0)
    const value = shares.multipliedBy(price).toNumber()

    const stats = userStatsMap.get(h.userId) || { fundValue: 0, holdingCount: 0, watchingCount: 0 }

    stats.fundValue += value

    // 统计持仓 vs 关注
    if (shares.gt(0)) {
      stats.holdingCount++
    }
    else {
      stats.watchingCount++
    }

    userStatsMap.set(h.userId, stats)
  }

  // 4. 合并数据返回
  return usersList.map((u) => {
    const cash = Number(u.availableCash || 0)
    const stats = userStatsMap.get(u.id) || { fundValue: 0, holdingCount: 0, watchingCount: 0 }
    const totalAssets = cash + stats.fundValue

    return {
      ...u,
      cash,
      fundValue: stats.fundValue,
      holdingCount: stats.holdingCount,
      watchingCount: stats.watchingCount,
      totalAssets,
    }
  })
})
