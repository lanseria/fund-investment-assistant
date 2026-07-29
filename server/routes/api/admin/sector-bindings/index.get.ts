import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

/**
 * 管理员接口：列出所有板块绑定关系。
 */
export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const db = useDb()
  const bindings = await db.query.sectorBindings.findMany({
    orderBy: (sectorBindings, { asc }) => [asc(sectorBindings.dictValue)],
  })

  return bindings
})
