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
    console.error(`Token validation failed for path ${path}:`, error.message)
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired token',
    })
  }
})
