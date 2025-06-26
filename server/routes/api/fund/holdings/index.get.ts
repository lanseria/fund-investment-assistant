// server/routes/api/fund/holdings/index.get.ts
import { desc, eq, inArray } from 'drizzle-orm'
// [REFACTOR] 导入新的 funds 表
import { funds as fundsTable, holdings as holdingsTable, strategySignals } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event) // [新增] 获取当前用户
  const db = useDb()
  // [REFACTOR] 使用 Drizzle 的关系查询 (with) 来联表查询
  const userHoldings = await db.query.holdings.findMany({
    where: eq(holdingsTable.userId, user.id),
    with: {
      // 自动 JOIN `funds` 表，并将结果附加到 `fund` 属性上
      fund: true,
    },
  })

  // 如果没有持仓记录，直接返回空结构
  if (userHoldings.length === 0) {
    return {
      holdings: [],
      summary: { totalHoldingAmount: 0, totalEstimateAmount: 0, totalProfitLoss: 0, totalPercentageChange: 0, count: 0 },
    }
  }

  // [新增] 一次性获取所有持仓基金的最新策略信号
  const holdingCodes = userHoldings.map(h => h.fundCode)
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

  const formattedHoldings = userHoldings.map((h) => {
    // h.fund 是从 funds 表 JOIN 来的数据
    const fundInfo = h.fund
    const holdingAmount = Number(h.holdingAmount)

    // [REFACTOR] 估算市值现在从 fund 表的公共信息和用户持仓的份额计算
    const estimateAmount = fundInfo.todayEstimateNav
      ? Number(h.shares) * fundInfo.todayEstimateNav
      : holdingAmount

    totalHoldingAmount += holdingAmount
    totalEstimateAmount += estimateAmount

    return {
      // 从 fund 表获取
      code: fundInfo.code,
      name: fundInfo.name,
      yesterdayNav: Number(fundInfo.yesterdayNav),
      todayEstimateNav: fundInfo.todayEstimateNav,
      percentageChange: fundInfo.percentageChange,
      todayEstimateUpdateTime: fundInfo.todayEstimateUpdateTime?.toISOString() || null,

      // 从 holding 表获取
      shares: Number(h.shares),
      holdingAmount,
      holdingProfitAmount: h.holdingProfitAmount ? Number(h.holdingProfitAmount) : null,
      holdingProfitRate: h.holdingProfitRate,

      // [REFACTOR] 动态计算的估算金额
      todayEstimateAmount: estimateAmount,

      // 策略信号
      signals: signalsMap.get(fundInfo.code) || {},
    }
  })

  const totalProfitLoss = totalEstimateAmount - totalHoldingAmount
  const totalPercentageChange = totalHoldingAmount > 0 ? (totalProfitLoss / totalHoldingAmount) * 100 : 0

  return {
    holdings: formattedHoldings,
    summary: { totalHoldingAmount, totalEstimateAmount, totalProfitLoss, totalPercentageChange, count: userHoldings.length },
  }
})
