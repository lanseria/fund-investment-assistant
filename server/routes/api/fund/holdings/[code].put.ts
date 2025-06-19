import { z } from 'zod'
import { HoldingNotFoundError, updateHoldingAmount } from '~~/server/utils/holdings'

const holdingUpdateSchema = z.object({
  holding_amount: z.number().positive(),
})

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  try {
    const body = await readBody(event)
    const data = await holdingUpdateSchema.parseAsync(body)
    const updated = await updateHoldingAmount(code, data.holding_amount)
    return updated
  }
  catch (error) {
    if (error instanceof HoldingNotFoundError)
      throw createError({ statusCode: 404, statusMessage: error.message })

    if (error instanceof z.ZodError)
      throw createError({ statusCode: 400, statusMessage: 'Invalid input data.' })

    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
