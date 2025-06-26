// server/utils/holdings.ts
/* eslint-disable no-console */
import BigNumber from 'bignumber.js'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
// [REFACTOR] 导入新的 funds 表 schema
import { funds, holdings, navHistory, strategySignals } from '~~/server/database/schemas'
import { fetchFundHistory, fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'

// [REFACTOR] 更新了错误类型
export class HoldingExistsError extends Error {
  constructor(code: string) {
    super(`您已持有该基金(代码: ${code})，请勿重复添加。`)
    this.name = 'HoldingExistsError'
  }
}

export class FundNotFoundError extends Error {
  constructor(code: string) {
    super(`未在系统中找到基金代码为 '${code}' 的信息。`)
    this.name = 'FundNotFoundError'
  }
}

export class HoldingNotFoundError extends Error {
  constructor(code: string) {
    super(`您未持有基金代码为 '${code}' 的持仓记录。`)
    this.name = 'HoldingNotFoundError'
  }
}

// [NEW] 内部辅助函数：查找或创建基金公共信息
async function findOrCreateFund(code: string) {
  const db = useDb()
  let fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })

  if (!fund) {
    const realtimeData = await fetchFundRealtimeEstimate(code)
    if (!realtimeData)
      throw new Error(`无法获取基金 ${code} 的初始信息。`)

    const newFundData = {
      code,
      name: realtimeData.name,
      yesterdayNav: realtimeData.dwjz,
      todayEstimateNav: Number(realtimeData.gsz) || null,
      percentageChange: Number(realtimeData.gszzl) || null,
      todayEstimateUpdateTime: new Date(realtimeData.gztime) || null,
    };
    [fund] = await db.insert(funds).values(newFundData).returning()
  }
  return fund
}

interface HoldingCreateData {
  code: string
  name?: string // name 字段不再强制要求，因为可以从 fund 表获取
  holdingAmount: number
  holdingProfitRate?: number | null
  userId: number
}

/**
 * [REFACTOR] 为用户创建新的基金持仓
 */
export async function addHolding(data: HoldingCreateData) {
  const db = useDb()

  // 1. 检查用户是否已持有该基金
  const existingHolding = await db.query.holdings.findFirst({
    where: and(
      eq(holdings.userId, data.userId),
      eq(holdings.fundCode, data.code),
    ),
  })
  if (existingHolding)
    throw new HoldingExistsError(data.code)

  // 2. 查找或创建基金的公共信息
  const fund = await findOrCreateFund(data.code)
  const yesterdayNav = Number(fund!.yesterdayNav)
  if (Number.isNaN(yesterdayNav) || yesterdayNav <= 0)
    throw new Error(`基金 ${data.code} 的净值无效，无法计算份额。`)

  // 3. 计算份额和收益
  const shares = data.holdingAmount / yesterdayNav
  let profitAmount: number | null = null
  if (data.holdingProfitRate !== null && data.holdingProfitRate !== undefined) {
    const cost = data.holdingAmount / (1 + data.holdingProfitRate / 100)
    profitAmount = data.holdingAmount - cost
  }

  // 4. 在 holdings 表中插入用户持仓记录
  const newHoldingData = {
    userId: data.userId,
    fundCode: data.code,
    shares: shares.toFixed(4),
    holdingAmount: data.holdingAmount.toFixed(2),
    holdingProfitAmount: profitAmount ? profitAmount.toFixed(2) : null,
    holdingProfitRate: data.holdingProfitRate ?? null,
  }

  const [result] = await db.insert(holdings).values(newHoldingData).returning()
  return result
}

/**
 * [REFACTOR] 更新用户持仓记录
 */
export async function updateHolding(userId: number, code: string, data: { holdingAmount: number, holdingProfitRate?: number | null }) {
  const db = useDb()

  // 1. 验证用户是否持有该基金
  const holding = await db.query.holdings.findFirst({ where: and(eq(holdings.userId, userId), eq(holdings.fundCode, code)) })
  if (!holding)
    throw new HoldingNotFoundError(code)

  // 2. 获取基金的公共信息
  const fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })
  if (!fund)
    throw new FundNotFoundError(code)

  const yesterdayNav = Number(fund.yesterdayNav)
  if (yesterdayNav <= 0)
    throw new Error(`基金 ${code} 的昨日净值为零或无效，无法重新计算份额。`)

  // 3. 计算新份额和收益
  const newShares = data.holdingAmount / yesterdayNav
  let profitAmount: number | null = null
  if (data.holdingProfitRate !== null && data.holdingProfitRate !== undefined) {
    const cost = data.holdingAmount / (1 + data.holdingProfitRate / 100)
    profitAmount = data.holdingAmount - cost
  }

  // 4. 更新用户的持仓记录
  const [updatedHolding] = await db.update(holdings)
    .set({
      holdingAmount: data.holdingAmount.toFixed(2),
      shares: newShares.toFixed(4),
      holdingProfitRate: data.holdingProfitRate ?? null,
      holdingProfitAmount: profitAmount ? profitAmount.toFixed(2) : null,
    })
    .where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))
    .returning()

  // 顺便触发一下基金公共信息的估值更新
  await syncSingleFundEstimate(code)

  return updatedHolding
}

/**
 * [REFACTOR] 删除用户持仓
 */
export async function deleteHolding(userId: number, code: string) {
  const db = useDb()
  // 直接删除用户的持仓记录，无需检查，Drizzle的delete会返回被删除的行数
  const result = await db.delete(holdings).where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))

  if (result.rowCount === 0)
    throw new HoldingNotFoundError(code)

  // 注意：不再删除 navHistory，因为它是全局共享的
}

/**
 * [REFACTOR] 导出指定用户的持仓数据
 */
export async function exportHoldingsData(userId: number) {
  const db = useDb()
  const userHoldings = await db.select({
    code: holdings.fundCode, // 导出 fundCode
    shares: holdings.shares,
    holdingProfitRate: holdings.holdingProfitRate,
  }).from(holdings).where(eq(holdings.userId, userId))
  return userHoldings
}

/**
 * [REFACTOR] 导入持仓数据
 */
export async function importHoldingsData(dataToImport: { code: string, shares: number, holdingProfitRate?: number | null }[], overwrite: boolean, userId: number) {
  const db = useDb()
  if (overwrite) {
    await db.delete(holdings).where(eq(holdings.userId, userId))
  }

  let importedCount = 0
  let skippedCount = 0

  for (const item of dataToImport) {
    if (!item.code || item.shares === undefined) {
      skippedCount++
      continue
    }

    try {
      const fund = await findOrCreateFund(item.code)
      if (!fund || new BigNumber(fund.yesterdayNav).isLessThanOrEqualTo(0)) {
        skippedCount++
        continue
      }

      const holdingAmount = new BigNumber(item.shares).times(fund.yesterdayNav).toNumber()

      await addHolding({
        code: item.code,
        holdingAmount,
        holdingProfitRate: item.holdingProfitRate,
        userId,
      })
      importedCount++
    }
    catch (error) {
      if (error instanceof HoldingExistsError) {
        skippedCount++ // 如果非覆盖模式下已存在，则跳过
      }
      else {
        console.error(`导入基金 ${item.code} 失败:`, error)
        skippedCount++
      }
    }
  }
  return { imported: importedCount, skipped: skippedCount }
}

/**
 * [REFACTOR] 同步单个基金的最新估值 (更新 funds 表)
 */
export async function syncSingleFundEstimate(code: string) {
  const db = useDb()
  const realtimeData = await fetchFundRealtimeEstimate(code)
  if (realtimeData && realtimeData.gsz) {
    const estimateNav = Number(realtimeData.gsz)
    await db.update(funds).set({
      todayEstimateNav: estimateNav,
      percentageChange: Number(realtimeData.gszzl),
      todayEstimateUpdateTime: new Date(realtimeData.gztime),
    }).where(eq(funds.code, code))
  }
}

/**
 * [REFACTOR] 同步所有基金的最新估值 (更新 funds 表)
 */
export async function syncAllFundsEstimates() {
  const db = useDb()
  // 从 funds 表获取所有基金
  const allFunds = await db.query.funds.findMany()

  if (allFunds.length === 0)
    return { total: 0, success: 0, failed: 0 }

  const results = await Promise.allSettled(
    allFunds.map(fund => syncSingleFundEstimate(fund.code)),
  )

  const successCount = results.filter(r => r.status === 'fulfilled').length
  const failedCount = results.length - successCount

  console.log(`[Estimate Sync] Completed. Total: ${results.length}, Success: ${successCount}, Failed: ${failedCount}`)
  return { total: results.length, success: successCount, failed: failedCount }
}

/**
 * [REFACTOR] 同步单个基金的历史净值数据 (更新 navHistory 和 funds 表)
 */
export async function syncSingleFundHistory(code: string): Promise<number> {
  const db = useDb()
  const fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })

  if (!fund)
    throw new FundNotFoundError(code)

  const latestRecord = await db.query.navHistory.findFirst({
    where: eq(navHistory.code, code),
    orderBy: [desc(navHistory.navDate)],
  })

  const startDate = latestRecord ? useDayjs()(latestRecord.navDate).add(1, 'day').format('YYYY-MM-DD') : undefined

  const historyData = await fetchFundHistory(code, startDate)
  if (!historyData.length)
    return 0

  const newRecords = historyData
    .map(r => ({ code, navDate: r.FSRQ, nav: r.DWJZ }))
    .filter(r => Number(r.nav) > 0)

  if (newRecords.length > 0) {
    await db.insert(navHistory).values(newRecords).onConflictDoNothing()
    const latestNav = newRecords[0]!.nav // API返回是降序的
    // 更新 funds 表的最新净值
    await db.update(funds).set({
      yesterdayNav: latestNav,
    }).where(eq(funds.code, code))
  }

  return newRecords.length
}

// [UNCHANGED] 获取历史和MA的函数基本不变，因为它操作的是 navHistory
export async function getHistoryWithMA(code: string, startDate?: string, endDate?: string, maOptions: number[] = []) {
  // ... 此函数内容保持不变 ...
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
        ;(data[i] as any)[`ma${ma}`] = movingAverage.toNumber()
      }
    }
  }

  return data.map(point => ({
    ...point,
    nav: point.nav.toNumber(),
  }))
}

/**
 * [新增] 获取指定用户的所有持仓数据及其汇总信息
 * @param userId 用户 ID
 */
export async function getUserHoldingsAndSummary(userId: number) {
  const db = useDb()
  const userHoldings = await db.query.holdings.findMany({
    where: eq(holdings.userId, userId),
    with: {
      fund: true,
    },
  })

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

  let totalHoldingAmount = 0
  let totalEstimateAmount = 0

  const formattedHoldings = userHoldings.map((h) => {
    const fundInfo = h.fund
    const holdingAmount = Number(h.holdingAmount)
    const estimateAmount = fundInfo.todayEstimateNav
      ? Number(h.shares) * fundInfo.todayEstimateNav
      : holdingAmount

    totalHoldingAmount += holdingAmount
    totalEstimateAmount += estimateAmount

    return {
      code: fundInfo.code,
      name: fundInfo.name,
      yesterdayNav: Number(fundInfo.yesterdayNav),
      todayEstimateNav: fundInfo.todayEstimateNav,
      percentageChange: fundInfo.percentageChange,
      todayEstimateUpdateTime: fundInfo.todayEstimateUpdateTime?.toISOString() || null,
      shares: Number(h.shares),
      holdingAmount,
      holdingProfitAmount: h.holdingProfitAmount ? Number(h.holdingProfitAmount) : null,
      holdingProfitRate: h.holdingProfitRate,
      todayEstimateAmount: estimateAmount,
      signals: signalsMap.get(fundInfo.code) || {},
    }
  })

  const totalProfitLoss = totalEstimateAmount - totalHoldingAmount
  const totalPercentageChange = totalHoldingAmount > 0 ? (totalProfitLoss / totalHoldingAmount) * 100 : 0

  return {
    holdings: formattedHoldings,
    summary: { totalHoldingAmount, totalEstimateAmount, totalProfitLoss, totalPercentageChange, count: userHoldings.length },
  }
}
