import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schemas'
import { generateApiToken } from '~~/server/utils/apiToken'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 1. 确保用户已通过网页登录 (Cookie Auth)
  const sessionUser = getUserFromEvent(event)

  // 2. 生成新 Token
  const { raw, hashed } = generateApiToken()

  // 3. 更新数据库（覆盖旧 Token）
  const db = useDb()
  await db.update(users)
    .set({ apiToken: hashed })
    .where(eq(users.id, sessionUser.id))

  // 4. 返回原始 Token (仅显示这一次)
  return {
    message: 'API Token 已生成，请立即复制保存，它不会再次显示。',
    token: raw,
  }
})
