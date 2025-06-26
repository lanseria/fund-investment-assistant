import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { addHolding, HoldingExistsError } from '~~/server/utils/holdings'

const holdingCreateSchema = z.object({
  code: z.string().min(6).max(6),
  name: z.string().optional(),
  holdingAmount: z.number().nonnegative(),
  holdingProfitRate: z.number().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  try {
    const body = await readBody(event)
    const data = await holdingCreateSchema.parseAsync(body)
    // [REFACTOR] 调用新的 addHolding，并传入 userId
    const newHolding = await addHolding({ ...data, userId: user.id })
    return newHolding
  }
  catch (error) {
    if (error instanceof HoldingExistsError)
      throw createError({ statusCode: 409, statusMessage: error.message })

    if (error instanceof z.ZodError)
      throw createError({ statusCode: 400, statusMessage: '输入数据无效。' })

    console.error('添加持仓时发生错误:', error)
    throw createError({ statusCode: 500, statusMessage: '服务器内部错误' })
  }
})
