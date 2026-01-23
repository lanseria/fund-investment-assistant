import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { getUserFromEvent, hashPassword } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const updateUserSchema = z.object({
  username: z.string().min(3, '用户名至少3位').optional(),
  password: z.string().min(6, '密码至少6位').optional(),
  isAiAgent: z.boolean().optional(),
  aiSystemPrompt: z.string().optional().nullable(),
  availableCash: z.number().optional(),
})

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })
  }

  const idParam = getRouterParam(event, 'id')
  if (!idParam)
    throw createError({ status: 400, statusText: 'User ID required' })
  const userId = Number(idParam)

  const body = await readBody(event)
  const data = await updateUserSchema.parseAsync(body)
  const db = useDb()

  const updateData: Record<string, any> = {}

  // 1. 处理用户名 (需查重)
  if (data.username) {
    const existingUser = await db.query.users.findFirst({
      where: and(
        eq(users.username, data.username),
        ne(users.id, userId),
      ),
    })
    if (existingUser) {
      throw createError({ status: 409, statusText: `用户名 "${data.username}" 已被占用` })
    }
    updateData.username = data.username
  }

  // 2. 处理 AI 配置
  if (data.isAiAgent !== undefined)
    updateData.isAiAgent = data.isAiAgent
  if (data.aiSystemPrompt !== undefined)
    updateData.aiSystemPrompt = data.aiSystemPrompt
  if (data.availableCash !== undefined)
    updateData.availableCash = String(data.availableCash)

  // 处理密码重置
  if (data.password) {
    updateData.password = await hashPassword(data.password)
  }

  if (Object.keys(updateData).length === 0) {
    return { message: '无数据变更' }
  }

  await db.update(users)
    .set(updateData)
    .where(eq(users.id, userId))

  return { message: '用户信息更新成功', user: updateData }
})
