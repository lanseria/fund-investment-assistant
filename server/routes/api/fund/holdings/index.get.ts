// File: server/routes/api/fund/holdings/index.get.ts
import { desc, eq, inArray } from 'drizzle-orm'
import { holdings as holdingsTable, strategySignals } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth' // [新增]
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event) // [新增] 获取当前用户
  const db = useDb()
  // [修改] 查询时加入 userId 条件
  const holdingsList = await db.query.holdings.findMany({
    where: eq(holdingsTable.userId, user.id),
  })

  // 如果没有持仓记录，直接返回空结构
  if (holdingsList.length === 0) {
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

  // [新增] 一次性获取所有持仓基金的最新策略信号
  const holdingCodes = holdingsList.map(h => h.code)
  const latestSignalsRaw = await db
    .selectDistinctOn([strategySignals.fundCode, strategySignals.strategyName], {
      fundCode: strategySignals.fundCode,
      strategyName: strategySignals.strategyName,
      signal: strategySignals.signal,
      latestDate: strategySignals.latestDate,
    })
    .from(strategySignals)
    .where(inArray(strategySignals.fundCode, holdingCodes))
    .orderBy(
      desc(strategySignals.fundCode),
      desc(strategySignals.strategyName),
      desc(strategySignals.latestDate),
    )

  // [新增] 将信号数据处理成更易于前端使用的 Map 结构
  // 结构: Map<fundCode, Record<strategyName, signal>>
  const signalsMap = new Map<string, Record<string, string>>()
  for (const s of latestSignalsRaw) {
    if (!signalsMap.has(s.fundCode))
      signalsMap.set(s.fundCode, {})
    signalsMap.get(s.fundCode)![s.strategyName] = s.signal
  }

  // ... (summary calculation remains the same)
  let totalHoldingAmount = 0
  let totalEstimateAmount = 0

  // [修改] 遍历持仓列表，附加信号并格式化
  const formattedHoldings = holdingsList.map((h) => {
    const holdingAmount = Number(h.holdingAmount)
    const estimateAmount = h.todayEstimateAmount ? Number(h.todayEstimateAmount) : holdingAmount

    totalHoldingAmount += holdingAmount
    totalEstimateAmount += estimateAmount

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
      // [新增] 附加处理好的策略信号
      signals: signalsMap.get(h.code) || {},
    }
  })

  // ... (return statement remains the same)
  const totalProfitLoss = totalEstimateAmount - totalHoldingAmount
  const totalPercentageChange = totalHoldingAmount > 0 ? (totalProfitLoss / totalHoldingAmount) * 100 : 0

  return {
    holdings: formattedHoldings,
    summary: {
      totalHoldingAmount,
      totalEstimateAmount,
      totalProfitLoss,
      totalPercentageChange,
      count: holdingsList.length,
    },
  }
})
