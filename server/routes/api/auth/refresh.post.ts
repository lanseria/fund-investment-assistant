// server/routes/api/auth/refresh.post.ts
import type { UserPayload } from '~~/server/utils/auth'
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { encrypt, verify } from 'paseto-ts/v4'
import { users } from '~~/server/database/schemas'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, 'auth-refresh-token')

  if (!refreshToken) {
    throw createError({ statusCode: 401, statusMessage: 'Refresh token is missing.' })
  }

  const refreshPublicKey = await useStorage('redis').getItem<string>('refreshPublicKey')
  if (!refreshPublicKey)
    throw new Error('Server not initialized: public key is missing.')

  // PASETO 会自动验证 refreshToken 是否已过期
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

  // 每次刷新，都生成一个有效期为 1 天的新的访问令牌
  const accessTokenExp = dayjs().add(1, 'day').toDate()
  const newAccessTokenPayload = { ...userPayload, exp: accessTokenExp.toISOString() }
  const newAccessToken = await encrypt(localKey, newAccessTokenPayload)

  // 设置新的 access token cookie
  setCookie(event, 'auth-token', newAccessToken, {
    httpOnly: true,
    expires: accessTokenExp,
    path: '/',
    sameSite: 'lax',
  })

  // 返回用户信息给前端，以便前端可能需要更新
  return { user: userPayload }
})
