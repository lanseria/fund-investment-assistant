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

  // 2. 获取所有持仓并关联基金信息 (用于计算市值)
  // 虽然这里拉取了所有持仓，但对于后台管理场景（通常用户数<1000），内存计算是可以接受的且逻辑清晰
  const allHoldings = await db.query.holdings.findMany({
    with: {
      fund: true,
    },
  })

  // 3. 在内存中聚合计算每个用户的持仓市值
  const userFundValueMap = new Map<number, number>()

  for (const h of allHoldings) {
    if (!h.fund)
      continue

    // 优先使用今日实时估值，否则使用昨日净值
    const price = h.fund.todayEstimateNav ? Number(h.fund.todayEstimateNav) : Number(h.fund.yesterdayNav)
    const value = Number(h.shares) * price

    const currentSum = userFundValueMap.get(h.userId) || 0
    userFundValueMap.set(h.userId, currentSum + value)
  }

  // 4. 合并数据返回
  return usersList.map((u) => {
    const cash = Number(u.availableCash || 0)
    const fundValue = userFundValueMap.get(u.id) || 0
    const totalAssets = cash + fundValue

    return {
      ...u,
      cash,
      fundValue,
      totalAssets,
    }
  })
})
