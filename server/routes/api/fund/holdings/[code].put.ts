// server/routes/api/fund/holdings/[code].put.ts
import { z } from 'zod'
import { HoldingNotFoundError, updateHolding } from '~~/server/utils/holdings'

const holdingUpdateSchema = z.object({
  holdingAmount: z.number().positive(),
  holdingProfitRate: z.number().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  try {
    const body = await readBody(event)
    const data = await holdingUpdateSchema.parseAsync(body)
    const updated = await updateHolding(code, data)
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
