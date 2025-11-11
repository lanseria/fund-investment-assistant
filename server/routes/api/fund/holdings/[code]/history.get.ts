// File: server/routes/api/fund/holdings/[code]/history.get.ts

import { and, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { strategySignals } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { getHistoryWithMA } from '~~/server/utils/holdings'

const querySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  ma: z.union([z.string(), z.array(z.string())]).optional(),
  strategy: z.string().optional(), // 接收策略名称参数
})

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  const query = getQuery(event)
  const { start_date, end_date, ma, strategy } = await querySchema.parseAsync(query)

  const maOptions = (Array.isArray(ma) ? ma : (ma ? [ma] : [])).map(Number).filter(n => !Number.isNaN(n) && n > 0)

  const history = await getHistoryWithMA(code, start_date, end_date, maOptions)

  // 如果请求中包含策略名称，则查询并返回对应的信号
  let signals: any[] = []
  if (strategy) {
    const db = useDb()
    signals = await db.query.strategySignals.findMany({
      where: and(
        eq(strategySignals.fundCode, code),
        eq(strategySignals.strategyName, strategy),
        start_date ? gte(strategySignals.latestDate, start_date) : undefined,
        end_date ? lte(strategySignals.latestDate, end_date) : undefined,
      ),
    })
  }

  // 返回包含历史数据和策略信号的对象
  return {
    history,
    signals,
  }
})
