import { eq } from 'drizzle-orm'
import { sectorDailyStats } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 简单鉴权
  getUserFromEvent(event)

  const query = getQuery(event)
  const dateStr = query.date as string

  if (!dateStr) {
    throw createError({ status: 400, statusText: '需要提供查询日期 (date)' })
  }

  const db = useDb()
  // 获取当日所有板块的统计数据
  const stats = await db.query.sectorDailyStats.findMany({
    where: eq(sectorDailyStats.date, dateStr),
  })

  return stats
})
