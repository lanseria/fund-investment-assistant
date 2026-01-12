// server/routes/api/transactions/daily.get.ts
import { and, desc, eq } from 'drizzle-orm'
import { funds, fundTransactions, users } from '~~/server/database/schemas'
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

  // 查询指定日期的所有交易，关联用户和基金信息
  const transactions = await db.select({
    id: fundTransactions.id,
    userId: fundTransactions.userId,
    type: fundTransactions.type,
    status: fundTransactions.status,
    fundCode: fundTransactions.fundCode,
    fundName: funds.name,
    username: users.username,
    isAiAgent: users.isAiAgent,
    orderAmount: fundTransactions.orderAmount,
    orderShares: fundTransactions.orderShares,
    confirmedAmount: fundTransactions.confirmedAmount,
    confirmedShares: fundTransactions.confirmedShares,
    confirmedNav: fundTransactions.confirmedNav,
    createdAt: fundTransactions.createdAt,
    note: fundTransactions.note,
  })
    .from(fundTransactions)
    .innerJoin(users, eq(fundTransactions.userId, users.id))
    .leftJoin(funds, eq(fundTransactions.fundCode, funds.code)) // 使用 leftJoin 防止基金被删后查不到记录
    .where(eq(fundTransactions.orderDate, dateStr))
    .orderBy(desc(fundTransactions.createdAt))

  return transactions
})
