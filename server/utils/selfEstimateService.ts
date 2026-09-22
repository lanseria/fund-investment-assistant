// server/utils/selfEstimateService.ts

import type { GoldRealtimeQuote, StockRealtimeQuote } from '~~/server/utils/dataFetcher'
import type { FundStockHoldingRow } from '~~/server/utils/stockHoldingService'
import BigNumber from 'bignumber.js'
import { eq } from 'drizzle-orm'
import { funds } from '~~/server/database/schemas'
import { fetchGoldRealtime, fetchStocksRealtime } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { getAllFundStockHoldings } from '~~/server/utils/stockHoldingService'
import { isGoldPriceFund } from '~~/shared/fund'

/** 单只基金的自算估值结果 */
export interface SelfEstimateResult {
  /** 加权归一化涨跌幅 (%) */
  changePct: number
  /** 自算净值 = 昨净 × (1 + 涨跌幅/100),4 位小数 */
  nav: number
  /** 前十大重仓合计占净值比例 (%),即持仓对净值的覆盖率 */
  coverage: number
}

/**
 * 纯函数:按重仓股占比加权计算基金自算估值。
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

/** 自算估值任务的同步结果统计 */
export interface SelfEstimateSyncResult {
  /** 有重仓持仓、参与重仓股自算的基金数 */
  total: number
  /** 成功写入自算估值的基金数 */
  success: number
  /** 行情可用但计算不成立(如全部重仓无行情)的基金数 */
  failed: number
  /** 因行情接口不可用整体跳过的基金数 */
  skipped: number
  /** 本次去重后的股票总数 */
  stockCount: number
  /** 参与金价自算的黄金类基金数 */
  goldCount: number
}

/**
 * 盘中同步所有基金的自算估值。
 *
 * 分两类标的:
 * - 重仓股加权(fundType='open' 且有季报重仓持仓):A 股(6 位代码)与港股
 *   (5 位代码,如 00700)按占比加权,港股通/恒生科技类基金自 2026-09 起参与
 *   自算;美股等仍不支持,缺行情时按缺失权重剔除。场内/LOF (qdii_lof) 走场内
 *   价格,不参与。
 * - 金价自算(fundType='open' 且无重仓持仓、名称含「黄金/上海金」):黄金 ETF
 *   联接等被动跟踪国内金价的基金自 2026-09 起参与自算,按 SGE Au99.99 涨跌幅
 *   套用昨净;SGE 日市(9:00-15:30)与 A 股重叠,现有 cron 窗口无需调整。
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
  const total = stockTargets.length + goldTargets.length
  if (total === 0)
    return { total: 0, success: 0, failed: 0, skipped: 0, stockCount: 0, goldCount: 0 }

  let success = 0
  let failed = 0
  let skipped = 0

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
        failed++
        continue
      }
      try {
        await db.update(funds).set({
          selfEstimateNav: result.nav,
          selfPercentageChange: result.changePct,
          selfEstimateUpdateTime: new Date(),
        }).where(eq(funds.code, fund.code))
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
        failed++
        continue
      }
      try {
        await db.update(funds).set({
          selfEstimateNav: result.nav,
          selfPercentageChange: result.changePct,
          selfEstimateUpdateTime: new Date(),
        }).where(eq(funds.code, fund.code))
        success++
      }
      catch (e) {
        console.error(`[SelfEstimate] 基金 ${fund.code} 金价自算写库失败:`, e)
        failed++
      }
    }
  }

  return { total, success, failed, skipped, stockCount: allStockCodes.length, goldCount: goldTargets.length }
}
