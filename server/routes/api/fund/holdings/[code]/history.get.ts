import { z } from 'zod'
import { getHistoryWithMA } from '~~/server/utils/holdings'

const querySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  ma: z.union([z.string(), z.array(z.string())]).optional(),
})

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  const query = getQuery(event)
  const { start_date, end_date, ma } = await querySchema.parseAsync(query)

  const maOptions = (Array.isArray(ma) ? ma : (ma ? [ma] : [])).map(Number).filter(n => !Number.isNaN(n) && n > 0)

  const history = await getHistoryWithMA(code, start_date, end_date, maOptions)
  return history
})
