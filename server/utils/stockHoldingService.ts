// server/utils/stockHoldingService.ts

import type { StockRealtimeQuote } from '~~/server/utils/dataFetcher'
import { eq } from 'drizzle-orm'
import { fundStockHoldings } from '~~/server/database/schemas'
import { fetchFundRealtimeRaw } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { fetchFundTopHoldings } from '~~/server/utils/fundEstimateSource'

/** fund_stock_holdings 表的单行(不含外键冗余字段) */
export interface FundStockHoldingRow {
  stockCode: string
  stockName: string
  /** 占净值比例 (%) */
  pct: number
  /** 持仓报告期 (yyyy-mm-dd, 季报口径) */
  reportDate: string
}

/** powercloud holdings 条目中关注的字段(其余字段忽略) */
interface PowercloudStockHolding {
  code?: unknown
  name?: unknown
  pct?: unknown
  [key: string]: unknown
}

/** 报告期格式校验(yyyy-mm-dd) */
const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** 股票代码格式校验:A 股 6 位数字;港股 5 位数字(如 00700 腾讯、01810 小米) */
const STOCK_CODE_RE = /^\d{5,6}$/

/**
 * 解析 powercloud 的占净值比例字符串(如 "17.28%")为数值(17.28)。
 * 非法/非正值返回 null(该条目跳过)。
 */
export function parseHoldingPct(raw: unknown): number | null {
  if (raw == null)
    return null
  const s = String(raw).trim().replace('%', '')
  if (!s)
    return null
  const n = Number.parseFloat(s)
  return Number.isFinite(n) && n > 0
    ? n
    : null
}

/**
 * 从 /fund/realtime 原始响应中提取合法的重仓股列表。
 * 过滤掉代码格式非法(A 股 6 位/港股 5 位以外的,如美股字母代码)
 * 或占净值比例无效的条目。
 */
export function extractStockHoldings(holdings: PowercloudStockHolding[] | null | undefined): FundStockHoldingRow[] {
  if (!Array.isArray(holdings))
    return []
  const rows: FundStockHoldingRow[] = []
  for (const h of holdings) {
    const stockCode = String(h?.code ?? '').trim()
    const stockName = String(h?.name ?? '').trim()
    const pct = parseHoldingPct(h?.pct)
    if (!STOCK_CODE_RE.test(stockCode) || !stockName || pct == null)
      continue
    rows.push({
      stockCode,
      stockName,
      pct,
      reportDate: '',
    })
  }
  return rows
}

/**
 * 同步单只基金的重仓股持仓明细(季报口径)到 fund_stock_holdings 表。
 *
 * 数据源按顺序尝试:
 * 1. Python 服务 /fund/realtime/{code} 的 holdings 字段(底层 powercloud 聚合接口)
 * 2. 天天基金 F10 `FundArchivesDatas.aspx?type=jjcc`(公开网页接口,powercloud
 *    整站宕机时的备用源;2026-11 powercloud 返回 521 后新增)
 *
 * 新报告期数据整体覆盖旧数据(事务内先删后插,天然处理重仓股调出前十的情况)。
 *
 * - 基金无股票持仓(纯债/货币/联接基金)或上游确认无数据: 清空该基金已有行,返回 synced=0
 * - 两个数据源都不可用: 抛出错误,由调用方决定降级策略(不用空数据覆盖已有持仓)
 *
 * @returns { synced, reportDate, source } synced 为写入条数,reportDate 为报告期,
 *          source 为实际生效的数据源(none 表示该基金确无股票持仓)
 */
export async function syncFundStockHoldings(
  code: string,
): Promise<{ synced: number, reportDate: string | null, source: 'powercloud' | 'f10' | 'none' }> {
  const primary = await trySyncFromPowercloud(code)
  if (primary !== null) {
    return {
      ...primary,
      source: primary.synced > 0
        ? 'powercloud'
        : 'none',
    }
  }

  // powercloud 不可用(上游宕机/接口未部署):降级到天天基金 F10
  console.warn(`[StockHoldings] 基金 ${code} powercloud 重仓股不可用,改用天天基金 F10。`)
  const f10 = await fetchFundTopHoldings(code)
  if (f10 === null)
    throw new Error(`基金 ${code} 重仓股数据源不可用(powercloud 与 F10 均失败)`)

  if (f10.holdings.length === 0 || !f10.reportDate) {
    await dbDeleteFundHoldings(code)
    return { synced: 0, reportDate: f10.reportDate, source: 'none' }
  }

  const reportDate = f10.reportDate
  await dbReplaceFundHoldings(code, f10.holdings.map(h => ({ ...h, reportDate })))
  return { synced: f10.holdings.length, reportDate, source: 'f10' }
}

/**
 * 从 powercloud 同步重仓股;上游不可用时返回 null(交由调用方降级),不抛错。
 */
async function trySyncFromPowercloud(code: string): Promise<{ synced: number, reportDate: string | null } | null> {
  let raw
  try {
    raw = await fetchFundRealtimeRaw(code)
  }
  catch (error: any) {
    // 上游 5xx/网络错误/4xx 一律视为「本数据源不可用」,返回 null 触发 F10 降级;
    // 基金是否真的不存在由 F10 给出最终答复
    console.warn(`[StockHoldings] 基金 ${code} powercloud 请求失败:`, error?.message || error)
    return null
  }

  const reportDate = String(raw.holdingsDate ?? '').trim()
  const stocks = extractStockHoldings(raw.holdings)

  // 上游无有效持仓或报告期非法(如债基/货基、数据源异常): 清空旧数据,避免自算用了过期持仓
  if (stocks.length === 0 || !REPORT_DATE_RE.test(reportDate)) {
    await dbDeleteFundHoldings(code)
    return {
      synced: 0,
      reportDate: REPORT_DATE_RE.test(reportDate)
        ? reportDate
        : null,
    }
  }

  await dbReplaceFundHoldings(code, stocks.map(s => ({ ...s, reportDate })))
  return { synced: stocks.length, reportDate }
}

/** 事务内清空该基金的重仓股行 */
async function dbDeleteFundHoldings(code: string) {
  const db = useDb()
  await db.transaction(async (tx) => {
    await tx.delete(fundStockHoldings).where(eq(fundStockHoldings.fundCode, code))
  })
}

/** 事务内用新报告期数据整体覆盖该基金的重仓股行 */
async function dbReplaceFundHoldings(
  code: string,
  rows: { stockCode: string, stockName: string, pct: number, reportDate: string }[],
) {
  const db = useDb()
  await db.transaction(async (tx) => {
    await tx.delete(fundStockHoldings).where(eq(fundStockHoldings.fundCode, code))
    await tx.insert(fundStockHoldings).values(
      rows.map(s => ({
        fundCode: code,
        stockCode: s.stockCode,
        stockName: s.stockName,
        pct: s.pct,
        reportDate: s.reportDate,
      })),
    )
  })
}

/**
 * 给持仓行补全最新行情快照(供详情页重仓股面板展示)。
 *
 * quotes 为 null/undefined(行情接口不可用)或某只股票无行情时,
 * 该行的 price/changePct/quoteDate/quoteTime 置 null,持仓列表本身仍可用。
 */
export function enrichStocksWithQuotes(
  rows: FundStockHoldingRow[],
  quotes: StockRealtimeQuote[] | null | undefined,
): {
  stockCode: string
  stockName: string
  pct: number
  price: number | null
  changePct: number | null
  quoteDate: string | null
  quoteTime: string | null
}[] {
  const quoteByCode = new Map((quotes ?? []).map(q => [q.code, q]))
  return rows.map((row) => {
    const quote = quoteByCode.get(row.stockCode)
    return {
      stockCode: row.stockCode,
      stockName: row.stockName,
      pct: row.pct,
      price: quote?.price ?? null,
      changePct: quote?.changePct ?? null,
      quoteDate: quote?.date ?? null,
      quoteTime: quote?.time ?? null,
    }
  })
}

/**
 * 读取全表重仓股持仓,按基金代码分组。
 * 供自算估值任务一次性取数(避免逐基金查询)。
 *
 * @returns Record<fundCode, rows[]>,只包含有持仓数据的基金
 */
export async function getAllFundStockHoldings(): Promise<Record<string, FundStockHoldingRow[]>> {
  const db = useDb()
  const rows = await db.query.fundStockHoldings.findMany()
  const grouped: Record<string, FundStockHoldingRow[]> = {}
  for (const row of rows) {
    (grouped[row.fundCode] ??= []).push({
      stockCode: row.stockCode,
      stockName: row.stockName,
      pct: row.pct,
      reportDate: row.reportDate,
    })
  }
  return grouped
}
