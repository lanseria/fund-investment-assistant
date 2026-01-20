// server/routes/api/auth/refresh.post.ts
import type { UserPayload } from '~~/server/utils/auth'
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { encrypt, verify } from 'paseto-ts/v4'
import { users } from '~~/server/database/schemas'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, 'auth-refresh-token')

  if (!refreshToken) {
    throw createError({ statusCode: 401, message: 'Refresh token is missing.' })
  }

  const refreshPublicKey = await useStorage('redis').getItem<string>('refreshPublicKey')
  if (!refreshPublicKey)
    throw new Error('Server not initialized: public key is missing.')

  let payload: any
  try {
    const result = await verify(refreshPublicKey, refreshToken)
    payload = result.payload
  }
  catch (error) {
    console.error(error)
    deleteCookie(event, 'auth-token', { path: '/' })
    deleteCookie(event, 'auth-refresh-token', { path: '/' })
    throw createError({ statusCode: 401, message: 'Invalid or expired refresh token.' })
  }

  const userId = payload.sub

  const db = useDb()
  const user = await db.query.users.findFirst({ where: eq(users.id, Number(userId)) })
  if (!user)
    throw createError({ statusCode: 401, message: 'Invalid refresh token: user not found.' })

  // 1. 完整数据返回给前端
  const fullUserPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    isAiAgent: user.isAiAgent,
    aiSystemPrompt: user.aiSystemPrompt,
    availableCash: user.availableCash,
  }

  // 2. 精简数据存入 Token
  const slimTokenPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    isAiAgent: user.isAiAgent,
  }

  const localKey = await useStorage('redis').getItem<string>('localKey')
  if (!localKey)
    throw new Error('Server not initialized: localKey is missing.')

  const accessTokenExp = dayjs().add(1, 'day').toDate()
  // 使用精简 Payload 加密
  const newAccessTokenPayload = { ...slimTokenPayload, exp: accessTokenExp.toISOString() }
  const newAccessToken = await encrypt(localKey, newAccessTokenPayload)

  setCookie(event, 'auth-token', newAccessToken, {
    httpOnly: true,
    expires: accessTokenExp,
    path: '/',
    sameSite: 'lax',
  })

  // 返回完整数据
  return { user: fullUserPayload }
})
