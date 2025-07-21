// server/utils/holdings.ts
import BigNumber from 'bignumber.js'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { funds, holdings, navHistory, strategySignals } from '~~/server/database/schemas'
import { fetchFundHistory, fetchFundLofPrice, fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'
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
async function findOrCreateFund(code: string, fundType: 'open' | 'qdii_lof') {
  const db = useDb()
  let fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })

  if (!fund) {
    // 根据类型调用不同的接口获取初始数据
    const realtimeData = fundType === 'qdii_lof'
      ? await fetchFundLofPrice(code)
      : await fetchFundRealtimeEstimate(code)

    if (!realtimeData)
      throw new Error(`无法获取基金 ${code} 的初始信息。`)

    const yesterdayNavBN = new BigNumber(realtimeData.yesterdayNav)
    const percentageChangeBN = new BigNumber(realtimeData.percentageChange)
    let estimateNavBN: BigNumber | null = null

    // [核心逻辑修改] 如果昨日净值有效，则根据 API 返回的涨跌幅计算估算净值
    if (yesterdayNavBN.isGreaterThan(0)) {
      // 估值 = 昨日净值 * (1 + 涨跌幅 / 100)
      const multiplier = new BigNumber(1).plus(percentageChangeBN.dividedBy(100))
      estimateNavBN = yesterdayNavBN.times(multiplier)
    }

    const newFundData = {
      code,
      name: realtimeData.name,
      fundType,
      yesterdayNav: yesterdayNavBN.toString(),
      // [修改] 存储从 API 获取的涨跌幅
      percentageChange: percentageChangeBN.toNumber(),
      // [修改] 存储我们自己计算出的估值
      todayEstimateNav: estimateNavBN ? estimateNavBN.toNumber() : null,
      todayEstimateUpdateTime: new Date(realtimeData.updateTime) || null,
    };
    [fund] = await db.insert(funds).values(newFundData).returning()
  }
  return fund
}

interface HoldingCreateData {
  code: string
  shares?: number | null
  costPrice?: number | null
  userId: number
  fundType: 'open' | 'qdii_lof'
}

/**
 * 为用户创建新的基金持仓
 */
export async function addHolding(data: HoldingCreateData) {
  const db = useDb()

  const existingHolding = await db.query.holdings.findFirst({
    where: and(
      eq(holdings.userId, data.userId),
      eq(holdings.fundCode, data.code),
    ),
  })
  if (existingHolding)
    throw new HoldingExistsError(data.code)

  // 传递 fundType
  await findOrCreateFund(data.code, data.fundType)

  const newHoldingData = {
    userId: data.userId,
    fundCode: data.code,
    shares: data.shares ? String(data.shares) : null,
    costPrice: data.costPrice ? String(data.costPrice) : null,
  }

  const [result] = await db.insert(holdings).values(newHoldingData).returning()
  return result
}

/**
 * 更新用户持仓记录
 */
export async function updateHolding(userId: number, code: string, data: { shares?: number | null, costPrice?: number | null }) {
  const db = useDb()

  // 更新逻辑现在只设置份额和成本价
  const [updatedHolding] = await db.update(holdings)
    .set({
      shares: data.shares !== undefined ? (data.shares ? String(data.shares) : null) : undefined,
      costPrice: data.costPrice !== undefined ? (data.costPrice ? String(data.costPrice) : null) : undefined,
    })
    .where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))
    .returning()

  if (!updatedHolding)
    throw new HoldingNotFoundError(code)

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
  // 使用 leftJoin 关联 funds 表以获取 fundType
  const userHoldings = await db.select({
    code: holdings.fundCode,
    shares: holdings.shares,
    costPrice: holdings.costPrice,
    fundType: funds.fundType, // 新增导出的字段
  })
    .from(holdings)
    .leftJoin(funds, eq(holdings.fundCode, funds.code)) // 关联条件
    .where(eq(holdings.userId, userId))

  // Drizzle 的 leftJoin 结果可能包含 null，我们需要过滤掉异常情况
  // 理论上每个 holding 都应该有关联的 fund，但这是一种安全的做法
  return userHoldings.filter(h => h.fundType !== null)
}
/**
 * 导入持仓数据
 */
export async function importHoldingsData(dataToImport: { code: string, shares: number, costPrice: number, fundType?: 'open' | 'qdii_lof' }[], overwrite: boolean, userId: number) {
  const db = useDb()
  if (overwrite)
    await db.delete(holdings).where(eq(holdings.userId, userId))

  let importedCount = 0
  let skippedCount = 0

  for (const item of dataToImport) {
    // 检查导入数据格式
    if (!item.code || item.shares === undefined || item.costPrice === undefined) {
      skippedCount++
      continue
    }

    try {
      // 处理 fundType，提供向后兼容性
      // 如果导入的文件没有 fundType 字段（旧版备份），则默认为 'open'
      const fundType = item.fundType || 'open'

      // 调用 findOrCreateFund 时传入 fundType
      const fund = await findOrCreateFund(item.code, fundType)
      if (!fund) {
        skippedCount++
        continue
      }

      // 调用 addHolding 时传入所有必要数据
      await addHolding({
        code: item.code,
        shares: item.shares,
        costPrice: item.costPrice,
        userId,
        fundType, // 传入正确的基金类型
      })
      importedCount++
    }
    catch (error) {
      if (error instanceof HoldingExistsError) {
        // 如果是覆盖模式，理论上不会触发此错误，但非覆盖模式下会
        skippedCount++
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
 * 同步单个基金的最新估值
 */
export async function syncSingleFundEstimate(code: string) {
  const db = useDb()
  // 先查询基金类型
  const fundInfo = await db.query.funds.findFirst({
    where: eq(funds.code, code),
  })

  if (!fundInfo) {
    console.warn(`同步估值失败：未在数据库中找到基金 ${code}。`)
    return
  }

  // 根据类型调用不同接口
  const realtimeData = fundInfo.fundType === 'qdii_lof'
    ? await fetchFundLofPrice(code)
    : await fetchFundRealtimeEstimate(code)

  // 检查是否成功获取到实时数据
  if (realtimeData) {
    const yesterdayNavBN = new BigNumber(fundInfo.yesterdayNav)
    const percentageChangeBN = new BigNumber(realtimeData.percentageChange)
    let estimateNavBN: BigNumber | null = null

    // [核心逻辑修改] 如果昨日净值有效，则根据 API 返回的涨跌幅计算估算净值
    if (yesterdayNavBN.isGreaterThan(0)) {
      // 估值 = 昨日净值 * (1 + 涨跌幅 / 100)
      const multiplier = new BigNumber(1).plus(percentageChangeBN.dividedBy(100))
      estimateNavBN = yesterdayNavBN.times(multiplier)
    }

    await db.update(funds).set({
      // [修改] 存储从 API 获取的涨跌幅
      percentageChange: percentageChangeBN.toNumber(),
      // [修改] 存储我们自己计算出的估值
      todayEstimateNav: estimateNavBN ? estimateNavBN.toNumber() : null,
      todayEstimateUpdateTime: new Date(realtimeData.updateTime),
    }).where(eq(funds.code, code))
  }
}

/**
 * 同步所有基金的最新估值
 */
export async function syncAllFundsEstimates() {
  const db = useDb()
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
 * 同步单个基金的历史净值数据
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
    // 使用 BigNumber 过滤无效净值
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
  let heldCount = 0 // 只计算持有的基金数量

  const formattedHoldings = userHoldings.map((h) => {
    const { fund: fundInfo } = h
    if (!fundInfo)
      return null

    // 判断是否为实际持仓
    const isHeld = h.shares !== null && h.costPrice !== null && new BigNumber(h.shares).isGreaterThan(0)

    let holdingData: any = {
      code: fundInfo.code,
      name: fundInfo.name,
      yesterdayNav: Number(fundInfo.yesterdayNav),
      todayEstimateNav: fundInfo.todayEstimateNav,
      percentageChange: fundInfo.percentageChange,
      todayEstimateUpdateTime: fundInfo.todayEstimateUpdateTime?.toISOString() || null,
      signals: signalsMap.get(fundInfo.code) || {},
    }

    if (isHeld) {
      heldCount++ // 统计持仓数量
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
      // 如果是关注的基金，这些值为 null
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
      count: heldCount, // 汇总里的数量只显示持仓数
    },
  }
}
