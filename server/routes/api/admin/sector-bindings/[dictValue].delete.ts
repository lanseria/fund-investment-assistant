import { eq } from 'drizzle-orm'
import { sectorBindings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

/**
 * 管理员接口：删除板块绑定关系（解绑）。
 * 路径参数 dictValue 为项目板块 value。
 * 注意：仅删除绑定关系，已落库的历史快照数据保留。
 */
export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const dictValue = getRouterParam(event, 'dictValue')
  if (!dictValue)
    throw createError({ status: 400, statusText: 'dictValue 是必需的' })

  const db = useDb()
  const result = await db.delete(sectorBindings).where(eq(sectorBindings.dictValue, dictValue))

  if (result.rowCount === 0)
    throw createError({ status: 404, statusText: `未找到项目板块 "${dictValue}" 的绑定关系` })

  setResponseStatus(event, 204)
})
