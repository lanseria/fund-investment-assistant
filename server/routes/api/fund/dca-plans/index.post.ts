import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dcaPlans, funds } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { dcaPlanCreateSchema, initialNextExecutionDate } from '~~/server/utils/dcaPlan'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const body = await readBody(event)

  try {
    const data = await dcaPlanCreateSchema.parseAsync(body)
    const db = useDb()

    // 基金必须已存在于系统中 (funds 为全局共享的基金元数据表)
    const fund = await db.query.funds.findFirst({ where: eq(funds.code, data.fundCode) })
    if (!fund)
      throw createError({ status: 404, statusText: `基金 ${data.fundCode} 不存在，请先添加该基金` })

    const [record] = await db.insert(dcaPlans).values({
      userId: user.id,
      fundCode: data.fundCode,
      amount: String(data.amount),
      frequency: data.frequency,
      anchorDay: data.frequency === 'daily' || data.frequency === 'biweekly' ? null : data.anchorDay ?? null,
      enabled: true,
      nextExecutionDate: initialNextExecutionDate(data.frequency, data.anchorDay),
    }).returning()

    return { statusText: '定投计划已创建', record }
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({ status: 400, statusText: error.issues[0]?.message || '输入无效' })
    }
    throw error
  }
})
