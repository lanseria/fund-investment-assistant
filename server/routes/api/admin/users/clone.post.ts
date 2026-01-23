import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { holdings, users } from '~~/server/database/schemas'
import { getUserFromEvent, hashPassword } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const cloneUserSchema = z.object({
  sourceUserId: z.number().int(),
  newUsername: z.string().min(3, '用户名至少3位'),
})

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })
  }

  const body = await readBody(event)
  const { sourceUserId, newUsername } = await cloneUserSchema.parseAsync(body)
  const db = useDb()

  // 1. 检查新用户名是否已存在
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, newUsername),
  })

  if (existingUser) {
    throw createError({ status: 409, statusText: `用户名 ${newUsername} 已存在` })
  }

  // 2. 获取源用户（确认存在）
  const sourceUser = await db.query.users.findFirst({
    where: eq(users.id, sourceUserId),
  })

  if (!sourceUser) {
    throw createError({ status: 404, statusText: '源用户不存在' })
  }

  // 3. 事务处理：创建新用户并复制持仓
  await db.transaction(async (tx) => {
    // 3.1 创建新用户，默认密码 123456
    const [newUser] = await tx.insert(users).values({
      username: newUsername,
      password: await hashPassword('123456'),
      role: 'user',
      isAiAgent: false, // 默认复制出来的不自动开启 AI，防止意外操作
    }).returning()

    if (!newUser)
      throw new Error('创建用户失败')

    // 3.2 获取源用户的所有持仓
    const sourceHoldings = await tx.query.holdings.findMany({
      where: eq(holdings.userId, sourceUserId),
    })

    // 3.3 批量插入到新用户
    if (sourceHoldings.length > 0) {
      const newHoldingsData = sourceHoldings.map(h => ({
        userId: newUser.id,
        fundCode: h.fundCode,
        shares: h.shares,
        costPrice: h.costPrice,
      }))

      await tx.insert(holdings).values(newHoldingsData)
    }
  })

  return { message: '用户克隆成功', username: newUsername }
})
