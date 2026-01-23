import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'

const holdingCreateSchema = z.object({
  code: z.string().length(6),
  shares: z.number().positive('份额必须为正数').nullable().optional(),
  costPrice: z.number().positive('成本价必须为正数').nullable().optional(),
  fundType: z.enum(['open', 'qdii_lof']),
}).refine(data => (data.shares && data.costPrice) || (!data.shares && !data.costPrice), {
  message: '持有份额和持仓成本价必须同时填写或同时不填。',
  path: ['shares'],
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  try {
    const body = await readBody(event)
    const data = await holdingCreateSchema.parseAsync(body)
    const newHolding = await addHolding({ ...data, userId: user.id })
    return newHolding
  }
  catch (error) {
    if (error instanceof HoldingExistsError)
      throw createError({ status: 409, statusText: error.message })

    if (error instanceof z.ZodError)
      throw createError({ status: 400, statusText: '输入数据无效。' })

    console.error('添加持仓时发生错误:', error)
    throw createError({ status: 500, statusText: '服务器内部错误' })
  }
})
