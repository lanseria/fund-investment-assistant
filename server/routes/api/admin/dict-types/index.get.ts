import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 权限校验：确保是管理员
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })

  const db = useDb()
  // 查询所有字典类型，并按名称排序
  return await db.query.dictionaryTypes.findMany({
    orderBy: (types, { asc }) => [asc(types.name)],
  })
})
