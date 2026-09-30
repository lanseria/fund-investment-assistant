// server/utils/selfEstimateService.ts

import type { GoldRealtimeQuote, StockRealtimeQuote } from '~~/server/utils/dataFetcher'
import type { FundStockHoldingRow } from '~~/server/utils/stockHoldingService'
import BigNumber from 'bignumber.js'
import { eq } from 'drizzle-orm'
import { funds, holdings } from '~~/server/database/schemas'
import { fetchFundLofPrice, fetchFundOfficialEstimateFallback, fetchGoldRealtime, fetchStocksRealtime } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { getAllFundStockHoldings } from '~~/server/utils/stockHoldingService'
import { isGoldPriceFund } from '~~/shared/fund'

/** 单只基金的估值计算结果 */
export interface SelfEstimateResult {
  /** 加权归一化涨跌幅 (%) */
  changePct: number
  /** 估算净值 = 昨净 × (1 + 涨跌幅/100),4 位小数 */
  nav: number
  /** 前十大重仓合计占净值比例 (%),即持仓对净值的覆盖率 */
  coverage: number
}

/**
 * 纯函数:按重仓股占比加权计算基金盘中估值。
 *
 * 公式:涨跌幅 = Σ(占比ᵢ × 涨跌幅ᵢ) / Σ占比ᵢ,仅统计有行情的股票
 * (缺行情/停牌的剔除权重后归一化,假设未覆盖部分与已覆盖部分同步波动)。
 * 净值 = 昨净 × (1 + 涨跌幅/100),4 位小数。
 *
 * @returns 昨净非法、无持仓或全部股票无行情时返回 null(本轮跳过,不动旧值)
 */
export function calcSelfEstimate(
  yesterdayNav: string | number,
  stockHoldings: FundStockHoldingRow[],
  quoteByCode: Record<string, StockRealtimeQuote>,
): SelfEstimateResult | null {
  const navBase = new BigNumber(yesterdayNav)
  if (!navBase.isGreaterThan(0))
    return null
  if (stockHoldings.length === 0)
    return null

  let weighted = new BigNumber(0) // Σ(占比 × 涨跌幅),仅统计有行情的股票
  let pctSum = new BigNumber(0) // Σ占比(有行情的)
  let coverage = new BigNumber(0) // Σ占比(全部持仓,即前十大覆盖率)

  for (const holding of stockHoldings) {
    const pct = new BigNumber(holding.pct)
    coverage = coverage.plus(pct)
    const quote = quoteByCode[holding.stockCode]
    if (!quote || quote.changePct == null)
      continue
    weighted = weighted.plus(pct.times(quote.changePct))
    pctSum = pctSum.plus(pct)
  }

  if (pctSum.isLessThanOrEqualTo(0))
    return null

  const changePct = weighted.dividedBy(pctSum)
  const nav = navBase.times(new BigNumber(1).plus(changePct.dividedBy(100)))

  return {
    changePct: Number(changePct.toFixed(4)),
    nav: Number(nav.toFixed(4)),
    coverage: Number(coverage.toFixed(2)),
  }
}

/** 单批请求的股票数量上限(与 Python 端 200 上限内保持保守分批) */
const QUOTE_CHUNK_SIZE = 60
/** 批间延时(ms),避免请求过密 */
const QUOTE_CHUNK_DELAY = 200

/** 金价自算用的贵金属代码(SGE Au99.99 现货,黄金 ETF 及其联接基金的主流跟踪标的) */
export const GOLD_PRICE_CODE = 'AU9999'

/**
 * 纯函数:按国内金价(SGE Au99.99)涨跌幅估算黄金类基金净值。
 *
 * 黄金 ETF 联接基金 ≥90% 投资目标 ETF、ETF 几乎满仓黄金现货,
 * 金价当日涨跌幅近似基金净值涨跌幅(运作费率摩擦约 0.5%/年,盘中
 * 估算可忽略)。coverage 固定 100(金价覆盖全部净值)。
 *
 * @returns 昨净非法或金价无涨跌幅(未开盘/接口无数据)时返回 null(本轮跳过,不动旧值)
 */
export function calcGoldEstimate(
  yesterdayNav: string | number,
  goldQuote: Pick<GoldRealtimeQuote, 'changePct'>,
): SelfEstimateResult | null {
  const navBase = new BigNumber(yesterdayNav)
  if (!navBase.isGreaterThan(0))
    return null
  if (goldQuote.changePct == null)
    return null

  const changePct = new BigNumber(goldQuote.changePct)
  const nav = navBase.times(new BigNumber(1).plus(changePct.dividedBy(100)))

  return {
    changePct: Number(changePct.toFixed(4)),
    nav: Number(nav.toFixed(4)),
    coverage: 100,
  }
}

/**
 * 将估算结果写入 funds 表的主估值字段
 * (percentageChange / todayEstimateNav / todayEstimateUpdateTime)。
 */
async function applyEstimate(
  fundCode: string,
  result: SelfEstimateResult,
  options?: { preserveEstimateUpdateTime?: boolean, updateTime?: Date },
) {
  const db = useDb()
  const updates: Partial<typeof funds.$inferInsert> = {
    percentageChange: result.changePct,
    todayEstimateNav: result.nav,
  }
  if (!options?.preserveEstimateUpdateTime)
    updates.todayEstimateUpdateTime = options?.updateTime ?? new Date()
  await db.update(funds).set(updates).where(eq(funds.code, fundCode))
}

/**
 * 官方估算兜底:按东财盘中官方估算写主估值字段。
 *
 * 供自算不成立/无法自算的基金使用,保证每只基金都有盘中估值展示。
 *
 * @returns 是否成功写入(基金不在盘中估值列表/行情不可用为 false)
 */
async function applyOfficialEstimateFallback(
  fundCode: string,
  yesterdayNav: string | number,
  options?: { preserveEstimateUpdateTime?: boolean },
): Promise<boolean> {
  const official = await fetchFundOfficialEstimateFallback(fundCode)
  const pct = official ? Number.parseFloat(official.percentageChange) : Number.NaN
  const officialNav = official ? Number.parseFloat(official.estimateNav) : Number.NaN
  const navBase = new BigNumber(yesterdayNav)
  if (!official || (!Number.isFinite(pct) && !Number.isFinite(officialNav)) || !navBase.isGreaterThan(0))
    return false

  // 优先用官方估算净值;缺失时按官方涨跌幅套昨净
  let nav: number
  if (Number.isFinite(officialNav) && officialNav > 0) {
    nav = officialNav
  }
  else if (Number.isFinite(pct)) {
    nav = Number(navBase.times(new BigNumber(1).plus(new BigNumber(pct).dividedBy(100))).toFixed(4))
  }
  else {
    return false
  }

  await applyEstimate(fundCode, {
    changePct: Number.isFinite(pct) ? Number(new BigNumber(pct).toFixed(4)) : 0,
    nav,
    coverage: 100,
  }, {
    preserveEstimateUpdateTime: options?.preserveEstimateUpdateTime,
    updateTime: official.updateTime ? new Date(official.updateTime) : undefined,
  })
  return true
}

/**
 * 分批拉取全部股票行情并汇总为 Map。
 * 任一批失败(接口不可用/服务宕机)返回 null,调用方整体跳过本轮。
 */
async function fetchStockQuotesMap(codes: string[]): Promise<Map<string, StockRealtimeQuote> | null> {
  const map = new Map<string, StockRealtimeQuote>()
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK_SIZE) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK_SIZE)
    const stocks = await fetchStocksRealtime(chunk)
    if (stocks === null)
      return null
    for (const stock of stocks)
      map.set(stock.code, stock)
    if (i + QUOTE_CHUNK_SIZE < codes.length)
      await new Promise(resolve => setTimeout(resolve, QUOTE_CHUNK_DELAY))
  }
  return map
}

/** 估值同步任务的统计结果 */
export interface SelfEstimateSyncResult {
  /** 有重仓持仓、参与重仓股自算的基金数 */
  total: number
  /** 成功写入估值的基金数 */
  success: number
  /** 行情可用但计算不成立(如全部重仓无行情)的基金数 */
  failed: number
  /** 因行情接口不可用整体跳过的基金数 */
  skipped: number
  /** 本次去重后的股票总数 */
  stockCount: number
  /** 参与金价自算的黄金类基金数 */
  goldCount: number
  /** 参与场内价格自算的场内/LOF 基金数 */
  lofCount: number
}

/**
 * 盘中同步所有基金的估值(写主估值字段,全站唯一估值来源)。
 *
 * 分三类标的自算:
 * - 重仓股加权(fundType='open' 且有季报重仓持仓):A 股(6 位代码)与港股
 *   (5 位代码,如 00700)按占比加权,港股通/恒生科技类基金自 2026-09 起参与
 *   自算;美股等仍不支持,缺行情时按缺失权重剔除。场内/LOF (qdii_lof) 走场内
 *   价格,不参与。
 * - 金价自算(fundType='open' 且无重仓持仓、名称含「黄金/上海金」):黄金 ETF
 *   联接等被动跟踪国内金价的基金自 2026-09 起参与自算,按 SGE Au99.99 涨跌幅
 *   套用昨净;SGE 日市(9:00-15:30)与 A 股重叠,现有 cron 窗口无需调整。
 * - 场内价格(fundType='qdii_lof'):按场内实时价涨跌幅套用昨净(原官方同步
 *   对该类基金即走场内价格,口径不变)。
 *
 * 官方估算兜底:无法自算的基金(不在上述三类的场外基金,如 QDII 场外/纯债/
 * 货基)与自算不成立的基金(全部重仓停牌/金价无行情/场内价缺失),回退东财
 * 盘中官方估算,保证每只基金都有盘中估值展示。
 *
 * 全市场重仓股代码去重后分批取行情,多基金重叠持仓只请求一次;金价全市场共用
 * 一个 Au9999 报价。
 */
export async function syncAllFundsSelfEstimates(): Promise<SelfEstimateSyncResult> {
  const db = useDb()
  const allFunds = await db.query.funds.findMany()
  const holdingsByFund = await getAllFundStockHoldings()

  const stockTargets = allFunds.filter(
    f => f.fundType === 'open' && (holdingsByFund[f.code]?.length ?? 0) > 0,
  )
  const goldTargets = allFunds.filter(
    f => f.fundType === 'open' && (holdingsByFund[f.code]?.length ?? 0) === 0 && isGoldPriceFund(f.name),
  )
  const lofTargets = allFunds.filter(f => f.fundType === 'qdii_lof')
  const total = stockTargets.length + goldTargets.length + lofTargets.length
  if (total === 0)
    return { total: 0, success: 0, failed: 0, skipped: 0, stockCount: 0, goldCount: 0, lofCount: 0 }

  let success = 0
  let failed = 0
  let skipped = 0
  /** 自算不成立/无法自算,需走官方估算兜底的基金 */
  const fallbackCodes: string[] = []

  // --- 重仓股加权自算(A 股/港股) ---
  const allStockCodes = [...new Set(
    stockTargets.flatMap(f => holdingsByFund[f.code]!.map(h => h.stockCode)),
  )]

  const quotes = stockTargets.length > 0 ? await fetchStockQuotesMap(allStockCodes) : null
  if (quotes === null) {
    // stockTargets 为空时本就不走重仓股分支,无需告警
    if (stockTargets.length > 0) {
      console.warn('[SelfEstimate] 股票行情不可用,本轮重仓股自算整体跳过。')
      skipped += stockTargets.length
    }
  }
  else {
    const quoteByCode = Object.fromEntries(quotes)
    for (const fund of stockTargets) {
      const result = calcSelfEstimate(fund.yesterdayNav, holdingsByFund[fund.code]!, quoteByCode)
      if (result === null) {
        // 自算不成立(如全部重仓停牌),记录后统一走官方估算兜底
        fallbackCodes.push(fund.code)
        continue
      }
      try {
        await applyEstimate(fund.code, result)
        success++
      }
      catch (e) {
        console.error(`[SelfEstimate] 基金 ${fund.code} 自算估值写库失败:`, e)
        failed++
      }
    }
  }

  // --- 金价自算(黄金 ETF 联接等) ---
  const goldQuotes = goldTargets.length > 0 ? await fetchGoldRealtime([GOLD_PRICE_CODE]) : null
  const goldQuote = goldQuotes?.find(q => q.code === GOLD_PRICE_CODE) ?? null
  if (goldTargets.length > 0 && goldQuote === null) {
    console.warn('[SelfEstimate] 金价行情不可用,本轮黄金基金自算整体跳过。')
    skipped += goldTargets.length
  }
  else {
    for (const fund of goldTargets) {
      const result = calcGoldEstimate(fund.yesterdayNav, goldQuote!)
      if (result === null) {
        fallbackCodes.push(fund.code)
        continue
      }
      try {
        await applyEstimate(fund.code, result)
        success++
      }
      catch (e) {
        console.error(`[SelfEstimate] 基金 ${fund.code} 金价自算写库失败:`, e)
        failed++
      }
    }
  }

  // --- 场内价格自算(QDII/LOF,腾讯实时价,串行 + 间隔防限流) ---
  for (const [index, fund] of lofTargets.entries()) {
    const lof = await fetchFundLofPrice(fund.code)
    const pct = lof ? Number.parseFloat(lof.percentageChange) : Number.NaN
    const navBase = new BigNumber(fund.yesterdayNav)
    if (!lof || !Number.isFinite(pct) || !navBase.isGreaterThan(0)) {
      fallbackCodes.push(fund.code)
      continue
    }
    const nav = navBase.times(new BigNumber(1).plus(new BigNumber(pct).dividedBy(100)))
    try {
      await applyEstimate(fund.code, {
        changePct: Number(new BigNumber(pct).toFixed(4)),
        nav: Number(nav.toFixed(4)),
        coverage: 100,
      }, { updateTime: new Date(lof.updateTime) })
      success++
    }
    catch (e) {
      console.error(`[SelfEstimate] 基金 ${fund.code} 场内价格自算写库失败:`, e)
      failed++
    }
    if (index < lofTargets.length - 1)
      await new Promise(resolve => setTimeout(resolve, QUOTE_CHUNK_DELAY))
  }

  // --- 官方估算兜底 ---
  // 自算不成立/无法自算的基金(无重仓非黄金的场外基金、QDII 场外、纯债/货基、
  // 全部重仓停牌等),回退东财盘中官方估算,保证每只基金都有盘中估值展示。
  const unCovered = allFunds.filter(
    f => !stockTargets.includes(f) && !goldTargets.includes(f) && !lofTargets.includes(f),
  )
  const fallbackTargets = [...new Set([...fallbackCodes, ...unCovered.map(f => f.code)])]
  if (fallbackTargets.length > 0)
    console.warn(`[SelfEstimate] ${fallbackTargets.length} 只基金自算不可用,走官方估算兜底:`, fallbackTargets.slice(0, 20).join(','))
  for (const [index, code] of fallbackTargets.entries()) {
    const fund = allFunds.find(f => f.code === code)
    if (!fund)
      continue
    try {
      const ok = await applyOfficialEstimateFallback(code, fund.yesterdayNav)
      if (ok)
        success++
      else
        failed++
    }
    catch (e) {
      console.error(`[SelfEstimate] 基金 ${code} 官方估算兜底失败:`, e)
      failed++
    }
    // 串行间隔防限流(与重仓股同步节奏一致)
    if (index < fallbackTargets.length - 1)
      await new Promise(resolve => setTimeout(resolve, QUOTE_CHUNK_DELAY))
  }

  return { total, success, failed, skipped, stockCount: allStockCodes.length, goldCount: goldTargets.length, lofCount: lofTargets.length }
}

/**
 * 同步单只基金的估值(自算,写主估值字段)。
 *
 * 按基金类型选择口径:
 * - qdii_lof: 场内实时价涨跌幅(腾讯行情)
 * - open + 有重仓持仓: 重仓股行情加权
 * - open + 无重仓 + 黄金类: 金价 Au9999 涨跌幅
 * - 自算不成立/无法自算的基金: 官方估算兜底(东财盘中估值)
 *
 * @param code 基金代码
 * @param options 可选配置
 * @param options.preserveEstimateUpdateTime 保留 todayEstimateUpdateTime 不写入。
 *   该字段表示"当日盘中估值"的更新时间(供 isEstimateFresh 等新鲜度判断),
 *   交易确认等场景刷新估值时应开启,避免开盘前的刷新被误判为当日估值已更新。
 * @returns 是否成功写入估值(基金不存在/全部估值源不可用为 false)
 */
export async function syncSingleFundSelfEstimate(
  code: string,
  options?: { preserveEstimateUpdateTime?: boolean },
): Promise<boolean> {
  const db = useDb()
  const fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })
  if (!fund) {
    console.warn(`同步估值失败：未在数据库中找到基金 ${code}。`)
    return false
  }

  // 场内/LOF:场内实时价涨跌幅
  if (fund.fundType === 'qdii_lof') {
    const lof = await fetchFundLofPrice(code)
    const pct = lof ? Number.parseFloat(lof.percentageChange) : Number.NaN
    const navBase = new BigNumber(fund.yesterdayNav)
    if (!lof || !Number.isFinite(pct) || !navBase.isGreaterThan(0))
      // 场内价不可用时兜底官方估算
      return applyOfficialEstimateFallback(code, fund.yesterdayNav, options)
    const nav = navBase.times(new BigNumber(1).plus(new BigNumber(pct).dividedBy(100)))
    await applyEstimate(code, {
      changePct: Number(new BigNumber(pct).toFixed(4)),
      nav: Number(nav.toFixed(4)),
      coverage: 100,
    }, { preserveEstimateUpdateTime: options?.preserveEstimateUpdateTime, updateTime: new Date(lof.updateTime) })
    return true
  }

  const stockHoldings = (await getAllFundStockHoldings())[code] ?? []

  // 无重仓的黄金类基金:金价自算;非黄金类(纯债/货基/QDII 场外等)走官方估算兜底
  if (stockHoldings.length === 0) {
    if (!isGoldPriceFund(fund.name))
      return applyOfficialEstimateFallback(code, fund.yesterdayNav, options)
    const quotes = await fetchGoldRealtime([GOLD_PRICE_CODE])
    const goldQuote = quotes?.find(q => q.code === GOLD_PRICE_CODE)
    if (!goldQuote)
      return applyOfficialEstimateFallback(code, fund.yesterdayNav, options)
    const result = calcGoldEstimate(fund.yesterdayNav, goldQuote)
    if (!result)
      return applyOfficialEstimateFallback(code, fund.yesterdayNav, options)
    await applyEstimate(code, result, options)
    return true
  }

  // 重仓股行情加权;自算不成立(如全部重仓停牌/行情不可用)时兜底官方估算
  const quotes = await fetchStocksRealtime(stockHoldings.map(h => h.stockCode))
  const result = quotes === null
    ? null
    : calcSelfEstimate(
        fund.yesterdayNav,
        stockHoldings,
        Object.fromEntries(quotes.map(q => [q.code, q])),
      )
  if (!result)
    return applyOfficialEstimateFallback(code, fund.yesterdayNav, options)
  await applyEstimate(code, result, options)
  return true
}

/**
 * 同步指定用户的基金估值 (用户级,供手动刷新)。
 */
export async function syncUserFundsSelfEstimates(userId: number): Promise<{ total: number, success: number, failed: number }> {
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

  let success = 0
  let failed = 0
  for (const fund of uniqueFundsMap.values()) {
    try {
      const ok = await syncSingleFundSelfEstimate(fund.code)
      if (ok)
        success++
      else
        failed++
    }
    catch (e) {
      failed++
      console.error(`同步基金 ${fund.code} 估值失败:`, e)
    }
  }
  return { total: uniqueFundsMap.size, success, failed }
}
