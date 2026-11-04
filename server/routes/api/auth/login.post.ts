/* eslint-disable no-console */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { hashPassword, needsRehash, verifyPassword } from '~~/server/utils/auth'
import { issueSession, toFullUserPayload } from '~~/server/utils/session'

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, password } = await loginSchema.parseAsync(body)

  const db = useDb()
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  })

  // 使用 verifyPassword 进行验证
  const isValid = user && await verifyPassword(user.password, password)

  if (!isValid || !user) {
    throw createError({
      status: 401,
      statusText: '用户名或密码错误。',
    })
  }

  // 安全升级：如果是旧版哈希，自动更新为 Argon2
  if (needsRehash(user.password)) {
    console.log(`[Auth] Migrating password for user ${user.username} to Argon2...`)
    const newHash = await hashPassword(password)
    // 异步更新数据库，不阻塞登录流程
    db.update(users).set({ password: newHash }).where(eq(users.id, user.id)).then(() => {
      console.log(`[Auth] Password migration successful for ${user.username}`)
    }).catch(e => console.error(`[Auth] Password migration failed:`, e))
  }

  // 签发会话:15 天 Access Token + 1 个月 Refresh Token,并写入 Cookie
  const { accessToken } = await issueSession(event, user)

  // 返回给前端的是完整数据
  return {
    user: toFullUserPayload(user),
    token: accessToken, // 显式返回给小程序
  }
})
