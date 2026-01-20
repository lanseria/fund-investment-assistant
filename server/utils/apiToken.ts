import type { H3Event } from 'h3' // [新增] 显式导入 H3Event 类型
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

/**
 * 生成一个新的 API Token
 * 格式: fia_sk_[随机字符]
 */
export function generateApiToken(): { raw: string, hashed: string } {
  const randomStr = randomBytes(24).toString('hex')
  const raw = `fia_sk_${randomStr}`
  const hashed = hashToken(raw)
  return { raw, hashed }
}

/**
 * 对 Token 进行 SHA-256 哈希
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * 从请求头中验证 Token (Soft Auth)
 * 如果验证成功返回 userId，否则返回 null
 * 注意：不要在这里抛出错误
 */
export async function getMcpUser(event: H3Event): Promise<number | null> {
  const authHeader = getHeader(event, 'authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7) // 去掉 'Bearer '

  // 简单的格式检查
  if (!token.startsWith('fia_sk_')) {
    return null
  }

  const hashed = hashToken(token)
  const db = useDb()

  // 查找匹配 Token 的用户
  const user = await db.query.users.findFirst({
    where: eq(users.apiToken, hashed),
    columns: { id: true },
  })

  return user ? user.id : null
}
