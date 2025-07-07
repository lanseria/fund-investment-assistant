// File: server/routes/api/auth/login.post.ts
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
  }

  const [localKey, refreshPrivateKey] = await Promise.all([
    useStorage('redis').getItem<string>('localKey'),
    useStorage('redis').getItem<string>('refreshPrivateKey'),
  ])

  if (!localKey || !refreshPrivateKey)
    throw new Error('Server not initialized: keys are missing.')

  // 正确设置 access token 的过期时间
  const accessTokenPayload = {
    ...userPayload,
    exp: dayjs().add(7, 'day').toISOString(), // 将 'exp' claim 直接加入 payload
  }
  const accessToken = await encrypt(localKey, accessTokenPayload) // 移除第三个参数和 as any

  // 正确设置 refresh token 的过期时间
  const refreshTokenPayload = {
    sub: String(user.id), // 'sub' (subject) 是 refresh token 的标准 claim
    exp: dayjs().add(7, 'day').toISOString(), // 将 'exp' claim 直接加入 payload
  }
  const refreshToken = await sign(refreshPrivateKey, refreshTokenPayload) // 移除第三个参数和 as any

  return {
    accessToken,
    refreshToken,
    user: userPayload, // 返回给前端的用户信息不需要包含 exp
  }
})
