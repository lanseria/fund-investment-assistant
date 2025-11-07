import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dictionaryTypes } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 定义更新类型时请求体的 Zod schema
const updateTypeSchema = z.object({
  name: z.string().min(1, '类别名称不能为空'),
  // 'type' 从 URL 获取，不在 body 中
})

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })

  // 从 URL 路径中获取要更新的类型编码
  const type = getRouterParam(event, 'type')
  if (!type)
    throw createError({ statusCode: 400, message: '字典类型 (type) 是必需的' })

  // 读取并验证请求体
  const body = await readBody(event)
  const data = await updateTypeSchema.parseAsync(body)

  const db = useDb()
  // 更新指定 type 的记录
  const [updatedItem] = await db.update(dictionaryTypes)
    .set({ name: data.name })
    .where(eq(dictionaryTypes.type, type))
    .returning()

  if (!updatedItem)
    throw createError({ statusCode: 404, message: '未找到指定的字典类型' })

  return updatedItem
})
