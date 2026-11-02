import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import argon2 from 'argon2'

// 定义 User 在 token 中的 payload 类型
export interface UserPayload {
  id: number
  username: string
  role: 'admin' | 'user'
  aiMode: 'auto' | 'draft' | 'off'
  aiSystemPrompt?: string | null
  availableCash?: string | null
}

// Refresh token (PASETO public) 的 payload 类型
export interface RefreshTokenPayload {
  /** 用户 ID (字符串形式) */
  sub: string
  /**
   * 用户名。refresh 时必须与数据库中该 ID 的当前用户名一致，
   * 防止用户 ID 被他人占用 (数据库恢复/多实例串号) 后静默登录成别人
   */
  username: string
  exp?: string
}

// 密码哈希 (Argon2)
export async function hashPassword(password: string) {
  return await argon2.hash(password)
}

// 验证密码 (兼容 SHA-512 旧数据)
export async function verifyPassword(hashed: string, plain: string) {
  // Argon2 哈希通常以 $argon2 开头
  if (hashed.startsWith('$argon2')) {
    try {
      return await argon2.verify(hashed, plain)
    }
    catch {
      return false
    }
  }
  // 旧版 SHA-512 验证
  const legacyHash = createHash('sha512').update(plain).digest('base64')
  return hashed === legacyHash
}

// 检查是否需要重新哈希 (用于迁移)
export function needsRehash(hashed: string) {
  return !hashed.startsWith('$argon2')
}

// 从事件上下文中安全地获取用户信息
export function getUserFromEvent(event: H3Event): UserPayload {
  const user = event.context.user as UserPayload | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: 'User not found in context. Authentication required.',
    })
  }
  return user
}
