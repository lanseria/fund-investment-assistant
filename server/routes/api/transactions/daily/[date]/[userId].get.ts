import { and, desc, eq } from 'drizzle-orm'
import { funds, fundTransactions, users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  getUserFromEvent(event) // 验证登录状态

  const dateStr = getRouterParam(event, 'date')
  const userIdStr = getRouterParam(event, 'userId')

  if (!dateStr || !userIdStr) {
    throw createError({ status: 400, statusText: 'Missing date or userId' })
  }

  const userId = Number(userIdStr)
  const db = useDb()

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, username: true, isAiAgent: true },
  })

  if (!user)
    throw createError({ status: 404, statusText: 'User not found' })

  const txs = await db.select({
    id: fundTransactions.id,
    userId: fundTransactions.userId,
    type: fundTransactions.type,
    status: fundTransactions.status,
    fundCode: fundTransactions.fundCode,
    fundName: funds.name,
    fundSector: funds.sector,
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
    .where(and(
      eq(fundTransactions.orderDate, dateStr),
      eq(fundTransactions.userId, userId),
    ))
    .orderBy(desc(fundTransactions.createdAt))

  return { user, txs }
})
