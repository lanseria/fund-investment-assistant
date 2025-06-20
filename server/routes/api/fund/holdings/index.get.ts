// File: server/routes/api/fund/holdings/index.get.ts

import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async () => {
  const db = useDb()
  const holdings = await db.query.holdings.findMany()

  if (holdings.length === 0) {
    return {
      holdings: [],
      summary: {
        totalHoldingAmount: 0,
        totalEstimateAmount: 0,
        totalProfitLoss: 0,
        totalPercentageChange: 0,
        count: 0,
      },
    }
  }

  let totalHoldingAmount = 0
  let totalEstimateAmount = 0

  const formattedHoldings = holdings.map((h) => {
    const holdingAmount = Number(h.holdingAmount)
    const estimateAmount = h.todayEstimateAmount ? Number(h.todayEstimateAmount) : holdingAmount

    totalHoldingAmount += holdingAmount
    totalEstimateAmount += estimateAmount

    // 返回给前端的列表项
    return {
      ...h,
      shares: Number(h.shares),
      yesterdayNav: Number(h.yesterdayNav),
      holdingAmount,
      holdingProfitAmount: h.holdingProfitAmount ? Number(h.holdingProfitAmount) : null,
      holdingProfitRate: h.holdingProfitRate,
      todayEstimateNav: h.todayEstimateNav,
      todayEstimateAmount: h.todayEstimateAmount ? Number(h.todayEstimateAmount) : null,
      todayEstimateUpdateTime: h.todayEstimateUpdateTime?.toISOString() || null,
    }
  })

  // [新增] 计算最终的汇总数据
  const totalProfitLoss = totalEstimateAmount - totalHoldingAmount
  const totalPercentageChange = totalHoldingAmount > 0 ? (totalProfitLoss / totalHoldingAmount) * 100 : 0

  // [修改] 返回新的数据结构
  return {
    holdings: formattedHoldings,
    summary: {
      totalHoldingAmount,
      totalEstimateAmount,
      totalProfitLoss,
      totalPercentageChange,
      count: holdings.length,
    },
  }
})
