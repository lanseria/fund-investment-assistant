// server/utils/selfEstimateService.ts

import type { StockRealtimeQuote } from '~~/server/utils/dataFetcher'
import type { FundStockHoldingRow } from '~~/server/utils/stockHoldingService'
import BigNumber from 'bignumber.js'
import { eq } from 'drizzle-orm'
import { funds } from '~~/server/database/schemas'
import { fetchStocksRealtime } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { getAllFundStockHoldings } from '~~/server/utils/stockHoldingService'

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
  /** 有重仓持仓、参与自算的基金数 */
  total: number
  /** 成功写入自算估值的基金数 */
  success: number
  /** 行情可用但计算不成立(如全部重仓无行情)的基金数 */
  failed: number
  /** 因行情接口不可用整体跳过的基金数 */
  skipped: number
  /** 本次去重后的股票总数 */
  stockCount: number
}

/**
 * 盘中同步所有基金的自算估值(重仓股行情加权)。
 *
 * 只处理开放式基金(fundType='open')且有重仓持仓数据的基金;
 * 场内/LOF (qdii_lof) 走场内价格,QDII 重仓多为港美股,均不参与。
 * 全市场重仓股代码去重后分批取行情,多基金重叠持仓只请求一次。
 */
export async function syncAllFundsSelfEstimates(): Promise<SelfEstimateSyncResult> {
  const db = useDb()
  const allFunds = await db.query.funds.findMany()
  const holdingsByFund = await getAllFundStockHoldings()

  const targets = allFunds.filter(
    f => f.fundType === 'open' && (holdingsByFund[f.code]?.length ?? 0) > 0,
  )

  if (targets.length === 0)
    return { total: 0, success: 0, failed: 0, skipped: 0, stockCount: 0 }

  // 全市场股票代码去重
  const allStockCodes = [...new Set(
    targets.flatMap(f => holdingsByFund[f.code]!.map(h => h.stockCode)),
  )]

  const quotes = await fetchStockQuotesMap(allStockCodes)
  if (quotes === null) {
    console.warn('[SelfEstimate] 股票行情不可用,本轮自算估值整体跳过。')
    return { total: targets.length, success: 0, failed: 0, skipped: targets.length, stockCount: allStockCodes.length }
  }

  let success = 0
  let failed = 0
  const quoteByCode = Object.fromEntries(quotes)
  for (const fund of targets) {
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

  return { total: targets.length, success, failed, skipped: 0, stockCount: allStockCodes.length }
}
