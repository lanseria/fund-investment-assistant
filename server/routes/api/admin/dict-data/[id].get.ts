import { eq } from 'drizzle-orm'
import { dictionaryData } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })

  // 从 URL 路径中获取字典类型参数
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, message: '字典类型 (type) 是必需的' })

  const db = useDb()
  // 查询指定类型的所有数据，并按 sortOrder 排序
  return await db.query.dictionaryData.findMany({
    where: eq(dictionaryData.dictType, id),
    orderBy: (data, { asc }) => [asc(data.sortOrder), asc(data.id)],
  })
})
