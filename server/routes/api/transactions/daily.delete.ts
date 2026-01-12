// server/routes/api/transactions/daily.delete.ts
import { and, eq, inArray } from 'drizzle-orm' // 导入 inArray
import { fundTransactions, users } from '~~/server/database/schemas' // 导入 users 表定义
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

  // 构建子查询：查找所有开启了 AI 代理 (isAiAgent = true) 的用户 ID
  const aiUserIdsSubQuery = db.select({ id: users.id })
    .from(users)
    .where(eq(users.isAiAgent, true))

  const conditions = [
    eq(fundTransactions.orderDate, dateStr),
    eq(fundTransactions.status, 'pending'),
    // 核心限制：仅删除属于 AI 用户的交易记录
    // 这样可以防止误删管理员或普通用户手动录入的交易
    inArray(fundTransactions.userId, aiUserIdsSubQuery),
  ]

  // 安全控制：非管理员只能清空自己的待处理记录
  if (user.role !== 'admin') {
    conditions.push(eq(fundTransactions.userId, user.id))
  }

  const result = await db.delete(fundTransactions)
    .where(and(...conditions))

  return {
    message: 'Pending AI transactions cleared', // 更新提示信息
    count: result.rowCount,
  }
})
