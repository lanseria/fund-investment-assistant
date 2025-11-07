import { eq } from 'drizzle-orm'
import { dictionaryTypes } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })

  // 从 URL 路径中获取要删除的类型编码
  const type = getRouterParam(event, 'type')
  if (!type)
    throw createError({ statusCode: 400, message: '字典类型 (type) 是必需的' })

  const db = useDb()
  // 删除指定 type 的记录
  const result = await db.delete(dictionaryTypes).where(eq(dictionaryTypes.type, type))

  // 检查是否真的有记录被删除
  if (result.rowCount === 0)
    throw createError({ statusCode: 404, message: '未找到要删除的字典类型' })

  // 成功删除，返回 204 No Content
  setResponseStatus(event, 204)
})
