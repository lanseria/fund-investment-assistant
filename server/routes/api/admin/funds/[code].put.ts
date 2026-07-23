import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 可编辑字段：名称 / 板块 / 基金类型 (均可选)
const updateFundSchema = z.object({
  name: z.string().min(1, '基金名称不能为空').optional(),
  sector: z.string().nullable().optional(),
  fundType: z.enum(['open', 'qdii_lof']).optional(),
})

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码 (code) 是必需的' })

  const body = await readBody(event)
  const data = await updateFundSchema.parseAsync(body)

  // 至少提供一个可编辑字段
  if (Object.keys(data).length === 0)
    throw createError({ status: 400, statusText: '请至少提供一个要修改的字段' })

  const db = useDb()
  const [updatedFund] = await db.update(funds)
    .set(data)
    .where(eq(funds.code, code))
    .returning()

  if (!updatedFund)
    throw createError({ status: 404, statusText: `未找到基金 ${code}` })

  return updatedFund
})
