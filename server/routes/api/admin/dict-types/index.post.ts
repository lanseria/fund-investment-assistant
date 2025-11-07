import { z } from 'zod'
import { dictionaryTypes } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 定义创建类型时请求体的 Zod schema
const createTypeSchema = z.object({
  type: z.string().min(1, '类别编码不能为空').regex(/^[a-z0-9_]+$/, '编码只能包含小写字母、数字和下划线'),
  name: z.string().min(1, '类别名称不能为空'),
})

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })

  // 读取并验证请求体
  const body = await readBody(event)
  const data = await createTypeSchema.parseAsync(body)

  const db = useDb()
  try {
    // 插入新记录并返回
    const [newItem] = await db.insert(dictionaryTypes).values(data).returning()
    setResponseStatus(event, 201) // Created
    return newItem
  }
  catch (error: any) {
    // 捕获数据库层面的主键冲突错误
    if (error.code === '23505') // PostgreSQL unique violation error code
      throw createError({ statusCode: 409, message: `类别编码 "${data.type}" 已存在。` })

    // 抛出其他未知错误
    throw error
  }
})
