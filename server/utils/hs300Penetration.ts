import type {
  Hs300FundScaleParsed,
  Hs300FundScaleRecord,
  Hs300IndexDay,
  Hs300PenetrationAnchor,
  Hs300PenetrationDailySeries,
  Hs300PenetrationFund,
  Hs300PenetrationResponse,
  Hs300PriceDay,
  Hs300QuoteSnapshot,
} from '~~/shared/hs300Penetration'
import { format } from 'date-fns'
import { ofetch } from 'ofetch'
import {
  buildDailyPenetrationSeries,
  buildPenetrationSeries,
  DEFAULT_TOP_FUND_COUNT,
  HS300_DATA_SOURCES,
  HS300_FUND_POOL,
  HS300_INDEX_CODE,
  HS300_INDEX_NAME,
  HS300_PENETRATION_METHODOLOGY,
  parseCsindexPerfPayload,
  parseEastmoneyIndexQuote,
  parseEastmoneyKlinePayload,
  parseFundScalePayload,
  pickTopFunds,
} from '~~/shared/hs300Penetration'

// 沪深300基金占比 = 头部沪深300指数基金季报净资产合计 / 沪深300流通市值。
// 三个上游（天天基金 F10 / 中证指数官网 / 东方财富快照）都是公开网页接口，
// 无鉴权、有偶发限流，因此这里集中做「内存缓存 + 重试 + 单只基金降级」，
// 保证页面在部分上游抖动时仍能出图。

/** 天天基金 F10 规模变动接口：返回的是 JS 脚本而非 JSON，必须按文本读取 */
const FUND_SCALE_API = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx'
/** 中证指数官网日行情接口（000300 历史收盘点位） */
const CSINDEX_PERF_API = 'https://www.csindex.com.cn/csindex-home/perf/index-perf'
/** 东方财富行情快照接口：f43 点位（按 f59 缩放）、f117 流通市值（元） */
const EASTMONEY_QUOTE_API = 'https://push2.eastmoney.com/api/qt/stock/get'
/** 东方财富 ETF 日 K 接口：fields2=f51,f53 → 每行 "yyyy-MM-dd,close" */
const EASTMONEY_KLINE_API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'

/** 响应缓存有效期：季报口径数据变化慢，30 分钟足够，同时避免每次访问都打上游 */
const CACHE_TTL_MS = 30 * 60 * 1000
/** 上游请求超时：官网偶发慢响应，低于 15s 容易误判失败，取 20s */
const REQUEST_TIMEOUT_MS = 20_000
/** 单只基金最多尝试次数：F10 限流时返回空脚本/空 data，重试通常可以恢复 */
const FUND_MAX_ATTEMPTS = 3
/** 第 2、3 次尝试前的退避等待（ms）：指数退避，1200 为再增加尝试次数时的兜底上限 */
const FUND_RETRY_DELAYS_MS = [300, 700, 1200]
/**
 * 成功抓取基金数下限：候选池共 10 只。
 *
 * 不能放过少：上游限流丢掉 1-2 只大基金时，头部前 5 会被候选池里的小基金顶替，
 * 占比失真且不会报错（静默错误比报错危险得多）。
 * 因此要求至少 8 只成功 —— 宁可 502（前端有重试按钮、服务端有 30 分钟缓存兜底），
 * 也不要静默发布错误的「头部前 5」。
 */
const MIN_FUND_SUCCESS_COUNT = 8
/** 指数日行情起始日：候选池基金最早季报在 2012 年，多取一点保证首个季末能对齐到交易日 */
const INDEX_HISTORY_START = '20120101'

/** 缓存条目 */
interface Hs300PenetrationCacheEntry {
  /** 完整响应（缓存整份响应，避免重复组装） */
  value: Hs300PenetrationResponse
  /** 过期时间戳（ms） */
  expiresAt: number
}

/** 模块级内存缓存：单进程有效；多实例部署时各自维护，30 分钟 TTL 内可接受 */
let cache: Hs300PenetrationCacheEntry | null = null
/** 进行中的抓取任务：并发请求共享同一次上游抓取，避免把限流敏感的 F10 打爆 */
let inflight: Promise<Hs300PenetrationResponse> | null = null

/** 等待指定毫秒，用于重试退避 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 抓取单只基金的季报规模序列。
 *
 * 上游限流时不会报错，而是返回空 content / 空 data，因此「解析出 0 条记录」
 * 也要算作一次失败并重试；3 次都失败才把错误抛给调用方，由调用方降级跳过。
 */
async function fetchFundScale(code: string): Promise<Hs300FundScaleParsed> {
  let lastError: unknown = new Error(`基金 ${code} 规模变动抓取失败`)
  for (let attempt = 1; attempt <= FUND_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1)
      await sleep(FUND_RETRY_DELAYS_MS[attempt - 2] ?? 1200)
    try {
      const raw = await ofetch<string, 'text'>(FUND_SCALE_API, {
        params: {
          type: 'gmbd',
          code,
          rt: Date.now(),
        },
        headers: {
          // 上游校验 Referer，缺失会返回空内容
          'Referer': `https://fundf10.eastmoney.com/gmbd_${code}.html`,
          'User-Agent': 'Mozilla/5.0',
        },
        // 响应是 JS 脚本，按文本读取后再交给纯函数解析
        responseType: 'text',
        timeout: REQUEST_TIMEOUT_MS,
      })
      const parsed = parseFundScalePayload(raw)
      if (parsed.records.length > 0)
        return parsed
      lastError = new Error(`基金 ${code} 规模变动返回空记录`)
    }
    catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`基金 ${code} 规模变动抓取失败`)
}

/** 抓取最新点位与流通市值快照；缺任一字段则无法构造分母，直接抛错 */
async function fetchQuoteSnapshot(): Promise<Hs300QuoteSnapshot> {
  const payload = await ofetch<unknown>(EASTMONEY_QUOTE_API, {
    params: { secid: `1.${HS300_INDEX_CODE}`, fields: 'f43,f59,f117' },
    timeout: REQUEST_TIMEOUT_MS,
  })
  const snapshot = parseEastmoneyIndexQuote(payload)
  if (!snapshot)
    throw new Error('东方财富行情快照缺少有效的点位或流通市值')
  return snapshot
}

/** 抓取中证指数日行情，用于把季末报告期对齐到不晚于它的最近交易日 */
async function fetchTradingDays(): Promise<Hs300IndexDay[]> {
  const payload = await ofetch<unknown>(CSINDEX_PERF_API, {
    params: {
      indexCode: HS300_INDEX_CODE,
      startDate: INDEX_HISTORY_START,
      endDate: format(new Date(), 'yyyyMMdd'),
    },
    headers: { Referer: 'https://www.csindex.com.cn/' },
    timeout: REQUEST_TIMEOUT_MS,
  })
  const days = parseCsindexPerfPayload(payload)
  if (days.length === 0)
    throw new Error('中证指数日行情返回为空')
  return days
}

/**
 * 抓取单只 ETF 的日 K 收盘价（2012 年至今），用于日频估算序列。
 *
 * secid 规则：沪市 ETF（5 开头，如 510300）用 `1.` 前缀，深市（1 开头，如 159919）用 `0.`；
 * fqt=0 取不复权价（季报净资产与收盘价都是当期真实值，复权会破坏两者比值的一致性）。
 * 上游偶发限流会返回空 klines，与 F10 一样视为本次尝试失败并退避重试。
 */
async function fetchFundDailyPrices(code: string): Promise<Hs300PriceDay[]> {
  const secid = `${code.startsWith('5')
    ? '1'
    : '0'}.${code}`
  let lastError: unknown = new Error(`基金 ${code} 日 K 抓取失败`)
  for (let attempt = 1; attempt <= FUND_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1)
      await sleep(FUND_RETRY_DELAYS_MS[attempt - 2] ?? 1200)
    try {
      const payload = await ofetch<unknown>(EASTMONEY_KLINE_API, {
        params: {
          secid,
          klt: 101,
          fqt: 0,
          beg: INDEX_HISTORY_START,
          end: '20500101',
          fields1: 'f1,f2,f3',
          fields2: 'f51,f53',
        },
        timeout: REQUEST_TIMEOUT_MS,
      })
      const prices = parseEastmoneyKlinePayload(payload)
      if (prices.length > 0)
        return prices
      lastError = new Error(`基金 ${code} 日 K 返回空记录`)
    }
    catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`基金 ${code} 日 K 抓取失败`)
}

/**
 * 抓取并组装一次完整响应（不走缓存）。
 *
 * 流程：先并发抓分母侧（快照 + 日行情）→ 再并发抓 10 只候选基金 →
 * 按最新季报净资产挑前 5 只 → 并发抓这 5 只的日 K →
 * 用纯函数分别组装季度序列与日频估算序列。
 * 任一关键步骤失败都抛错，由上层决定是否回退到缓存值；
 * 日频估算属于补充口径，抓不到时降级为 null，不影响季度序列。
 */
async function buildHs300Penetration(): Promise<Hs300PenetrationResponse> {
  // 分母先行：任一失败都无法计算占比，尽早失败可以少打 10 次限流敏感的 F10
  const [quote, tradingDays] = await Promise.all([
    fetchQuoteSnapshot(),
    fetchTradingDays(),
  ])

  // allSettled 而非 all：候选池里包含小规模/转型基金，单只失败不应影响整体
  const settled = await Promise.allSettled(HS300_FUND_POOL.map(item => fetchFundScale(item.code)))

  const candidates: Hs300PenetrationFund[] = []
  const fundScales: Record<string, Hs300FundScaleRecord[]> = {}

  settled.forEach((result, index) => {
    const item = HS300_FUND_POOL[index]!
    if (result.status === 'rejected') {
      console.warn(`[hs300-penetration] 基金 ${item.code}(${item.name}) 规模抓取失败，已跳过：`, result.reason)
      return
    }
    const records = result.value.records
    const latest = records.at(-1)
    if (!latest) {
      // 兜底：fetchFundScale 已保证非空，这里防御上游返回异常的极端情况
      console.warn(`[hs300-penetration] 基金 ${item.code}(${item.name}) 无有效季报规模，已跳过`)
      return
    }
    fundScales[item.code] = records
    // 优先用上游返回的基金简称（更准确），缺失时回退到候选池名称
    candidates.push({
      code: item.code,
      name: result.value.name ?? item.name,
      latestNetAssets: latest.netAssets,
    })
  })

  if (candidates.length < MIN_FUND_SUCCESS_COUNT)
    throw new Error(`[hs300-penetration] 沪深300基金规模上游不可用：仅 ${candidates.length}/${HS300_FUND_POOL.length} 只基金抓取成功`)

  const funds = pickTopFunds(candidates, DEFAULT_TOP_FUND_COUNT)

  // 日频估算需要 5 只头部基金各自的日 K：allSettled 并发抓（5 个并发已是小并发，
  // 且每只内部还有退避重试），任一只失败/为空就整体降级为 null ——
  // 日频只是补充口径，不因此让整页 502。
  const dailySettled = await Promise.allSettled(funds.map(fund => fetchFundDailyPrices(fund.code)))
  const fundPrices: Record<string, Hs300PriceDay[]> = {}
  let dailyPriceFailed = false
  dailySettled.forEach((result, index) => {
    const fund = funds[index]!
    if (result.status === 'rejected') {
      dailyPriceFailed = true
      console.warn(`[hs300-penetration] 基金 ${fund.code}(${fund.name}) 日 K 抓取失败，日频估算降级为 null：`, result.reason)
      return
    }
    if (result.value.length === 0) {
      dailyPriceFailed = true
      console.warn(`[hs300-penetration] 基金 ${fund.code}(${fund.name}) 日 K 为空，日频估算降级为 null`)
      return
    }
    fundPrices[fund.code] = result.value
  })

  const anchor: Hs300PenetrationAnchor = {
    // 记抓取当日，方便前端说明「流通市值还原到哪一天」
    date: format(new Date(), 'yyyy-MM-dd'),
    indexClose: quote.indexClose,
    floatCap: quote.floatCap,
  }

  const series = buildPenetrationSeries({
    funds,
    fundScales,
    tradingDays,
    anchor,
  })
  if (series.length === 0)
    throw new Error('[hs300-penetration] 组装后的季度序列为空：季报数据与指数行情无法对齐')

  let daily: Hs300PenetrationDailySeries | null = null
  if (dailyPriceFailed) {
    console.warn('[hs300-penetration] 日频估算降级：缺少至少一只头部基金的日 K，daily 置为 null')
  }
  else {
    const built = buildDailyPenetrationSeries({
      funds,
      fundScales,
      fundPrices,
      tradingDays,
      anchor,
    })
    if (built.dates.length > 0) {
      daily = built
    }
    else {
      console.warn('[hs300-penetration] 日频估算序列为空（季报与日 K 无法对齐），daily 置为 null')
    }
  }

  return {
    asOf: series.at(-1)!.date,
    anchor,
    funds,
    series,
    daily,
    meta: {
      poolSize: HS300_FUND_POOL.length,
      topFundCount: DEFAULT_TOP_FUND_COUNT,
      indexCode: HS300_INDEX_CODE,
      indexName: HS300_INDEX_NAME,
      dataSources: [...HS300_DATA_SOURCES],
      methodology: [...HS300_PENETRATION_METHODOLOGY],
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * 获取沪深300基金占比数据。
 *
 * @param options 可选配置
 * @param options.refresh 为 true 时绕过缓存强制重抓，并覆盖缓存
 */
export async function getHs300Penetration(options: { refresh?: boolean } = {}): Promise<Hs300PenetrationResponse> {
  const forceRefresh = options.refresh === true

  if (!forceRefresh) {
    if (cache && cache.expiresAt > Date.now())
      return cache.value
    // 已有在途抓取时直接复用，避免同一时刻的多个页面请求各自打一遍上游
    if (inflight)
      return inflight
  }

  const task = buildHs300Penetration().then((value) => {
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
    return value
  })

  inflight = task
  try {
    return await task
  }
  finally {
    // 只清理自己创建的任务，避免 refresh 并发时误清别的在途请求
    if (inflight === task)
      inflight = null
  }
}

/** 清空内存缓存与在途任务引用（测试或需要下次强制重抓时调用） */
export function clearHs300PenetrationCache(): void {
  cache = null
  inflight = null
}
