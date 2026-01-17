// server/utils/fundService.ts
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { funds, navHistory } from '~~/server/database/schemas'
import { fetchFundHistory, fetchFundLofPrice, fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { FundNotFoundError } from '~~/server/utils/errors'

/**
 * 内部辅助函数：查找或创建基金公共信息
 * 供 holdingService 在添加持仓时调用
 */
export async function findOrCreateFund(code: string, fundType: 'open' | 'qdii_lof') {
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

    // 如果昨日净值有效，则根据 API 返回的涨跌幅计算估算净值
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
      percentageChange: percentageChangeBN.toNumber(),
      todayEstimateNav: estimateNavBN ? estimateNavBN.toNumber() : null,
      todayEstimateUpdateTime: new Date(realtimeData.updateTime) || null,
    };
    [fund] = await db.insert(funds).values(newFundData).returning()
  }
  return fund
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

    // 如果昨日净值有效，则根据 API 返回的涨跌幅计算估算净值
    if (yesterdayNavBN.isGreaterThan(0)) {
      // 估值 = 昨日净值 * (1 + 涨跌幅 / 100)
      const multiplier = new BigNumber(1).plus(percentageChangeBN.dividedBy(100))
      estimateNavBN = yesterdayNavBN.times(multiplier)
    }

    await db.update(funds).set({
      percentageChange: percentageChangeBN.toNumber(),
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

  let successCount = 0
  let failedCount = 0

  // 辅助延时函数
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  for (const [index, fund] of allFunds.entries()) {
    try {
      await syncSingleFundEstimate(fund.code)
      successCount++
    }
    catch (e) {
      failedCount++
      console.error(`同步基金 ${fund.code} 估值失败:`, e)
    }

    // 如果不是最后一个，则暂停 300ms ~ 600ms
    if (index < allFunds.length - 1) {
      await sleep(300 + Math.random() * 300)
    }
  }

  return { total: allFunds.length, success: successCount, failed: failedCount }
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

  const startDate = latestRecord ? dayjs(latestRecord.navDate).add(1, 'day').format('YYYY-MM-DD') : undefined

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
