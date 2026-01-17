// server/utils/holdingAnalysis.ts
import BigNumber from 'bignumber.js'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { fundTransactions, holdings, navHistory, strategySignals } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

/**
 * 批量获取指定基金代码最近19天的净值总和与数量
 * 用于计算实时 MA20
 */
async function getBatchLast19NavSums(codes: string[]) {
  if (codes.length === 0)
    return new Map<string, { sum: number, count: number }>()

  const db = useDb()
  const query = sql`
    WITH RankedNavs AS (
      SELECT 
        code, 
        nav,
        ROW_NUMBER() OVER (PARTITION BY code ORDER BY nav_date DESC) as rn
      FROM ${navHistory}
      WHERE code IN ${codes}
    )
    SELECT 
      code, 
      SUM(nav) as total_nav, 
      COUNT(nav) as nav_count
    FROM RankedNavs
    WHERE rn <= 19
    GROUP BY code
  `

  const result = await db.execute(query)
  const map = new Map<string, { sum: number, count: number }>()

  for (const row of result.rows) {
    map.set(String(row.code), {
      sum: Number(row.total_nav),
      count: Number(row.nav_count),
    })
  }

  return map
}

/**
 * 获取历史和MA
 */
export async function getHistoryWithMA(code: string, startDate?: string, endDate?: string, maOptions: number[] = []) {
  const db = useDb()
  const query = db.select().from(navHistory).where(
    and(
      eq(navHistory.code, code),
      startDate ? gte(navHistory.navDate, startDate) : undefined,
      endDate ? lte(navHistory.navDate, endDate) : undefined,
    ),
  ).orderBy(desc(navHistory.navDate))

  const records = await query
  if (!records.length)
    return []

  const data = records.map(r => ({
    date: r.navDate,
    nav: new BigNumber(r.nav),
  })).reverse()

  for (const ma of maOptions) {
    if (ma > 0 && data.length >= ma) {
      for (let i = ma - 1; i < data.length; i++) {
        const window = data.slice(i - ma + 1, i + 1)
        const sum = window.reduce(
          (acc, val) => acc.plus(val.nav),
          new BigNumber(0),
        )
        const movingAverage = sum.dividedBy(ma)
        ;(data[i] as any)[`ma${ma}`] = Number(movingAverage.toNumber().toFixed(4))
      }
    }
  }

  return data.map(point => ({
    ...point,
    nav: point.nav.toNumber(),
  }))
}

/**
 * 获取指定用户的所有持仓数据及其汇总信息
 */
export async function getUserHoldingsAndSummary(userId: number) {
  const db = useDb()
  const userHoldings = await db.query.holdings.findMany({
    where: eq(holdings.userId, userId),
    with: {
      fund: true,
    },
  })

  // 获取用户所有状态为 'pending' 的交易记录
  const pendingTxs = await db.query.fundTransactions.findMany({
    where: and(
      eq(fundTransactions.userId, userId),
      eq(fundTransactions.status, 'pending'),
    ),
    orderBy: [desc(fundTransactions.createdAt)],
  })

  // 获取用户所有状态为 'confirmed' 的历史交易记录
  const confirmedTxs = await db.query.fundTransactions.findMany({
    where: and(
      eq(fundTransactions.userId, userId),
      eq(fundTransactions.status, 'confirmed'),
    ),
    orderBy: [desc(fundTransactions.orderDate), desc(fundTransactions.createdAt)],
  })

  // 将待处理交易记录按 fundCode 分组
  const pendingTxMap = new Map<string, any[]>()
  for (const tx of pendingTxs) {
    if (!pendingTxMap.has(tx.fundCode)) {
      pendingTxMap.set(tx.fundCode, [])
    }
    pendingTxMap.get(tx.fundCode)!.push({
      id: tx.id,
      type: tx.type,
      orderAmount: tx.orderAmount ? Number(tx.orderAmount) : null,
      orderShares: tx.orderShares ? Number(tx.orderShares) : null,
      orderDate: tx.orderDate,
      createdAt: tx.createdAt,
    })
  }

  // 将交易记录按 fundCode 分组
  const historyTxMap = new Map<string, any[]>()
  for (const tx of confirmedTxs) {
    if (!historyTxMap.has(tx.fundCode)) {
      historyTxMap.set(tx.fundCode, [])
    }
    const list = historyTxMap.get(tx.fundCode)!
    if (list.length < 7) {
      list.push({
        id: tx.id,
        type: tx.type,
        date: tx.orderDate,
        amount: tx.confirmedAmount ? Number(tx.confirmedAmount) : null,
        shares: tx.confirmedShares ? Number(tx.confirmedShares) : null,
        nav: tx.confirmedNav ? Number(tx.confirmedNav) : null,
      })
    }
  }

  if (userHoldings.length === 0) {
    return {
      holdings: [],
      summary: { totalHoldingAmount: 0, totalEstimateAmount: 0, totalProfitLoss: 0, totalPercentageChange: 0, count: 0 },
    }
  }

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

  const signalsMap = new Map<string, Record<string, string>>()
  for (const s of latestSignalsRaw) {
    if (!signalsMap.has(s.fundCode))
      signalsMap.set(s.fundCode, {})
    signalsMap.get(s.fundCode)![s.strategyName] = s.signal
  }
  const historyStatsMap = await getBatchLast19NavSums(holdingCodes)

  let totalHoldingAmount = new BigNumber(0)
  let totalEstimateAmount = new BigNumber(0)
  let heldCount = 0

  const formattedHoldings = userHoldings.map((h) => {
    const { fund: fundInfo } = h
    if (!fundInfo)
      return null

    const isHeld = h.shares !== null && h.costPrice !== null && new BigNumber(h.shares).isGreaterThan(0)

    let bias20: number | null = null
    const historyStats = historyStatsMap.get(fundInfo.code)

    const currentPrice = fundInfo.todayEstimateNav
      ? Number(fundInfo.todayEstimateNav)
      : Number(fundInfo.yesterdayNav)

    if (currentPrice > 0 && historyStats) {
      const totalSum = new BigNumber(historyStats.sum).plus(currentPrice)
      const count = historyStats.count + 1

      if (count > 0) {
        const ma20 = totalSum.dividedBy(count)
        bias20 = new BigNumber(currentPrice)
          .minus(ma20)
          .dividedBy(ma20)
          .times(100)
          .toNumber()
      }
    }

    let holdingData: any = {
      code: fundInfo.code,
      name: fundInfo.name,
      sector: fundInfo.sector,
      yesterdayNav: Number(fundInfo.yesterdayNav),
      todayEstimateNav: fundInfo.todayEstimateNav,
      percentageChange: fundInfo.percentageChange,
      todayEstimateUpdateTime: fundInfo.todayEstimateUpdateTime?.toISOString() || null,
      signals: signalsMap.get(fundInfo.code) || {},
      bias20,
      pendingTransactions: pendingTxMap.get(fundInfo.code) || [],
      recentTransactions: historyTxMap.get(fundInfo.code) || [],
    }

    if (isHeld) {
      heldCount++
      const shares = new BigNumber(h.shares!)
      const costPrice = new BigNumber(h.costPrice!)
      const yesterdayNav = new BigNumber(fundInfo.yesterdayNav)

      const totalCost = shares.times(costPrice)
      const holdingAmount = shares.times(yesterdayNav)
      const holdingProfitAmount = holdingAmount.minus(totalCost)
      const holdingProfitRate = totalCost.isGreaterThan(0)
        ? holdingProfitAmount.dividedBy(totalCost).times(100)
        : new BigNumber(0)

      const estimateAmount = fundInfo.todayEstimateNav
        ? shares.times(new BigNumber(fundInfo.todayEstimateNav))
        : holdingAmount

      totalHoldingAmount = totalHoldingAmount.plus(holdingAmount)
      totalEstimateAmount = totalEstimateAmount.plus(estimateAmount)

      holdingData = {
        ...holdingData,
        shares: shares.toNumber(),
        costPrice: costPrice.toNumber(),
        holdingAmount: holdingAmount.toNumber(),
        holdingProfitAmount: holdingProfitAmount.toNumber(),
        holdingProfitRate: holdingProfitRate.toNumber(),
        todayEstimateAmount: estimateAmount.toNumber(),
      }
    }
    else {
      holdingData = {
        ...holdingData,
        shares: null,
        costPrice: null,
        holdingAmount: null,
        holdingProfitAmount: null,
        holdingProfitRate: null,
        todayEstimateAmount: null,
      }
    }
    return holdingData
  }).filter(Boolean)

  formattedHoldings.sort((a, b) => {
    const aIsHeld = a.holdingAmount !== null
    const bIsHeld = b.holdingAmount !== null

    if (aIsHeld && !bIsHeld)
      return -1
    if (!aIsHeld && bIsHeld)
      return 1

    if (aIsHeld && bIsHeld)
      return b.holdingAmount! - a.holdingAmount!

    return a.code.localeCompare(b.code)
  })

  const totalProfitLoss = totalEstimateAmount.minus(totalHoldingAmount)
  const totalPercentageChange = totalHoldingAmount.isGreaterThan(0)
    ? totalProfitLoss.dividedBy(totalHoldingAmount).times(100)
    : new BigNumber(0)

  return {
    holdings: formattedHoldings,
    summary: {
      totalHoldingAmount: totalHoldingAmount.toNumber(),
      totalEstimateAmount: totalEstimateAmount.toNumber(),
      totalProfitLoss: totalProfitLoss.toNumber(),
      totalPercentageChange: totalPercentageChange.toNumber(),
      count: heldCount,
    },
  }
}
