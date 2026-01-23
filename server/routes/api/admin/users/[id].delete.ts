import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schemas'
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

  // 防止自杀 (删除自己)
  if (Number(id) === admin.id) {
    throw createError({ status: 400, statusText: '无法删除当前登录的管理员账户' })
  }

  const db = useDb()
  const result = await db.delete(users).where(eq(users.id, Number(id)))

  if (result.rowCount === 0) {
    throw createError({ status: 404, statusText: '用户不存在' })
  }

  setResponseStatus(event, 204)
})
