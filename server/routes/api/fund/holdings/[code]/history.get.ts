import { and, asc, eq, gte, lte } from 'drizzle-orm' // 添加 asc 导入
import { z } from 'zod'
import { fundTransactions, strategySignals } from '~~/server/database/schemas' // 导入 fundTransactions
import { getUserFromEvent } from '~~/server/utils/auth' // 导入认证工具
import { useDb } from '~~/server/utils/db'

const querySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  ma: z.union([z.string(), z.array(z.string())]).optional(),
  strategy: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event) // 获取当前用户
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  const query = getQuery(event)
  const { start_date, end_date, ma, strategy } = await querySchema.parseAsync(query)

  const maOptions = (Array.isArray(ma) ? ma : (ma ? [ma] : [])).map(Number).filter(n => !Number.isNaN(n) && n > 0)

  const history = await getHistoryWithMA(code, start_date, end_date, maOptions)

  const db = useDb()

  // 查询用户的已确认交易记录
  // 只查询 status = 'confirmed' 的记录，确保有准确的日期和净值
  const transactions = await db.query.fundTransactions.findMany({
    where: and(
      eq(fundTransactions.fundCode, code),
      eq(fundTransactions.userId, user.id),
      eq(fundTransactions.status, 'confirmed'),
      start_date ? gte(fundTransactions.orderDate, start_date) : undefined,
      end_date ? lte(fundTransactions.orderDate, end_date) : undefined,
    ),
    orderBy: [asc(fundTransactions.orderDate)],
  })

  let signals: any[] = []
  if (strategy) {
    signals = await db.query.strategySignals.findMany({
      where: and(
        eq(strategySignals.fundCode, code),
        eq(strategySignals.strategyName, strategy),
        start_date ? gte(strategySignals.latestDate, start_date) : undefined,
        end_date ? lte(strategySignals.latestDate, end_date) : undefined,
      ),
    })
  }

  return {
    history,
    signals,
    transactions, // 返回交易记录
  }
})
