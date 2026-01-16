// server/middleware/auth.ts
import type { UserPayload } from '~~/server/utils/auth'
import { decrypt } from 'paseto-ts/v4'

const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/test-fetch',
  '/api/dev/init-admin',
  '/api/dev/process-transactions',
  '/api/dicts/all',
  '/api/webhooks/trend-radar',
  '/api/dev/trigger-ai',
  '/api/dev/init-assets',
]

export default defineEventHandler(async (event) => {
  const path = event.path

  // 如果不是 API 路由或属于公开路由，则跳过
  if (!path.startsWith('/api/') || PUBLIC_API_ROUTES.some(route => path.startsWith(route)))
    return

  // 直接从 cookie 中获取 token
  const token = getCookie(event, 'auth-token')

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authorization token is missing from cookies',
    })
  }

  try {
    const localKey = await useStorage('redis').getItem<string>('localKey')
    if (!localKey)
      throw new Error('Server not initialized: localKey is missing.')

    const { payload } = await decrypt<UserPayload>(localKey, token)

    event.context.user = payload
  }
  catch (error: any) {
    // [修复] 当解密失败（如密钥轮换导致 invalid authentication tag）时，
    // 主动清除无效的 Cookie，防止客户端一直发送错误的 Token
    deleteCookie(event, 'auth-token', { path: '/' })

    // 降级日志级别为 warn，因为这是预期的认证失败，不是系统崩溃
    console.warn(`Token validation failed for path ${path}:`, error.message)

    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired token',
    })
  }
})
