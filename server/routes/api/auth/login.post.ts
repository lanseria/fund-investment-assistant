import type { UserPayload } from '~~/server/utils/auth'
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { encrypt, sign } from 'paseto-ts/v4'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { hashPassword } from '~~/server/utils/auth'

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

  if (!user || user.password !== hashPassword(password)) {
    throw createError({
      statusCode: 401,
      statusMessage: '用户名或密码错误。',
    })
  }

  const userPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    isAiAgent: user.isAiAgent,
    aiModel: user.aiModel,
    aiTotalAmount: user.aiTotalAmount,
    aiSystemPrompt: user.aiSystemPrompt,
  }

  const [localKey, refreshPrivateKey] = await Promise.all([
    useStorage('redis').getItem<string>('localKey'),
    useStorage('redis').getItem<string>('refreshPrivateKey'),
  ])

  if (!localKey || !refreshPrivateKey)
    throw new Error('Server not initialized: keys are missing.')

  // 访问令牌 (Access Token) 的有效期，保持 15 天不变，这是安全实践
  const accessTokenExp = dayjs().add(15, 'd').toDate()
  // 刷新令牌 (Refresh Token) 的有效期，延长至 1 个月
  const refreshTokenExp = dayjs().add(1, 'month').toDate()

  const accessTokenPayload = { ...userPayload, exp: accessTokenExp.toISOString() }
  const accessToken = await encrypt(localKey, accessTokenPayload)

  const refreshTokenPayload = { sub: String(user.id), exp: refreshTokenExp.toISOString() }
  const refreshToken = await sign(refreshPrivateKey, refreshTokenPayload)

  // 使用 setCookie 直接设置 httpOnly cookie
  setCookie(event, 'auth-token', accessToken, {
    httpOnly: true,
    expires: accessTokenExp,
    path: '/',
    sameSite: 'lax',
  })

  // 设置 refresh token cookie，有效期必须与令牌内部的有效期一致，即 1 个月
  setCookie(event, 'auth-refresh-token', refreshToken, {
    httpOnly: true,
    expires: refreshTokenExp,
    path: '/',
    sameSite: 'lax',
  })

  // 响应体中只返回用户信息
  return { user: userPayload }
})
