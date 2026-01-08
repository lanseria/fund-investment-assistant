import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'

// 定义 User 在 token 中的 payload 类型
export interface UserPayload {
  id: number
  username: string
  role: 'admin' | 'user'
  isAiAgent: boolean
}

// 密码哈希
export function hashPassword(password: string) {
  return createHash('sha512').update(password).digest('base64')
}

// 从事件上下文中安全地获取用户信息
export function getUserFromEvent(event: H3Event): UserPayload {
  const user = event.context.user as UserPayload | undefined
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'User not found in context. Authentication required.',
    })
  }
  return user
}
