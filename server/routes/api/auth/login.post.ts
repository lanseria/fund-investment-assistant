/* eslint-disable no-console */
import type { UserPayload } from '~~/server/utils/auth'
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { encrypt, sign } from 'paseto-ts/v4'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { hashPassword, needsRehash, verifyPassword } from '~~/server/utils/auth'

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

  // [修改] 使用 verifyPassword 进行验证
  const isValid = user && await verifyPassword(user.password, password)

  if (!isValid || !user) {
    throw createError({
      status: 401,
      statusText: '用户名或密码错误。',
    })
  }

  // [新增] 安全升级：如果是旧版哈希，自动更新为 Argon2
  if (needsRehash(user.password)) {
    console.log(`[Auth] Migrating password for user ${user.username} to Argon2...`)
    const newHash = await hashPassword(password)
    // 异步更新数据库，不阻塞登录流程
    db.update(users).set({ password: newHash }).where(eq(users.id, user.id)).then(() => {
      console.log(`[Auth] Password migration successful for ${user.username}`)
    }).catch(e => console.error(`[Auth] Password migration failed:`, e))
  }

  // 1. 完整的用户数据 (用于返回给前端 Redia/Pinia)
  const fullUserPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    isAiAgent: user.isAiAgent,
    aiSystemPrompt: user.aiSystemPrompt,
    availableCash: user.availableCash,
  }

  // 2. 精简的 Token 数据 (用于存入 Cookie，避免超长)
  // 剔除了 aiSystemPrompt 等大字段
  const slimTokenPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    isAiAgent: user.isAiAgent,
    // 其他字段保持 undefined/null，节省空间
  }

  const [localKey, refreshPrivateKey] = await Promise.all([
    useStorage('redis').getItem<string>('localKey'),
    useStorage('redis').getItem<string>('refreshPrivateKey'),
  ])

  if (!localKey || !refreshPrivateKey)
    throw new Error('Server not initialized: keys are missing.')

  // Access Token 有效期 15 天
  const accessTokenExp = dayjs().add(15, 'd').toDate()
  // Refresh Token 有效期 1 个月
  const refreshTokenExp = dayjs().add(1, 'month').toDate()

  // 加密时使用 slimTokenPayload
  const accessTokenPayload = { ...slimTokenPayload, exp: accessTokenExp.toISOString() }
  const accessToken = await encrypt(localKey, accessTokenPayload)

  const refreshTokenPayload = { sub: String(user.id), exp: refreshTokenExp.toISOString() }
  const refreshToken = await sign(refreshPrivateKey, refreshTokenPayload)

  // 设置 Cookie
  setCookie(event, 'auth-token', accessToken, {
    httpOnly: true,
    expires: accessTokenExp,
    path: '/',
    sameSite: 'lax',
  })

  setCookie(event, 'auth-refresh-token', refreshToken, {
    httpOnly: true,
    expires: refreshTokenExp,
    path: '/',
    sameSite: 'lax',
  })

  // 返回给前端的是完整数据
  return {
    user: fullUserPayload,
    token: accessToken, // 显式返回给小程序
  }
})
