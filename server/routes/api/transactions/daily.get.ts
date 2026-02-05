// server/routes/api/transactions/daily.get.ts
import BigNumber from 'bignumber.js' //
import { desc, eq } from 'drizzle-orm'
import { funds, fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { getAiFixStatus } from '~~/server/utils/aiFixStatus'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 验证用户已登录
  getUserFromEvent(event)

  const query = getQuery(event)
  const dateStr = query.date as string

  if (!dateStr) {
    throw createError({ status: 400, statusText: 'Date is required (YYYY-MM-DD)' })
  }

  const db = useDb()

  // 1. 获取所有用户 (按用户名排序)，包括可用现金
  const allUsers = await db.query.users.findMany({
    orderBy: (users, { asc }) => [asc(users.username)],
    columns: {
      id: true,
      username: true,
      isAiAgent: true,
      availableCash: true, //  获取现金余额
    },
  })

  const loadingStatuses = await Promise.all(
    allUsers.map(user => getAiFixStatus(dateStr, user.id)),
  )
  const loadingMap = new Map<number, boolean>()
  loadingStatuses.forEach((status, index) => {
    const userId = allUsers[index]?.id
    if (userId !== undefined)
      loadingMap.set(userId, status?.loading ?? false)
  })

  // 2.  获取所有持仓数据以计算实时资产和收益率
  const allHoldings = await db.query.holdings.findMany({
    with: {
      fund: true,
    },
  })

  // 3.  计算每个用户的资产统计信息
  const userStatsMap = new Map<number, { fundValue: number, totalCost: number }>()

  for (const h of allHoldings) {
    if (!h.fund || !h.shares)
      continue

    // 优先使用今日实时估值，否则使用昨日净值
    const price = h.fund.todayEstimateNav ? Number(h.fund.todayEstimateNav) : Number(h.fund.yesterdayNav)
    const shares = new BigNumber(h.shares)
    const costPrice = new BigNumber(h.costPrice || 0)

    const marketValue = shares.multipliedBy(price)
    const costValue = shares.multipliedBy(costPrice)

    const stats = userStatsMap.get(h.userId) || { fundValue: 0, totalCost: 0 }
    stats.fundValue += marketValue.toNumber()
    stats.totalCost += costValue.toNumber()
    userStatsMap.set(h.userId, stats)
  }

  // 4. 查询指定日期的所有交易 (增加 sector 字段)
  const transactions = await db.select({
    id: fundTransactions.id,
    userId: fundTransactions.userId,
    type: fundTransactions.type,
    status: fundTransactions.status,
    fundCode: fundTransactions.fundCode,
    fundName: funds.name,
    fundSector: funds.sector, //  板块
    orderAmount: fundTransactions.orderAmount,
    orderShares: fundTransactions.orderShares,
    confirmedAmount: fundTransactions.confirmedAmount,
    confirmedShares: fundTransactions.confirmedShares,
    confirmedNav: fundTransactions.confirmedNav,
    createdAt: fundTransactions.createdAt,
    note: fundTransactions.note,
  })
    .from(fundTransactions)
    .leftJoin(funds, eq(fundTransactions.fundCode, funds.code))
    .where(eq(fundTransactions.orderDate, dateStr))
    .orderBy(desc(fundTransactions.createdAt))

  // 5. 组合数据
  const result = allUsers.map((user) => {
    const userTxs = transactions.filter(tx => tx.userId === user.id)
    const stats = userStatsMap.get(user.id) || { fundValue: 0, totalCost: 0 }
    const cash = Number(user.availableCash || 0)
    const totalAssets = cash + stats.fundValue

    return {
      user: {
        ...user,
        stats: {
          cash,
          fundValue: stats.fundValue,
          totalAssets,
        },
      },
      txs: userTxs,
      loading: loadingMap.get(user.id) ?? false,
    }
  })

  // 排序：有交易的在前，无交易的在后
  return result.sort((a, b) => {
    const countA = a.txs.length
    const countB = b.txs.length
    if (countA > 0 && countB === 0)
      return -1
    if (countA === 0 && countB > 0)
      return 1
    return 0
  })
})
