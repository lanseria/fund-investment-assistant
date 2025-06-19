import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async () => {
  const db = useDb()
  const holdings = await db.query.holdings.findMany()
  // 转换 decimal/real 为 number
  return holdings.map(h => ({
    ...h,
    shares: Number(h.shares),
    yesterdayNav: Number(h.yesterdayNav),
    holdingAmount: Number(h.holdingAmount),
    todayEstimateNav: h.todayEstimateNav,
    todayEstimateAmount: h.todayEstimateAmount ? Number(h.todayEstimateAmount) : null,
    todayEstimateUpdateTime: h.todayEstimateUpdateTime?.toISOString() || null,
  }))
})
