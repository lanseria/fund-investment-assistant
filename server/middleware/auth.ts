import type { UserPayload } from '~~/server/utils/auth'
import { decrypt } from 'paseto-ts/v4'

// [修改] 这个数组现在只用于定义 /api/ 范围内的公共路由
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/test-fetch',
  '/api/dev/init-admin',
]

export default defineEventHandler(async (event) => {
  const path = event.path

  // [核心修改] 只对 API 路由进行拦截
  if (!path.startsWith('/api/')) {
    // 如果请求的不是 API 路由，直接跳过此中间件
    return
  }

  // 如果是公共 API 路由，也跳过
  if (PUBLIC_API_ROUTES.some(route => path.startsWith(route)))
    return

  // --- 后续逻辑只处理需要认证的 API 请求 ---

  const token = getHeader(event, 'Authorization')?.split(' ')[1]
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authorization header is missing',
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
