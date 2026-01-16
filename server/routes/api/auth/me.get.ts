// server/routes/api/auth/me.get.ts
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 1. 获取 Token 中的基础信息 (id, role 等)
  const tokenUser = getUserFromEvent(event)

  // 2. 使用 ID 去数据库查询完整的最新用户信息
  // 这样既解决了 Cookie 大小限制，也保证了用户修改配置后刷新页面能获取最新数据
  const db = useDb()
  const user = await db.query.users.findFirst({
    where: eq(users.id, tokenUser.id),
  })

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  // 3. 返回包含 aiSystemPrompt 的完整对象
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isAiAgent: user.isAiAgent,
    aiModel: user.aiModel,
    aiTotalAmount: user.aiTotalAmount,
    aiSystemPrompt: user.aiSystemPrompt,
    availableCash: user.availableCash, // [修改]
  }
})
