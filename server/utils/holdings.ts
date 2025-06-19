/* eslint-disable no-console */
import BigNumber from 'bignumber.js'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { holdings, navHistory } from '~~/server/database/schemas'
import { fetchFundHistory } from '~~/server/utils/dataFetcher' // 确保 fetchFundHistory 已导入
import { useDb } from '~~/server/utils/db'

// 自定义错误类型
export class HoldingExistsError extends Error {
  constructor(code: string) {
    super(`基金代码 '${code}' 已存在。`)
    this.name = 'HoldingExistsError'
  }
}

export class HoldingNotFoundError extends Error {
  constructor(code: string) {
    super(`未找到基金代码为 '${code}' 的持仓记录。`)
    this.name = 'HoldingNotFoundError'
  }
}

interface HoldingCreateData {
  code: string
  name?: string
  holdingAmount: number
}

/**
 * 创建新的基金持仓
 */
export async function createNewHolding(data: HoldingCreateData) {
  const db = useDb()
  const existing = await db.query.holdings.findFirst({
    where: eq(holdings.code, data.code),
  })
  if (existing)
    throw new HoldingExistsError(data.code)

  const realtimeData = await fetchFundRealtimeEstimate(data.code)
  if (!realtimeData)
    throw new Error(`无法获取基金 ${data.code} 的实时信息。`)

  const finalName = data.name || realtimeData.name
  const yesterdayNav = Number(realtimeData.dwjz)
  if (Number.isNaN(yesterdayNav) || yesterdayNav <= 0)
    throw new Error(`无法为基金 ${data.code} 获取有效的初始净值。`)

  const shares = data.holdingAmount / yesterdayNav

  const newHolding = {
    code: data.code,
    name: finalName,
    shares: shares.toFixed(4),
    yesterdayNav: yesterdayNav.toFixed(4),
    holdingAmount: data.holdingAmount.toFixed(2),
    todayEstimateNav: Number(realtimeData.gsz) || null,
    todayEstimateAmount: (shares * Number(realtimeData.gsz)).toFixed(2) || null,
    percentageChange: Number(realtimeData.gszzl) || null,
    todayEstimateUpdateTime: new Date(realtimeData.gztime) || null,
  }

  const [result] = await db.insert(holdings).values(newHolding).returning()
  return result
}

/**
 * 更新持仓金额
 */
export async function updateHoldingAmount(code: string, newAmount: number) {
  const db = useDb()
  const holding = await db.query.holdings.findFirst({ where: eq(holdings.code, code) })
  if (!holding)
    throw new HoldingNotFoundError(code)

  const yesterdayNav = Number(holding.yesterdayNav)
  if (yesterdayNav <= 0)
    throw new Error(`基金 ${code} 的昨日净值为零或无效，无法重新计算份额。`)

  const newShares = newAmount / yesterdayNav

  // eslint-disable-next-line unused-imports/no-unused-vars
  const [updatedHolding] = await db.update(holdings)
    .set({
      holdingAmount: newAmount.toFixed(2),
      shares: newShares.toFixed(4),
    })
    .where(eq(holdings.code, code))
    .returning()

  // 顺便更新一下实时估值
  await syncSingleFundEstimate(code)

  return await db.query.holdings.findFirst({ where: eq(holdings.code, code) })
}

/**
 * 删除持仓
 */
export async function deleteHoldingByCode(code: string) {
  const db = useDb()
  const holding = await db.query.holdings.findFirst({ where: eq(holdings.code, code) })
  if (!holding)
    throw new HoldingNotFoundError(code)

  await db.delete(navHistory).where(eq(navHistory.code, code))
  await db.delete(holdings).where(eq(holdings.code, code))
}

/**
 * 获取带移动平均线的历史数据
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

  // [重要修改] 1. 将数据库中的字符串净值直接转换为 BigNumber 对象，以保持完整精度
  const data = records.map(r => ({
    date: r.navDate,
    nav: new BigNumber(r.nav), // 使用 new BigNumber()
  })).reverse() // 按日期升序排列，以便计算MA

  for (const ma of maOptions) {
    if (ma > 0 && data.length >= ma) {
      for (let i = ma - 1; i < data.length; i++) {
        // 截取计算 MA 所需的数据窗口
        const window = data.slice(i - ma + 1, i + 1)

        // [重要修改] 2. 使用 BigNumber.sum() 进行精确求和，或者使用 reduce + plus
        const sum = window.reduce(
          (acc, val) => acc.plus(val.nav), // 使用 .plus() 方法
          new BigNumber(0), // 初始值也是 BigNumber 对象
        )

        // [重要修改] 3. 使用 .dividedBy() 进行精确除法
        const movingAverage = sum.dividedBy(ma)

        // [重要修改] 4. 将计算结果（BigNumber对象）转换回普通数字，并赋给新属性
        // ECharts 等前端库需要的是普通数字
        ;(data[i] as any)[`ma${ma}`] = movingAverage.toNumber()
      }
    }
  }

  // [重要修改] 5. 在最终返回前，将所有 nav 从 BigNumber 对象转换回普通数字
  // 这样可以确保返回给前端的接口数据是纯净的、可直接使用的 JSON
  return data.map(point => ({
    ...point,
    nav: point.nav.toNumber(),
  }))
}

/**
 * 导出持仓数据
 */
export async function exportHoldingsData() {
  const db = useDb()
  const allHoldings = await db.select({ code: holdings.code, shares: holdings.shares }).from(holdings)
  return allHoldings
}

/**
 * 导入持仓数据
 */
export async function importHoldingsData(dataToImport: { code: string, shares: number }[], overwrite: boolean) {
  const db = useDb()
  if (overwrite) {
    await db.delete(navHistory)
    await db.delete(holdings)
  }

  let importedCount = 0
  let skippedCount = 0

  for (const item of dataToImport) {
    if (!item.code || item.shares === undefined) {
      skippedCount++
      continue
    }
    item.shares = Number(item.shares)

    if (!overwrite) {
      const existing = await db.query.holdings.findFirst({ where: eq(holdings.code, item.code) })
      if (existing) {
        skippedCount++
        continue
      }
    }

    const realtimeData = await fetchFundRealtimeEstimate(item.code)
    if (!realtimeData || Number(realtimeData.dwjz) <= 0) {
      skippedCount++
      continue
    }

    const nav = Number(realtimeData.dwjz)
    // console.warn('item: ', item)
    const newHolding = {
      code: item.code,
      name: realtimeData.name,
      shares: item.shares.toFixed(4),
      yesterdayNav: nav.toFixed(4),
      holdingAmount: (item.shares * nav).toFixed(2),
    }

    await db.insert(holdings).values(newHolding).onConflictDoNothing()
    importedCount++
  }
  return { imported: importedCount, skipped: skippedCount }
}

/**
 * 同步单个基金的最新估值
 */
export async function syncSingleFundEstimate(code: string) {
  const db = useDb()
  const holding = await db.query.holdings.findFirst({ where: eq(holdings.code, code) })
  if (!holding)
    return

  const realtimeData = await fetchFundRealtimeEstimate(code)
  if (realtimeData && realtimeData.gsz) {
    const estimateNav = Number(realtimeData.gsz)
    await db.update(holdings).set({
      todayEstimateNav: estimateNav,
      percentageChange: Number(realtimeData.gszzl),
      todayEstimateUpdateTime: new Date(realtimeData.gztime),
      todayEstimateAmount: (Number(holding.shares) * estimateNav).toFixed(2),
    }).where(eq(holdings.code, code))
  }
}

/**
 * [新增] 同步所有持仓基金的最新估值
 */
export async function syncAllHoldingsEstimates() {
  const db = useDb()
  const allHoldings = await db.query.holdings.findMany()

  if (allHoldings.length === 0)
    return { total: 0, success: 0, failed: 0 }

  // 使用 Promise.all 并发执行所有更新任务
  const results = await Promise.allSettled(
    allHoldings.map(holding => syncSingleFundEstimate(holding.code)),
  )

  const successCount = results.filter(r => r.status === 'fulfilled').length
  const failedCount = results.length - successCount

  console.log(`[Estimate Sync] Completed. Total: ${results.length}, Success: ${successCount}, Failed: ${failedCount}`)
  return { total: results.length, success: successCount, failed: failedCount }
}

/**
 * [新增] 同步单个基金的历史净值数据
 * @param code 基金代码
 * @returns 返回同步的记录数量
 */
export async function syncSingleFundHistory(code: string): Promise<number> {
  const db = useDb()
  const holding = await db.query.holdings.findFirst({ where: eq(holdings.code, code) })

  if (!holding)
    throw new HoldingNotFoundError(code)

  // 查找本地最新的历史记录
  const latestRecord = await db.query.navHistory.findFirst({
    where: eq(navHistory.code, code),
    orderBy: [desc(navHistory.navDate)],
  })

  // 从最新记录的后一天开始获取，如果没有记录则从头获取
  const startDate = latestRecord ? useDayjs()(latestRecord.navDate).add(1, 'day').format('YYYY-MM-DD') : undefined

  const historyData = await fetchFundHistory(code, startDate)
  if (!historyData.length)
    return 0 // 没有新数据需要同步

  const newRecords = historyData
    .map(r => ({
      code,
      navDate: r.FSRQ,
      nav: r.DWJZ,
    }))
    .filter(r => Number(r.nav) > 0)

  if (newRecords.length > 0) {
    await db.insert(navHistory).values(newRecords).onConflictDoNothing()

    // 更新持仓的最新净值和金额（以防万一）
    const latestNav = Number(newRecords[0]!.nav) // API返回是降序的
    const newAmount = Number(holding.shares) * latestNav

    await db.update(holdings).set({
      yesterdayNav: latestNav.toFixed(4),
      holdingAmount: newAmount.toFixed(2),
    }).where(eq(holdings.code, code))
  }

  return newRecords.length
}
