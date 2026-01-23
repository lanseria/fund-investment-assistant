import { z } from 'zod'
import { dictionaryData } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 定义创建数据时请求体的 Zod schema
const createDataSchema = z.object({
  dictType: z.string().min(1, '字典类型不能为空'),
  label: z.string().min(1, '标签名不能为空'),
  value: z.string().min(1, '数据值不能为空'),
  sortOrder: z.number().int().optional().default(0),
})

export default defineEventHandler(async (event) => {
  // 权限校验：确保只有管理员可以操作
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  // 读取并验证请求体
  const body = await readBody(event)
  const data = await createDataSchema.parseAsync(body)

  const db = useDb()
  // 插入新数据并返回创建的记录
  const [newItem] = await db.insert(dictionaryData)
    .values({
      dictType: data.dictType,
      label: data.label,
      value: data.value,
      sortOrder: data.sortOrder,
    })
    .returning()

  // 设置响应状态码为 201 Created
  setResponseStatus(event, 201)
  return newItem
})
