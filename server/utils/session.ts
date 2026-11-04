import type { H3Event } from 'h3'
import type { users } from '~~/server/database/schemas'
import type { RefreshTokenPayload, UserPayload } from '~~/server/utils/auth'
import { addDays, addMonths } from 'date-fns'
import { encrypt, sign } from 'paseto-ts/v4'

type UserRow = typeof users.$inferSelect

// 会话有效期统一配置:登录与刷新签发的令牌保持一致,
// 保证任意时刻拿到的新 access token 都是同样的有效期
export const ACCESS_TOKEN_TTL_DAYS = 15
export const REFRESH_TOKEN_TTL_MONTHS = 1

/** 返回给前端的完整用户数据 */
export function toFullUserPayload(user: UserRow): UserPayload {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    aiMode: user.aiMode,
    aiSystemPrompt: user.aiSystemPrompt,
    availableCash: user.availableCash,
  }
}

/** 存入 Token 的精简 Payload (剔除 aiSystemPrompt 等大字段,避免 Cookie 超长) */
function toSlimTokenPayload(user: UserRow): UserPayload {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    aiMode: user.aiMode,
  }
}

/** 签发 Access Token (PASETO V4.local 对称加密) */
async function issueAccessToken(user: UserRow) {
  const localKey = await useStorage('redis').getItem<string>('localKey')
  if (!localKey)
    throw new Error('Server not initialized: localKey is missing.')

  const exp = addDays(new Date(), ACCESS_TOKEN_TTL_DAYS)
  const token = await encrypt(localKey, {
    ...toSlimTokenPayload(user),
    exp: exp.toISOString(),
  })
  return { token, exp }
}

/** 签发 Refresh Token (PASETO V4.public 非对称签名) */
async function issueRefreshToken(user: UserRow) {
  const privateKey = await useStorage('redis').getItem<string>('refreshPrivateKey')
  if (!privateKey)
    throw new Error('Server not initialized: refreshPrivateKey is missing.')

  const exp = addMonths(new Date(), REFRESH_TOKEN_TTL_MONTHS)
  const payload: RefreshTokenPayload = {
    sub: String(user.id),
    username: user.username,
    exp: exp.toISOString(),
  }
  const token = await sign(privateKey, payload)
  return { token, exp }
}

function setAuthCookies(event: H3Event, accessToken: { token: string, exp: Date }, refreshToken: { token: string, exp: Date }) {
  setCookie(event, 'auth-token', accessToken.token, {
    httpOnly: true,
    expires: accessToken.exp,
    path: '/',
    sameSite: 'lax',
  })
  setCookie(event, 'auth-refresh-token', refreshToken.token, {
    httpOnly: true,
    expires: refreshToken.exp,
    path: '/',
    sameSite: 'lax',
  })
}

/** 清除会话 Cookie,用于强制重新登录的场景 */
export function clearAuthCookies(event: H3Event) {
  deleteCookie(event, 'auth-token', { path: '/' })
  deleteCookie(event, 'auth-refresh-token', { path: '/' })
}

/**
 * 为用户签发完整会话并写入 Cookie:
 * 15 天 Access Token + 1 个月 Refresh Token。
 * 登录与刷新共用本函数,刷新时轮换 refresh token(滑动会话):
 * 活跃用户持续续期不掉线,不活跃用户在 1 个月后自然过期。
 */
export async function issueSession(event: H3Event, user: UserRow) {
  const [accessToken, refreshToken] = await Promise.all([
    issueAccessToken(user),
    issueRefreshToken(user),
  ])
  setAuthCookies(event, accessToken, refreshToken)
  return { accessToken: accessToken.token }
}
