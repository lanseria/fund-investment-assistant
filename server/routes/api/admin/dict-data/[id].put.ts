import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dictionaryData } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 定义更新数据时请求体的 Zod schema
const updateDataSchema = z.object({
  label: z.string().min(1, '标签名不能为空'),
  value: z.string().min(1, '数据值不能为空'),
  sortOrder: z.number().int().optional().default(0),
  // dictType 在更新时不允许修改，因此不包含在此 schema 中
})

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })

  // 从 URL 路径中获取要更新的数据项 ID
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, message: 'ID 是必需的' })

  // 读取并验证请求体
  const body = await readBody(event)
  const data = await updateDataSchema.parseAsync(body)

  const db = useDb()
  // 更新指定 ID 的数据项并返回更新后的记录
  const [updatedItem] = await db.update(dictionaryData)
    .set({
      label: data.label,
      value: data.value,
      sortOrder: data.sortOrder,
    })
    .where(eq(dictionaryData.id, Number(id)))
    .returning()

  // 如果没有找到记录，Drizzle 不会报错，但 updatedItem 会是 undefined
  if (!updatedItem)
    throw createError({ statusCode: 404, message: '未找到指定的字典数据项' })

  return updatedItem
})
