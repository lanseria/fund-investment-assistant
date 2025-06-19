import { z } from 'zod'
import { createNewHolding, HoldingExistsError } from '~~/server/utils/holdings'

const holdingCreateSchema = z.object({
  code: z.string().min(6).max(6),
  name: z.string().optional(),
  holdingAmount: z.number().nonnegative(),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const data = await holdingCreateSchema.parseAsync(body)
    const newHolding = await createNewHolding(data)
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
