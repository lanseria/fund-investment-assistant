import { and, eq } from 'drizzle-orm'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ status: 400, statusText: 'Transaction ID is required' })
  }

  const db = useDb()

  // [新增] 先查询该交易
  const tx = await db.query.fundTransactions.findFirst({
    where: and(
      eq(fundTransactions.id, Number(id)),
      eq(fundTransactions.userId, user.id),
      eq(fundTransactions.status, 'pending'),
    ),
  })

  if (!tx) {
    throw createError({ status: 404, statusText: '未找到该待处理交易' })
  }

  // [新增] 保护逻辑：如果是“转入”记录，不允许直接删除，提示删除“转出”记录
  if (tx.type === 'convert_in') {
    throw createError({ status: 400, statusText: '请删除对应的 [转出] 记录，系统将自动删除此 [转入] 记录。' })
  }

  // [新增] 级联删除逻辑：如果是“转出”记录，需要查找并删除关联的“转入”记录
  if (tx.type === 'convert_out') {
    await db.delete(fundTransactions)
      .where(and(
        eq(fundTransactions.relatedId, Number(id)), // 查找 relatedId 指向当前 ID 的记录
        eq(fundTransactions.type, 'convert_in'),
      ))
  }

  // 执行删除当前记录
  const result = await db.delete(fundTransactions)
    .where(eq(fundTransactions.id, Number(id)))

  // 检查是否删除了记录
  if (result.rowCount === 0) {
    throw createError({
      status: 404,
      statusText: '未找到该交易，或该交易已成交/无法删除。',
    })
  }

  setResponseStatus(event, 204)
})
