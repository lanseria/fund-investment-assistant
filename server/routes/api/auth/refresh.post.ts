// server/routes/api/auth/refresh.post.ts
import type { RefreshTokenPayload } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'
import { verify } from 'paseto-ts/v4'
import { users } from '~~/server/database/schemas'
import { clearAuthCookies, issueSession, toFullUserPayload } from '~~/server/utils/session'

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
    clearAuthCookies(event)
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
    clearAuthCookies(event)
    throw createError({ status: 401, statusText: 'Session does not match this account. Please log in again.' })
  }

  // 轮换会话:重新签发与登录时完全一致的令牌对 (15 天 access + 1 个月 refresh)。
  // refresh token 也一并轮换形成滑动会话:活跃用户持续续期不掉线,
  // 不活跃用户在最后一次刷新 1 个月后自然过期
  await issueSession(event, user)

  // 返回完整数据
  return {
    user: toFullUserPayload(user),
  }
})
