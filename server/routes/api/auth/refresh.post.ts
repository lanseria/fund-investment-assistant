// File: server/routes/api/auth/refresh.post.ts
import type { UserPayload } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'
import { encrypt, verify } from 'paseto-ts/v4'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'

const refreshSchema = z.object({
  refreshToken: z.string(),
})

export default defineEventHandler(async (event) => {
  const dayjs = useDayjs()
  const { refreshToken } = await refreshSchema.parseAsync(await readBody(event))

  const refreshPublicKey = await useStorage('redis').getItem<string>('refreshPublicKey')
  if (!refreshPublicKey)
    throw new Error('Server not initialized: public key is missing.')

  // verify 会自动检查 refreshToken 是否已过期
  const { payload } = await verify(refreshPublicKey, refreshToken)
  const userId = payload.sub

  const db = useDb()
  const user = await db.query.users.findFirst({ where: eq(users.id, Number(userId)) })
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Invalid refresh token: user not found.' })

  const userPayload: UserPayload = { id: user.id, username: user.username, role: user.role }

  const localKey = await useStorage('redis').getItem<string>('localKey')
  if (!localKey)
    throw new Error('Server not initialized: localKey is missing.')

  // 正确设置新 access token 的过期时间
  const newAccessTokenPayload = {
    ...userPayload,
    exp: dayjs().add(7, 'day').toISOString(), // 将 'exp' claim 直接加入 payload
  }
  const newAccessToken = await encrypt(localKey, newAccessTokenPayload) // 移除第三个参数和 as any

  return { accessToken: newAccessToken, user: userPayload }
})
