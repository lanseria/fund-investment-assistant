// server/middleware/auth.ts

import type { UserPayload } from '~~/server/utils/auth'
import { decrypt } from 'paseto-ts/v4'

const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/test-fetch',
  '/api/dev/init-admin',
]

export default defineEventHandler(async (event) => {
  const path = event.path

  if (!path.startsWith('/api/'))
    return

  if (PUBLIC_API_ROUTES.some(route => path.startsWith(route)))
    return

  // --- [核心修改] ---
  let token: string | undefined

  // 1. 对所有 /api/sse/ 路由，优先从 query 参数获取 token
  if (path.startsWith('/api/sse/')) {
    const query = getQuery(event)
    token = query.token as string
  }

  // 2. 如果 token 不存在（或者不是 SSE 路由），则回退到从 Header 获取
  if (!token) {
    token = getHeader(event, 'Authorization')?.split(' ')[1]
  }
  // --- [修改结束] ---

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authorization token is missing',
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
