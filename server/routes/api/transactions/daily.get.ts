// server/routes/api/transactions/daily.get.ts
import { desc, eq } from 'drizzle-orm'
import { funds, fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 验证用户已登录
  getUserFromEvent(event)

  const query = getQuery(event)
  const dateStr = query.date as string

  if (!dateStr) {
    throw createError({ statusCode: 400, message: 'Date is required (YYYY-MM-DD)' })
  }

  const db = useDb()

  // 1. 获取所有用户 (按用户名排序)
  const allUsers = await db.query.users.findMany({
    orderBy: (users, { asc }) => [asc(users.username)],
    columns: {
      id: true,
      username: true,
      isAiAgent: true,
    },
  })

  // 2. 查询指定日期的所有交易
  const transactions = await db.select({
    id: fundTransactions.id,
    userId: fundTransactions.userId,
    type: fundTransactions.type,
    status: fundTransactions.status,
    fundCode: fundTransactions.fundCode,
    fundName: funds.name,
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

  // 3. 在内存中将交易分组到用户
  const result = allUsers.map((user) => {
    const userTxs = transactions.filter(tx => tx.userId === user.id)
    return {
      user,
      txs: userTxs,
    }
  })

  // 将有交易的用户排在前面，无交易的排在后面
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
