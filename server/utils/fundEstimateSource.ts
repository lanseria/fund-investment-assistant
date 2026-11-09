// server/utils/fundEstimateSource.ts

import type { F10HoldingsParsed } from '~~/shared/fundEstimate'
import { parseF10HoldingsPayload, resolveIndexSecid } from '~~/shared/fundEstimate'

/**
 * 盘中估值的公开网页数据源(天天基金 F10 + 东方财富行情)。
 *
 * 存在的理由:原先重仓股明细致力于 Python 服务 `/fund/realtime`(底层 powercloud
 * 聚合接口),官方估值兜底也走同一条链路。2026-11 起 powercloud 整站返回
 * Cloudflare 521(源站不可达),东财自家的 `fundgz` 亦下线,导致估值链路全断。
 * 这里补两条直连公开网页的备用源,均为无鉴权的公开接口:
 *
 * - 重仓股明细: `fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc`
 * - 基金跟踪指数 + 指数实时涨跌: `fundmobapi.eastmoney.com` + `push2.eastmoney.com`
 *
 * 与 hs300Penetration.ts 的处理口径一致:上游会静默限流(返回空响应),因此
 * 集中做「内存缓存 + 重试 + 调用方降级」,不在本层抛错给业务流程。
 */

/** 天天基金 F10 档案接口(返回 JS 脚本而非 JSON,须按文本读取) */
const F10_API = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx'
/** 东财基金基础信息接口(用于取跟踪指数代码 INDEXCODE) */
const FUND_BASIC_API = 'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation'
/** 东财指数日K接口(取最后一根即当日涨跌幅;push2 实时接口对服务端直连会断连) */
const EASTMONEY_KLINE_API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'

/** 上游请求超时:F10 偶发慢响应,低于 10s 容易误判失败 */
const REQUEST_TIMEOUT_MS = 15_000
/** 单次抓取最多尝试次数:限流时返回空响应,重试通常可恢复 */
const MAX_ATTEMPTS = 3
/** 重试退避等待(ms) */
const RETRY_DELAYS_MS = [400, 900]
/** 季报持仓变化慢,缓存 30 分钟足够,避免每 5 分钟的估值任务都打上游 */
const HOLDINGS_CACHE_TTL_MS = 30 * 60 * 1000
/** 跟踪指数是基金的静态属性,缓存 24 小时 */
const INDEX_INFO_CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** 指数逐个查询的间隔(ms),避免请求过密被限流 */
const INDEX_QUERY_DELAY_MS = 150

/** 简单的过期缓存(单进程内存;多实例部署时各自维护,TTL 内可接受) */
interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const holdingsCache = new Map<string, CacheEntry<F10HoldingsParsed | null>>()
const indexInfoCache = new Map<string, CacheEntry<FundIndexInfo | null>>()

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null | undefined {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt <= Date.now())
    return undefined
  return entry.value
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttl })
}

/**
 * 抓取单只基金的季报重仓股明细(天天基金 F10)。
 *
 * 上游限流时返回空响应正文,此时按「0 条记录」算失败并重试;3 次仍失败返回 null,
 * 由调用方决定是否沿用库中旧数据(避免用空数据覆盖已有的有效持仓)。
 *
 * @returns 解析结果;上游不可用/限流耗尽重试时为 null
 */
export async function fetchFundTopHoldings(code: string): Promise<F10HoldingsParsed | null> {
  const cached = readCache(holdingsCache, code)
  if (cached !== undefined)
    return cached

  let lastError: unknown = new Error(`基金 ${code} 重仓股抓取失败`)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1)
      await sleep(RETRY_DELAYS_MS[attempt - 2] ?? 900)
    try {
      const raw = await $fetch<string>(F10_API, {
        params: {
          type: 'jjcc',
          code,
          topline: 10,
          rt: Date.now(),
        },
        headers: {
          // 上游校验 Referer,缺失会返回空内容
          'Referer': `https://fundf10.eastmoney.com/ccmx_${code}.html`,
          'User-Agent': 'Mozilla/5.0',
        },
        // 响应是 JS 脚本而非 JSON,必须按文本读取
        responseType: 'text',
        timeout: REQUEST_TIMEOUT_MS,
      })
      const parsed = parseF10HoldingsPayload(raw)
      if (parsed !== null) {
        writeCache(holdingsCache, code, parsed, HOLDINGS_CACHE_TTL_MS)
        return parsed
      }
      lastError = new Error(`基金 ${code} 重仓股响应不是 F10 脚本`)
    }
    catch (error) {
      lastError = error
    }
  }

  console.warn(`[FundEstimateSource] 基金 ${code} 重仓股抓取失败:`, lastError instanceof Error
    ? lastError.message
    : lastError)
  // 失败结果只短暂缓存,避免同一轮任务里反复重试把上游打爆
  writeCache(holdingsCache, code, null, 60 * 1000)
  return null
}

/** 基金的跟踪指数信息 */
export interface FundIndexInfo {
  /** 指数代码(如 931719);非指数基金为 null */
  indexCode: string | null
  /** 指数名称(如 "中证电池主题指数") */
  indexName: string | null
}

/**
 * 查询基金跟踪的指数(东财基金基础信息 INDEXCODE / INDEXNAME)。
 *
 * 指数型/ETF 联接基金的季报几乎不持有股票(只持有目标 ETF),重仓股自算不成立,
 * 用跟踪指数的实时涨跌估算净值更贴近真实口径。
 *
 * @returns 非指数基金返回 `{ indexCode: null, indexName: null }`;上游不可用返回 null
 */
export async function fetchFundIndexInfo(code: string): Promise<FundIndexInfo | null> {
  const cached = readCache(indexInfoCache, code)
  if (cached !== undefined)
    return cached

  try {
    const data = await $fetch<{ Datas?: Record<string, unknown> }>(FUND_BASIC_API, {
      params: {
        FCODE: code,
        deviceid: '1',
        plat: 'Android',
        product: 'EFund',
        version: '6.2.8',
      },
      timeout: REQUEST_TIMEOUT_MS,
    })
    const raw = data?.Datas?.INDEXCODE
    const rawName = data?.Datas?.INDEXNAME
    const indexCode = typeof raw === 'string' && /^[0-9A-Z]{4,10}$/.test(raw.trim())
      ? raw.trim()
      : null
    const indexName = typeof rawName === 'string' && rawName.trim() && rawName.trim() !== '--'
      ? rawName.trim()
      : null
    const info: FundIndexInfo = { indexCode, indexName }
    writeCache(indexInfoCache, code, info, INDEX_INFO_CACHE_TTL_MS)
    return info
  }
  catch (error: any) {
    console.warn(`[FundEstimateSource] 基金 ${code} 跟踪指数查询失败:`, error?.message || error)
    writeCache(indexInfoCache, code, null, 60 * 1000)
    return null
  }
}

/** 指数实时行情快照 */
export interface IndexRealtimeQuote {
  /** 指数代码(不含 secid 前缀) */
  code: string
  name: string
  /** 当日涨跌幅(%) */
  changePct: number
}

/**
 * 批量查询指数当日涨跌幅(东财 push2his 日K,取最后一根)。
 *
 * 为何不用 push2 实时接口:`push2.eastmoney.com/api/qt/ulist.np` 从服务端(Node
 * 的 fetch/undici)直连会被对端直接断开(socket hang up),而 `push2his` 稳定可用。
 * 日K 最后一行的 `f53` 涨跌幅即当日盘中实时涨跌幅(收盘后为当日最终值),
 * 对盘中估值而言与实时接口等价。
 *
 * 逐个查询 + 短间隔,失败重试;仍拿不到的指数不在返回值中,由调用方回退兜底。
 *
 * @param secids 形如 `2.931719` 的行情标识(见 resolveIndexSecid)
 * @returns 指数代码 → 行情;整体不可用时为空 Map(不抛错)
 */
export async function fetchIndexRealtimeQuotes(secids: string[]): Promise<Map<string, IndexRealtimeQuote>> {
  const result = new Map<string, IndexRealtimeQuote>()
  for (const [index, secid] of secids.entries()) {
    if (index > 0)
      await sleep(INDEX_QUERY_DELAY_MS)
    const quote = await fetchOneIndexQuote(secid)
    if (quote)
      result.set(quote.code, quote)
  }
  return result
}

/**
 * 查询单个指数的当日涨跌幅(push2his 日K 最后一行)。
 * @returns 拿不到行情时为 null
 */
async function fetchOneIndexQuote(secid: string): Promise<IndexRealtimeQuote | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1)
      await sleep(RETRY_DELAYS_MS[attempt - 2] ?? 900)
    try {
      const data = await $fetch<{
        data?: { code?: string, name?: string, klines?: string[] } | null
      }>(EASTMONEY_KLINE_API, {
        params: {
          secid,
          // fields2 映射: f51 日期 / f53 收盘点位 / f59 涨跌幅(%)
          fields1: 'f1,f2,f3',
          fields2: 'f51,f53,f59',
          klt: 101,
          fqt: 1,
          end: '20500101',
          lmt: 1,
        },
        timeout: REQUEST_TIMEOUT_MS,
      })
      const quote = parseIndexKlinePayload(data)
      if (!quote)
        continue
      return quote
    }
    catch (error: any) {
      console.warn(`[FundEstimateSource] 指数 ${secid} 行情查询失败:`, error?.message || error)
    }
  }
  return null
}

/**
 * 解析 push2his 日K 响应的最后一行,取指数当日涨跌幅。
 *
 * 上游 `klines` 每行为逗号分隔字符串,列顺序由请求的 `fields2` 决定。本项目固定
 * 请求 `f51,f53,f59`,对应「日期,收盘点位,涨跌幅%」。**第 2 列是指数点位
 * (如 2972.51),不是涨跌幅** —— 2026-11 曾因此把点位当涨跌幅写进估值字段
 * (估算涨跌 2973%),故此处按列位显式取第 3 列并加数值合理性校验。
 *
 * @returns 无行情或数值明显不合理时返回 null
 */
export function parseIndexKlinePayload(payload: unknown): { code: string, name: string, changePct: number } | null {
  const data = (payload as { data?: { code?: unknown, name?: unknown, klines?: unknown } | null } | null)?.data
  if (!data || !Array.isArray(data.klines))
    return null
  const code = typeof data.code === 'string'
    ? data.code
    : ''
  const name = typeof data.name === 'string'
    ? data.name
    : ''
  const last = data.klines.at(-1)
  if (!code || typeof last !== 'string')
    return null

  const cols = last.split(',')
  const changePct = Number(cols[2])
  // 单日指数涨跌幅不会超过 ±20%(含极端行情);超出则视为列错位/脏数据,拒绝采信
  if (!Number.isFinite(changePct) || Math.abs(changePct) > 20)
    return null
  return { code, name, changePct }
}

/**
 * 取基金跟踪指数的实时行情。
 *
 * 串联「查指数代码 → 解析 secid → 查行情」;任一环节无数据返回 null,
 * 由调用方决定回退(gold / 官方估算兜底)。
 */
export async function fetchFundIndexQuote(code: string): Promise<{ indexCode: string, indexName: string | null, changePct: number } | null> {
  const info = await fetchFundIndexInfo(code)
  if (!info?.indexCode)
    return null
  const secid = resolveIndexSecid(info.indexCode)
  if (!secid)
    return null
  const quotes = await fetchIndexRealtimeQuotes([secid])
  const quote = quotes.get(info.indexCode)
  if (!quote)
    return null
  return {
    indexCode: info.indexCode,
    indexName: info.indexName ?? quote.name ?? null,
    changePct: quote.changePct,
  }
}
