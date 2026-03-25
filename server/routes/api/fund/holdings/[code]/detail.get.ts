import BigNumber from 'bignumber.js'
import { and, eq } from 'drizzle-orm'
import { funds, holdings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

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

  return {
    code: fundInfo.code,
    name: fundInfo.name,
    sector: fundInfo.sector,
    fundType: fundInfo.fundType,
    yesterdayNav: Number(fundInfo.yesterdayNav),
    todayEstimateNav: fundInfo.todayEstimateNav ? Number(fundInfo.todayEstimateNav) : null,
    percentageChange: fundInfo.percentageChange ? Number(fundInfo.percentageChange) : null,
    todayEstimateUpdateTime: fundInfo.todayEstimateUpdateTime,
    shares: holdingInfo?.shares ? Number(holdingInfo.shares) : null,
    costPrice: holdingInfo?.costPrice ? Number(holdingInfo.costPrice) : null,
    holdingAmount,
    holdingProfitAmount,
    holdingProfitRate,
  }
})
