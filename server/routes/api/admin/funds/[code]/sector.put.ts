import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 定义请求体的 Zod schema，sector 可以是字符串或 null (用于清空)
const updateSectorSchema = z.object({
  sector: z.string().nullable(),
})

export default defineEventHandler(async (event) => {
  // 权限校验：确保是管理员
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Admins only' })

  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: '需要提供基金代码' })

  const body = await readBody(event)
  const { sector } = await updateSectorSchema.parseAsync(body)

  const db = useDb()
  const [updatedFund] = await db.update(funds)
    .set({ sector })
    .where(eq(funds.code, code))
    .returning()

  if (!updatedFund)
    throw createError({ statusCode: 404, statusMessage: '未找到指定的基金' })

  return { message: '板块更新成功' }
})
