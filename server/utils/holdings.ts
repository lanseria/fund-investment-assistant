// server/utils/holdings.ts
import BigNumber from 'bignumber.js'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { funds, holdings, navHistory, strategySignals } from '~~/server/database/schemas'
import { fetchFundHistory, fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'

// 更新了错误类型
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

// 内部辅助函数：查找或创建基金公共信息
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
 * 为用户创建新的基金持仓
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
  const yesterdayNav = new BigNumber(fund!.yesterdayNav)
  if (yesterdayNav.isNaN() || yesterdayNav.isLessThanOrEqualTo(0))
    throw new Error(`基金 ${data.code} 的净值无效，无法计算份额。`)

  // 3. 计算份额和收益
  // [MODIFIED] 使用 BigNumber进行精确计算，避免浮点数精度问题
  const shares = new BigNumber(data.holdingAmount).dividedBy(yesterdayNav)

  // 4. 在 holdings 表中插入用户持仓记录
  const newHoldingData = {
    userId: data.userId,
    fundCode: data.code,
    shares: shares.toFixed(4), // 存储为固定4位小数的字符串
    holdingProfitRate: data.holdingProfitRate ?? null,
  }

  const [result] = await db.insert(holdings).values(newHoldingData).returning()
  return result
}

/**
 * 更新用户持仓记录
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

  const yesterdayNav = new BigNumber(fund.yesterdayNav)
  if (yesterdayNav.isLessThanOrEqualTo(0))
    throw new Error(`基金 ${code} 的昨日净值为零或无效，无法重新计算份额。`)

  // 3. 计算新份额和收益
  // 使用 BigNumber进行精确计算，避免浮点数精度问题
  const newShares = new BigNumber(data.holdingAmount).dividedBy(yesterdayNav)

  // 4. 更新用户的持仓记录
  const [updatedHolding] = await db.update(holdings)
    .set({
      shares: newShares.toFixed(4), // 存储为固定4位小数的字符串
      holdingProfitRate: data.holdingProfitRate ?? null,
    })
    .where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))
    .returning()

  // 顺便触发一下基金公共信息的估值更新
  await syncSingleFundEstimate(code)

  return updatedHolding
}

/**
 * 删除用户持仓
 */
export async function deleteHolding(userId: number, code: string) {
  const db = useDb()
  // 直接删除用户的持仓记录，无需检查，Drizzle的delete会返回被删除的行数
  const result = await db.delete(holdings).where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))

  if (result.rowCount === 0)
    throw new HoldingNotFoundError(code)
}

/**
 * 导出指定用户的持仓数据
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
 * 导入持仓数据
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
      const yesterdayNav = new BigNumber(fund!.yesterdayNav)
      if (!fund || yesterdayNav.isLessThanOrEqualTo(0)) {
        skippedCount++
        continue
      }

      const holdingAmount = new BigNumber(item.shares).times(yesterdayNav).toNumber()

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
 * 同步单个基金的最新估值 (更新 funds 表)
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
 * 同步所有基金的最新估值 (更新 funds 表)
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

  return { total: results.length, success: successCount, failed: failedCount }
}

/**
 * 同步单个基金的历史净值数据 (更新 navHistory 和 funds 表)
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
    // [MODIFIED] 使用 BigNumber 过滤无效净值
    .filter(r => new BigNumber(r.nav).isGreaterThan(0))

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

// 获取历史和MA的函数基本不变，因为它操作的是 navHistory
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
 * 获取指定用户的所有持仓数据及其汇总信息
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

  let totalHoldingAmount = new BigNumber(0)
  let totalEstimateAmount = new BigNumber(0)

  const formattedHoldings = userHoldings.map((h) => {
    const { fund: fundInfo } = h
    if (!fundInfo)
      return null // 或者根据业务逻辑处理 fund 不存在的情况

    const shares = new BigNumber(h.shares)
    const yesterdayNav = new BigNumber(fundInfo.yesterdayNav)

    // 以昨日净值计算的持仓市值
    const holdingAmount = shares.times(yesterdayNav)
    // 以今日估值计算的持仓市值，如果估值不存在则回退到昨日市值
    const estimateAmount = fundInfo.todayEstimateNav
      ? shares.times(new BigNumber(fundInfo.todayEstimateNav))
      : holdingAmount

    const holdingProfitAmount = estimateAmount.minus(holdingAmount)

    totalHoldingAmount = totalHoldingAmount.plus(holdingAmount)
    totalEstimateAmount = totalEstimateAmount.plus(estimateAmount)

    return {
      code: fundInfo.code,
      name: fundInfo.name,
      yesterdayNav: yesterdayNav.toNumber(),
      todayEstimateNav: fundInfo.todayEstimateNav,
      percentageChange: fundInfo.percentageChange,
      todayEstimateUpdateTime: fundInfo.todayEstimateUpdateTime?.toISOString() || null,
      shares: shares.toNumber(),
      holdingAmount: holdingAmount.toNumber(), // 持仓市值（基于昨日净值）
      holdingProfitAmount: holdingProfitAmount.toNumber(),
      holdingProfitRate: h.holdingProfitRate,
      todayEstimateAmount: estimateAmount.toNumber(), // 估算市值
      signals: signalsMap.get(fundInfo.code) || {},
    }
  }).filter(Boolean) // 过滤掉可能为 null 的项

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
      count: userHoldings.length,
    },
  }
}
