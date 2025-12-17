import { and, eq } from 'drizzle-orm'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Transaction ID is required' })
  }

  const db = useDb()

  // 执行删除，必须同时满足：ID匹配、用户匹配、状态为pending
  const result = await db.delete(fundTransactions)
    .where(and(
      eq(fundTransactions.id, Number(id)),
      eq(fundTransactions.userId, user.id),
      eq(fundTransactions.status, 'pending'), // 只能删除待处理的交易
    ))

  // 检查是否删除了记录
  if (result.rowCount === 0) {
    throw createError({
      statusCode: 404,
      message: '未找到该交易，或该交易已成交/无法删除。',
    })
  }

  setResponseStatus(event, 204)
})
