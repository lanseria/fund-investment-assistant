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

  // 用户名对不上说明 token 与该 ID 当前的主人不是同一个人
  // (数据库恢复导致 ID 复用/多实例串号)，清除会话强制重新登录，避免静默变成别人
  if (!user || user.username !== tokenUser.username) {
    deleteCookie(event, 'auth-token', { path: '/' })
    deleteCookie(event, 'auth-refresh-token', { path: '/' })
    throw createError({ status: 401, statusText: 'Session does not match this account. Please log in again.' })
  }

  // 3. 返回包含 aiSystemPrompt 的完整对象
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    aiMode: user.aiMode,
    aiSystemPrompt: user.aiSystemPrompt,
    availableCash: user.availableCash,
  }
})
