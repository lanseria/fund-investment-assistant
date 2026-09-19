import BigNumber from 'bignumber.js'
import { and, desc, eq } from 'drizzle-orm'
import { fundFees, funds, fundStockHoldings, holdings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { fetchStocksRealtime } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { enrichStocksWithQuotes } from '~~/server/utils/stockHoldingService'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码不能为空' })

  const query = getQuery(event)
  const targetUserId = query.userId ? Number(query.userId) : user.id

  const db = useDb()
  const fundInfo = await db.query.funds.findFirst({
    where: eq(funds.code, code),
  })

  if (!fundInfo) {
    throw createError({ status: 404, statusText: '未找到该基金' })
  }

  const holdingInfo = await db.query.holdings.findFirst({
    where: and(eq(holdings.userId, targetUserId), eq(holdings.fundCode, code)),
  })

  let holdingAmount = null
  let holdingProfitAmount = null
  let holdingProfitRate = null

  // 如果用户持有该基金，则计算盈亏数据
  if (holdingInfo && holdingInfo.shares && holdingInfo.costPrice) {
    const shares = new BigNumber(holdingInfo.shares)
    const cost = new BigNumber(holdingInfo.costPrice)
    const price = fundInfo.todayEstimateNav ? new BigNumber(fundInfo.todayEstimateNav) : new BigNumber(fundInfo.yesterdayNav)

    const totalCost = shares.times(cost)
    const currentAmount = shares.times(price)

    holdingAmount = currentAmount.toNumber()
    holdingProfitAmount = currentAmount.minus(totalCost).toNumber()
    holdingProfitRate = totalCost.gt(0) ? currentAmount.minus(totalCost).div(totalCost).times(100).toNumber() : 0
  }

  // 查询基金费率(仅前端展示用)
  const feesInfo = await db.query.fundFees.findFirst({
    where: eq(fundFees.fundCode, code),
  })

  // 查询重仓股持仓(季报口径,占净值比降序),并补全最新行情快照(腾讯源,Python 端 60s 缓存)。
  // 行情接口不可用时行情字段为 null,持仓列表仍正常返回(详情页高频接口,超时收紧到 5s)。
  const stockHoldingRows = await db.query.fundStockHoldings.findMany({
    where: eq(fundStockHoldings.fundCode, code),
    orderBy: [desc(fundStockHoldings.pct)],
  })
  const stockQuotes = stockHoldingRows.length > 0
    ? await fetchStocksRealtime(stockHoldingRows.map(row => row.stockCode), { timeoutMs: 5000 })
    : []
  const coverage = Number(stockHoldingRows.reduce((sum, row) => sum + row.pct, 0).toFixed(2))
  const stockHoldingsSummary = stockHoldingRows.length > 0
    ? {
        reportDate: stockHoldingRows[0]!.reportDate,
        /** 重仓合计占净值比例 (%) */
        coverage,
        stocks: enrichStocksWithQuotes(stockHoldingRows, stockQuotes),
      }
    : null

  return {
    code: fundInfo.code,
    name: fundInfo.name,
    sector: fundInfo.sector,
    fundType: fundInfo.fundType,
    yesterdayNav: Number(fundInfo.yesterdayNav),
    todayEstimateNav: fundInfo.todayEstimateNav ? Number(fundInfo.todayEstimateNav) : null,
    percentageChange: fundInfo.percentageChange ? Number(fundInfo.percentageChange) : null,
    todayEstimateUpdateTime: fundInfo.todayEstimateUpdateTime,
    // 自算估值(重仓股行情加权,与官方估算并存)
    selfEstimateNav: fundInfo.selfEstimateNav ?? null,
    selfPercentageChange: fundInfo.selfPercentageChange ?? null,
    selfEstimateUpdateTime: fundInfo.selfEstimateUpdateTime,
    stockHoldings: stockHoldingsSummary,
    shares: holdingInfo?.shares ? Number(holdingInfo.shares) : null,
    costPrice: holdingInfo?.costPrice ? Number(holdingInfo.costPrice) : null,
    holdingAmount,
    holdingProfitAmount,
    holdingProfitRate,
    fees: feesInfo || null,
  }
})
