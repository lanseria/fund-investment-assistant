import { users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Admins only' })
  }

  const db = useDb()
  // 返回不包含密码的用户列表
  return await db.query.users.findMany({
    columns: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
  })
})
