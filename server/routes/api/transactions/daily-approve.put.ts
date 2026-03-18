// server/routes/api/transactions/daily-approve.put.ts
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const approveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  // 1. 鉴权
  const user = getUserFromEvent(event)
  const body = await readBody(event)
  const { date, userId } = await approveSchema.parseAsync(body)

  // 2. Admin 可以为任何人核准，否则只能核准自己的
  const targetUserId = (user.role === 'admin' && userId) ? userId : user.id

  const db = useDb()

  // 3. 批量将 draft 转为 pending
  const result = await db.update(fundTransactions)
    .set({ status: 'pending' })
    .where(and(
      eq(fundTransactions.userId, targetUserId),
      eq(fundTransactions.orderDate, date),
      eq(fundTransactions.status, 'draft'),
    ))

  return { message: '已成功转为待处理状态', count: result.rowCount }
})
