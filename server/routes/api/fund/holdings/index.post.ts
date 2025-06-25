import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { createNewHolding, HoldingExistsError } from '~~/server/utils/holdings'

const holdingCreateSchema = z.object({
  code: z.string().min(6).max(6),
  name: z.string().optional(),
  holdingAmount: z.number().nonnegative(),
  holdingProfitRate: z.number().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event) // [新增] 获取当前用户
  try {
    const body = await readBody(event)
    const data = await holdingCreateSchema.parseAsync(body)
    const newHolding = await createNewHolding({ ...data, userId: user.id })
    return newHolding
  }
  catch (error) {
    if (error instanceof HoldingExistsError)
      throw createError({ statusCode: 409, statusMessage: error.message })

    if (error instanceof z.ZodError)
      throw createError({ statusCode: 400, statusMessage: 'Invalid input data.' })

    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
