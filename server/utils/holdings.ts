/* eslint-disable no-console */
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { holdings, navHistory } from '~~/server/database/schemas'
import { fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'
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

  // Drizzle doesn't have a direct window function equivalent to pandas rolling.
  // We'll calculate it manually. It's efficient enough for typical history lengths.
  const data = records.map(r => ({ date: r.navDate, nav: Number(r.nav) })).reverse() // Sort ascending for MA calc

  for (const ma of maOptions) {
    if (ma > 0 && data.length >= ma) {
      for (let i = ma - 1; i < data.length; i++) {
        const sum = data.slice(i - ma + 1, i + 1).reduce((acc, val) => acc + val.nav, 0);
        (data[i] as any)[`ma${ma}`] = sum / ma
      }
    }
  }

  return data
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
