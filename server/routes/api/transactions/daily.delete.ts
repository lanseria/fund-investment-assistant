// server/routes/api/transactions/daily.delete.ts
import { and, eq } from 'drizzle-orm'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const query = getQuery(event)
  const dateStr = query.date as string

  if (!dateStr) {
    throw createError({ statusCode: 400, message: 'Date is required (YYYY-MM-DD)' })
  }

  const db = useDb()
  const conditions = [
    eq(fundTransactions.orderDate, dateStr),
    eq(fundTransactions.status, 'pending'),
  ]

  // 安全控制：非管理员只能清空自己的待处理记录
  if (user.role !== 'admin') {
    conditions.push(eq(fundTransactions.userId, user.id))
  }

  const result = await db.delete(fundTransactions)
    .where(and(...conditions))

  return {
    message: 'Pending transactions cleared',
    count: result.rowCount,
  }
})
