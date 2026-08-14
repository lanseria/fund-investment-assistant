import { and, eq } from 'drizzle-orm'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

/**
 * 单笔确认 AI 预操作：draft → pending。
 * 权限与 /api/transactions/daily-approve 一致：记录所有者本人或 admin。
 */
export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ status: 400, statusText: 'Transaction ID is required' })
  }

  const db = useDb()

  const tx = await db.query.fundTransactions.findFirst({
    where: and(
      eq(fundTransactions.id, Number(id)),
      eq(fundTransactions.status, 'draft'),
    ),
  })

  if (!tx) {
    throw createError({ status: 404, statusText: '未找到该预操作（可能已确认或已删除）' })
  }

  if (tx.userId !== user.id && user.role !== 'admin') {
    throw createError({ status: 403, statusText: '无权操作他人的交易' })
  }

  await db.update(fundTransactions)
    .set({ status: 'pending' })
    .where(eq(fundTransactions.id, tx.id))

  return { message: '已确认，转为待处理状态' }
})
