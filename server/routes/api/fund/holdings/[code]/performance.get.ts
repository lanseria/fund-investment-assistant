import dayjs from 'dayjs'
import { and, asc, desc, eq, lte } from 'drizzle-orm'
import { navHistory } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code) {
    throw createError({ statusCode: 400, message: 'Fund code is required' })
  }

  const db = useDb()

  // 1. 获取最新的一条净值记录
  const latestRecord = await db.query.navHistory.findFirst({
    where: eq(navHistory.code, code),
    orderBy: [desc(navHistory.navDate)],
  })

  if (!latestRecord) {
    return {} // 无数据
  }

  const latestNav = Number(latestRecord.nav)
  const latestDate = dayjs(latestRecord.navDate)

  // 定义我们需要计算的时间跨度
  const ranges = [
    { key: '1m', amount: 1, unit: 'month' },
    { key: '3m', amount: 3, unit: 'month' },
    { key: '6m', amount: 6, unit: 'month' },
    { key: '1y', amount: 1, unit: 'year' },
    { key: '2y', amount: 2, unit: 'year' },
    { key: '5y', amount: 5, unit: 'year' },
  ] as const

  const result: Record<string, number | null> = {}

  // 2. 循环查询各个时间点的历史净值
  for (const range of ranges) {
    const targetDate = latestDate.subtract(range.amount, range.unit).format('YYYY-MM-DD')

    // 查找 <= targetDate 的最近一条记录
    const pastRecord = await db.query.navHistory.findFirst({
      where: and(
        eq(navHistory.code, code),
        lte(navHistory.navDate, targetDate),
      ),
      orderBy: [desc(navHistory.navDate)],
    })

    if (pastRecord && Number(pastRecord.nav) > 0) {
      const pastNav = Number(pastRecord.nav)
      const change = ((latestNav - pastNav) / pastNav) * 100
      result[range.key] = Number(change.toFixed(2))
    }
    else {
      result[range.key] = null
    }
  }

  // 3. 特殊处理 "all" (成立以来)
  const earliestRecord = await db.query.navHistory.findFirst({
    where: eq(navHistory.code, code),
    orderBy: [asc(navHistory.navDate)], // 最早的日期
  })

  if (earliestRecord && Number(earliestRecord.nav) > 0) {
    const earliestNav = Number(earliestRecord.nav)
    const change = ((latestNav - earliestNav) / earliestNav) * 100
    result.all = Number(change.toFixed(2))
  }
  else {
    result.all = null
  }

  return result
})
