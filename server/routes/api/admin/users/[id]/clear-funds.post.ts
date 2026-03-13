import { eq } from 'drizzle-orm'
import { aiExecutionLogs, fundTransactions, holdings, users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })
  }

  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'User ID required' })

  const userId = Number(id)

  // 防止清空自己的基金信息
  if (userId === admin.id) {
    throw createError({ status: 400, statusText: '无法清空当前登录管理员的基金信息' })
  }

  const db = useDb()

  // 验证用户是否存在
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (!targetUser) {
    throw createError({ status: 404, statusText: '用户不存在' })
  }

  // 在事务中执行删除操作
  const result = await db.transaction(async (tx) => {
    // 1. 删除 AI 执行日志
    const deletedLogs = await tx.delete(aiExecutionLogs).where(eq(aiExecutionLogs.userId, userId))

    // 2. 删除基金交易记录
    const deletedTransactions = await tx.delete(fundTransactions).where(eq(fundTransactions.userId, userId))

    // 3. 删除用户持仓记录
    const deletedHoldings = await tx.delete(holdings).where(eq(holdings.userId, userId))

    return {
      logsCount: deletedLogs.rowCount || 0,
      transactionsCount: deletedTransactions.rowCount || 0,
      holdingsCount: deletedHoldings.rowCount || 0,
    }
  })

  return {
    message: '用户基金信息已清空',
    username: targetUser.username,
    deleted: result,
  }
})
