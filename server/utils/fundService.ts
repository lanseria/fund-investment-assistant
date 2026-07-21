// server/utils/fundService.ts
/* eslint-disable no-console */
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { fundFees, funds, holdings, navHistory } from '~~/server/database/schemas'
import { fetchFundHistory, fetchFundLofPrice, fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { FundNotFoundError } from '~~/server/utils/errors'

/** Python 接口 /fund/info/{code} 的返回结构 */
interface FundInfoResponse {
  code: string
  name: string
  fundType: 'open' | 'qdii_lof'
  yesterdayNav: string
  navDate: string
  history: { date: string, nav: string }[]
  fees: {
    purchaseFee: string | null
    redemptionFees: { holdingPeriod: string, rate: string }[]
    managementFee: string | null
    custodyFee: string | null
    rawText: string | null
  } | null
}

/**
 * 内部辅助函数：查找或创建基金公共信息
 * 供 holdingService 在添加持仓时调用。
 *
 * 新基金时通过 Python 接口(NUXT_STRATEGY_API_URL/fund/info/{code})一次性获取
 * 基本信息 + 历史净值 + 费率,不再直连天天基金/东方财富。
 * 实时估值刷新(syncSingleFundEstimate)改走 Python 服务
 * (NUXT_STRATEGY_API_URL/fund/realtime/{code},底层东财盘中估值表,60s 缓存)。
 */
export async function findOrCreateFund(code: string, fundType: 'open' | 'qdii_lof') {
  const db = useDb()
  let fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })

  if (!fund) {
    const config = useRuntimeConfig()
    const data = await $fetch<FundInfoResponse>(`${config.strategyApiUrl}/fund/info/${code}`)

    // Python 接口对无效代码返回 200 + 空数据(yesterdayNav 为空字符串),据此判断有效性
    if (!data || !data.name || !data.yesterdayNav || new BigNumber(data.yesterdayNav).lte(0))
      throw new Error(`无法获取基金 ${code} 的初始信息。`)

    const yesterdayNavBN = new BigNumber(data.yesterdayNav)
    // 新建时暂无实时估值(盘中由 syncSingleFundEstimate 填充)
    const newFundData = {
      code,
      name: data.name,
      // 优先采用 Python 接口判断的类型(自动识别 open/qdii_lof),回退到调用方传入值
      fundType: data.fundType || fundType,
      yesterdayNav: yesterdayNavBN.toString(),
    };
    [fund] = await db.insert(funds).values(newFundData).returning()

    // 写入历史净值(Python 返回升序,过滤无效值,批量插入)
    const validHistory = (data.history || [])
      .filter(h => h.nav && new BigNumber(h.nav).isGreaterThan(0))
      .map(h => ({ code, navDate: h.date, nav: h.nav }))

    if (validHistory.length > 0) {
      await db.insert(navHistory).values(validHistory).onConflictDoNothing()
      // 用历史最新一条修正昨日净值(history 升序,取最后一条)
      const latest = validHistory[validHistory.length - 1]!
      if (new BigNumber(latest.nav).isGreaterThan(0)) {
        await db.update(funds).set({ yesterdayNav: latest.nav }).where(eq(funds.code, code))
      }
    }

    // 重新查询,确保返回含最新 yesterdayNav 的完整记录
    fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })

    // 新基金立即获取一次实时估值(填充 todayEstimateNav/percentageChange 等),
    // 避免添加后这三个字段为 null 直到下次定时任务才更新。
    try {
      await syncSingleFundEstimate(code)
      fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })
    }
    catch (e) {
      console.error(`[AutoSync] 新基金 ${code} 首次实时估值获取失败:`, e)
    }

    // 写入费率信息(仅前端展示用)
    if (data.fees) {
      await db.insert(fundFees).values({
        fundCode: code,
        purchaseFee: data.fees.purchaseFee,
        redemptionFees: data.fees.redemptionFees,
        managementFee: data.fees.managementFee,
        custodyFee: data.fees.custodyFee,
        rawText: data.fees.rawText,
      }).onConflictDoNothing()
    }
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
 * 内部辅助：批量同步指定列表的基金
 */
async function syncFundsList(fundsList: typeof funds.$inferSelect[]) {
  if (fundsList.length === 0)
    return { total: 0, success: 0, failed: 0 }

  let successCount = 0
  let failedCount = 0

  // 辅助延时函数
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  for (const [index, fund] of fundsList.entries()) {
    try {
      await syncSingleFundEstimate(fund.code)
      successCount++
    }
    catch (e) {
      failedCount++
      console.error(`同步基金 ${fund.code} 估值失败:`, e)
    }

    // 如果不是最后一个，则暂停 2000ms ~ 3000ms，大幅降低服务端频率
    if (index < fundsList.length - 1) {
      await sleep(2000 + Math.random() * 1000)
    }
  }

  return { total: fundsList.length, success: successCount, failed: failedCount }
}

/**
 * 同步所有基金的最新估值 (全量)
 */
export async function syncAllFundsEstimates() {
  const db = useDb()
  const allFunds = await db.query.funds.findMany()
  return await syncFundsList(allFunds)
}

/**
 * 同步指定用户的基金最新估值 (用户级)
 */
export async function syncUserFundsEstimates(userId: number) {
  const db = useDb()
  const userHoldings = await db.query.holdings.findMany({
    where: eq(holdings.userId, userId),
    with: {
      fund: true,
    },
  })

  // 提取基金列表并去重
  const uniqueFundsMap = new Map<string, typeof funds.$inferSelect>()
  userHoldings.forEach((h) => {
    if (h.fund)
      uniqueFundsMap.set(h.fund.code, h.fund)
  })

  const fundsList = [...uniqueFundsMap.values()]
  return await syncFundsList(fundsList)
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

/** Python 接口 /funds/{code}/fee 的返回结构(关键字段,中文 key) */
interface FundFeeResponse {
  operation_fees?: { 管理费率?: string, 托管费率?: string }
  purchase_fee_rate?: { 适用区间?: string, 费率?: string }[]
  redemption_fee_rate?: { 适用区间?: string, 费率?: string }[]
}

/**
 * 获取并保存单只基金的费率信息(仅前端展示用)。
 * 调用 Python 接口的轻量费率端点 /funds/{code}/fee(~1KB,远快于 /fund/info)。
 * @returns 是否成功获取并写入
 */
export async function fetchAndSaveFundFees(code: string): Promise<boolean> {
  const config = useRuntimeConfig()
  const db = useDb()

  const data = await $fetch<FundFeeResponse>(`${config.strategyApiUrl}/funds/${code}/fee`)

  // 映射到 fundFees 表结构(中文 key → 英文字段)
  const purchaseFee = data.purchase_fee_rate?.[0]?.费率 ?? null
  const redemptionFees = (data.redemption_fee_rate || []).map(r => ({
    holdingPeriod: r.适用区间 ?? '',
    rate: r.费率 ?? '',
  }))
  const managementFee = data.operation_fees?.管理费率 ?? null
  const custodyFee = data.operation_fees?.托管费率 ?? null

  // 无任何有效费率数据则跳过
  if (!purchaseFee && redemptionFees.length === 0 && !managementFee && !custodyFee)
    return false

  await db.insert(fundFees).values({
    fundCode: code,
    purchaseFee,
    redemptionFees: redemptionFees.length > 0 ? redemptionFees : null,
    managementFee,
    custodyFee,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: fundFees.fundCode,
    set: {
      purchaseFee,
      redemptionFees: redemptionFees.length > 0 ? redemptionFees : null,
      managementFee,
      custodyFee,
      updatedAt: new Date(),
    },
  })

  return true
}

/**
 * 批量补全所有缺失费率的基金(供 admin 手动触发,一次性补全历史数据)。
 * 仅处理 fundFees 表中尚无记录的基金,串行调用避免压垮 Python 服务。
 */
export async function syncAllFundFees(): Promise<{ total: number, success: number, failed: number, skipped: number }> {
  const db = useDb()

  // 查询所有已有费率记录的基金代码
  const existingFees = await db.query.fundFees.findMany()
  const existingCodes = new Set(existingFees.map(f => f.fundCode))

  // 查询所有基金,筛选出缺费率的
  const allFunds = await db.query.funds.findMany()
  const missingFunds = allFunds.filter(f => !existingCodes.has(f.code))

  if (missingFunds.length === 0) {
    console.log('[FundFees] 所有基金费率数据均已存在,无需补全。')
    return { total: 0, success: 0, failed: 0, skipped: 0 }
  }

  console.log(`[FundFees] 开始为 ${missingFunds.length} 只缺失费率的基金补全数据...`)
  let success = 0
  let failed = 0
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  for (const [index, fund] of missingFunds.entries()) {
    try {
      const ok = await fetchAndSaveFundFees(fund.code)
      if (ok)
        success++
      else
        console.warn(`[FundFees] 基金 ${fund.code} 无有效费率数据,跳过`)
    }
    catch (e) {
      failed++
      console.error(`[FundFees] 获取基金 ${fund.code} 费率失败:`, e)
    }

    // 串行间隔 500ms,避免压垮 Python 服务
    if (index < missingFunds.length - 1)
      await sleep(500)
  }

  console.log(`[FundFees] 补全完成:成功 ${success},失败 ${failed},共 ${missingFunds.length} 只`)
  return { total: missingFunds.length, success, failed, skipped: 0 }
}
