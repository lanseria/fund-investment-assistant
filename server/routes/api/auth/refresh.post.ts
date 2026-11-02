// server/routes/api/auth/refresh.post.ts
import type { RefreshTokenPayload, UserPayload } from '~~/server/utils/auth'
import { addDays } from 'date-fns'
import { eq } from 'drizzle-orm'
import { encrypt, verify } from 'paseto-ts/v4'
import { users } from '~~/server/database/schemas'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, 'auth-refresh-token')

  if (!refreshToken) {
    throw createError({ status: 401, statusText: 'Refresh token is missing.' })
  }

  const refreshPublicKey = await useStorage('redis').getItem<string>('refreshPublicKey')
  if (!refreshPublicKey)
    throw new Error('Server not initialized: public key is missing.')

  let payload: RefreshTokenPayload
  try {
    const result = await verify<RefreshTokenPayload>(refreshPublicKey, refreshToken)
    payload = result.payload
  }
  catch (error) {
    console.error(error)
    deleteCookie(event, 'auth-token', { path: '/' })
    deleteCookie(event, 'auth-refresh-token', { path: '/' })
    throw createError({ status: 401, statusText: 'Invalid or expired refresh token.' })
  }

  const userId = payload.sub

  const db = useDb()
  const user = await db.query.users.findFirst({
    where: eq(users.id, Number(userId)),
  })
  if (!user)
    throw createError({ status: 401, statusText: 'Invalid refresh token: user not found.' })

  // 核对 token 内的 username 与数据库中该 ID 当前对应的用户名：
  // 仅凭数字 ID 定位身份时，一旦 ID 被其他用户占用 (数据库恢复/多实例串号)，
  // 会静默登录成别人；用户名对不上说明会话不属于当前账号，直接清除
  if (payload.username !== user.username) {
    deleteCookie(event, 'auth-token', { path: '/' })
    deleteCookie(event, 'auth-refresh-token', { path: '/' })
    throw createError({ status: 401, statusText: 'Session does not match this account. Please log in again.' })
  }

  // 1. 完整数据返回给前端
  const fullUserPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    aiMode: user.aiMode,
    aiSystemPrompt: user.aiSystemPrompt,
    availableCash: user.availableCash,
  }

  // 2. 精简数据存入 Token
  const slimTokenPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    aiMode: user.aiMode,
  }

  const localKey = await useStorage('redis').getItem<string>('localKey')
  if (!localKey)
    throw new Error('Server not initialized: localKey is missing.')

  const accessTokenExp = addDays(new Date(), 1)
  // 使用精简 Payload 加密
  const newAccessTokenPayload = {
    ...slimTokenPayload,
    exp: accessTokenExp.toISOString(),
  }
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
