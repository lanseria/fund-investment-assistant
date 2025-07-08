import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { addHolding, HoldingExistsError } from '~~/server/utils/holdings'

// [重大修改] 更新 Zod schema
const holdingCreateSchema = z.object({
  code: z.string().length(6),
  shares: z.number().positive('份额必须为正数'),
  costPrice: z.number().positive('成本价必须为正数'),
  fundType: z.enum(['open', 'qdii_lof']), // 新增字段
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  try {
    const body = await readBody(event)
    const data = await holdingCreateSchema.parseAsync(body)
    // 调用新的 addHolding，并传入 userId
    const newHolding = await addHolding({ ...data, userId: user.id })
    return newHolding
  }
  catch (error) {
    if (error instanceof HoldingExistsError)
      throw createError({ statusCode: 409, statusMessage: error.message })

    if (error instanceof z.ZodError)
      throw createError({ statusCode: 400, statusMessage: error.errors[0]?.message || '输入数据无效。' })

    console.error('添加持仓时发生错误:', error)
    throw createError({ statusCode: 500, statusMessage: '服务器内部错误' })
  }
})
