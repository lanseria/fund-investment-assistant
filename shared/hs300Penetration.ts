/**
 * 沪深300基金占比：头部沪深300指数基金规模 / 沪深300流通市值。
 *
 * 本文件同时被服务端（抓取 + 组装）与前端（类型 + 格式化）复用，
 * 只放「与运行环境无关」的类型、常量与纯函数，便于单测。
 *
 * 数据链路：
 * - 分子：天天基金 F10「规模变动」接口（季报口径期末净资产，单位：元）
 * - 分母：中证指数官网日行情（指数点位）× 东方财富指数快照（最新流通市值 / 最新点位），
 *   即按「最新点位」等比还原历史流通市值（指数调整市值与点位同比例变化，
 *   仅样本调整带来的除数变动未单独修正）。
 */

/** 沪深300 指数代码（中证口径，与行情接口 secid=1.000300 对应） */
export const HS300_INDEX_CODE = '000300'

/** 沪深300 指数名称 */
export const HS300_INDEX_NAME = '沪深300'

/** 「头部」默认取前 5 只 */
export const DEFAULT_TOP_FUND_COUNT = 5

/** 候选基金池中的单只基金（名称仅作兜底，优先使用上游返回的简称） */
export interface Hs300FundPoolItem {
  /** 基金代码 */
  code: string
  /** 兜底展示名称 */
  name: string
}

/**
 * 候选基金池：跟踪沪深300的被动指数基金（场内 ETF）。
 *
 * 刻意排除：
 * - ETF 联接基金（如 000961 / 160706）：其净资产已包含在目标 ETF 中，计入会重复统计
 * - 增强指数基金（如 561300 沪深300增强ETF）：并非完全被动复制，口径不一致
 * - 已终止/转型基金（如 159927 鹏华沪深300ETF，规模数据止于 2019 年）
 */
export const HS300_FUND_POOL: readonly Hs300FundPoolItem[] = [
  { code: '510300', name: '沪深300ETF华泰柏瑞' },
  { code: '510310', name: '沪深300ETF易方达' },
  { code: '510330', name: '沪深300ETF华夏' },
  { code: '159919', name: '沪深300ETF嘉实' },
  { code: '510350', name: '沪深300ETF工银' },
  { code: '510360', name: '沪深300ETF广发' },
  { code: '159925', name: '沪深300ETF南方' },
  { code: '510380', name: '沪深300ETF国寿' },
  { code: '515130', name: '沪深300ETF博时' },
  { code: '515360', name: '沪深300ETF方正富邦' },
]

/** 口径说明（服务端写入响应 meta，前端原样展示，保证两边一致） */
export const HS300_PENETRATION_METHODOLOGY: readonly string[] = [
  '「头部」指候选池中按最新披露季报净资产排名前 5 的被动沪深300指数基金（ETF），ETF 联接基金不计入以避免重复统计。',
  '基金规模取季报期末净资产（天天基金 F10 规模变动数据），因此曲线为季度口径，季末呈阶梯变化。',
  '沪深300流通市值 = 指数收盘点位 × 最新流通市值 ÷ 最新点位（按指数点位等比还原）。指数调整市值与点位同比例变化，样本调整带来的除数变动未单独修正，历史值存在小幅偏差。',
  '日频序列为估算口径：每只基金份额取最近一期已披露季报，规模随 ETF 日收盘价逐日折算（ETF 折溢价极小，近似用收盘价代替净值）；季报切换日会出现台阶，与官方季报点可能存在小幅差异。',
]

/** 数据来源说明（前端脚注展示） */
export const HS300_DATA_SOURCES: readonly string[] = [
  '基金季报净资产：天天基金 F10 规模变动（FundArchivesDatas.aspx?type=gmbd）',
  '指数日行情：中证指数官网 index-perf（000300）',
  '最新点位与流通市值：东方财富行情快照（push2.eastmoney.com）',
]

/** 单只基金的季报规模记录（单位：元） */
export interface Hs300FundScaleRecord {
  /** 报告期（yyyy-MM-dd，自然季末） */
  date: string
  /** 期末净资产（元） */
  netAssets: number
}

/** 规模变动接口的解析结果 */
export interface Hs300FundScaleParsed {
  /** 上游返回的基金简称（可能为 null） */
  name: string | null
  /** 季报规模序列（按报告期升序，已去重） */
  records: Hs300FundScaleRecord[]
}

/** 指数日行情（收盘点位） */
export interface Hs300IndexDay {
  /** 交易日（yyyy-MM-dd） */
  date: string
  /** 收盘点位 */
  close: number
}

/** 指数行情快照（最新点位 + 最新流通市值，单位：元） */
export interface Hs300QuoteSnapshot {
  /** 最新点位 */
  indexClose: number
  /** 最新流通市值（元） */
  floatCap: number
}

/** 流通市值换算锚点：某个时点的指数点位与对应的沪深300流通市值 */
export interface Hs300PenetrationAnchor {
  /** 锚点日期（yyyy-MM-dd，取抓取当日） */
  date: string
  /** 锚点时的指数点位 */
  indexClose: number
  /** 锚点时的沪深300流通市值（元） */
  floatCap: number
}

/** 入选「头部」的单只基金 */
export interface Hs300PenetrationFund {
  /** 基金代码 */
  code: string
  /** 基金简称 */
  name: string
  /** 最新季报净资产（元） */
  latestNetAssets: number
}

/** 季度序列中的单个点 */
export interface Hs300PenetrationPoint {
  /** 报告期（yyyy-MM-dd，自然季末） */
  date: string
  /** 该报告期对齐到的指数交易日（不晚于报告期的最近交易日） */
  tradeDate: string
  /** 头部基金合计净资产（元） */
  totalNetAssets: number
  /** 沪深300流通市值（元，等比还原） */
  floatCap: number
  /** 占流通市值比例（%，如 0.48 表示 0.48%） */
  ratio: number
  /** 该交易日的指数收盘点位 */
  indexClose: number
  /** 各基金净资产（元），下标与 funds 顺序一致；未成立/无数据记 0 */
  fundNetAssets: number[]
}

/** 单只基金的日收盘价（单位：元，ETF 场内价格） */
export interface Hs300PriceDay {
  /** 交易日（yyyy-MM-dd） */
  date: string
  /** 收盘价 */
  close: number
}

/** 日频序列中的单个点 */
export interface Hs300DailyPoint {
  /** 交易日（yyyy-MM-dd） */
  date: string
  /** 头部基金合计净资产估算（元） */
  totalNetAssets: number
  /** 沪深300流通市值（元，等比还原） */
  floatCap: number
  /** 占流通市值比例（%） */
  ratio: number
  /** 指数收盘点位 */
  indexClose: number
}

/**
 * 日频估算序列（按日期升序，各数组等长）。
 *
 * 估算方式：每只基金规模 = 最近一期季报净资产 × 当日 ETF 收盘价 ÷ 该季报期末收盘价，
 * 即「份额取季报口径、规模随价格逐日变动」，季报切换日产生台阶。
 */
export interface Hs300PenetrationDailySeries {
  /** 交易日（yyyy-MM-dd） */
  dates: string[]
  /** 头部基金合计净资产估算（元） */
  totalNetAssets: number[]
  /** 沪深300流通市值（元，等比还原） */
  floatCap: number[]
  /** 占流通市值比例（%） */
  ratio: number[]
  /** 指数收盘点位 */
  indexClose: number[]
}

/** 组装日频序列的入参 */
export interface Hs300DailyBuildInput {
  /** 已选定的头部基金 */
  funds: readonly Hs300PenetrationFund[]
  /** 各基金季报规模序列（按代码索引，序列内部需按日期升序） */
  fundScales: Record<string, Hs300FundScaleRecord[]>
  /** 各基金 ETF 日收盘价（按代码索引，序列内部需按日期升序） */
  fundPrices: Record<string, Hs300PriceDay[]>
  /** 指数日行情（按日期升序） */
  tradingDays: readonly Hs300IndexDay[]
  /** 流通市值换算锚点 */
  anchor: Hs300PenetrationAnchor
}

/** 响应元信息 */
export interface Hs300PenetrationMeta {
  /** 候选池基金数量 */
  poolSize: number
  /** 「头部」基金数量 */
  topFundCount: number
  /** 指数代码 */
  indexCode: string
  /** 指数名称 */
  indexName: string
  /** 数据来源 */
  dataSources: string[]
  /** 口径说明 */
  methodology: string[]
  /** 数据生成时间（ISO 字符串） */
  updatedAt: string
}

/** GET /api/market/hs300-penetration 响应 */
export interface Hs300PenetrationResponse {
  /** 最新报告期（yyyy-MM-dd） */
  asOf: string
  /** 流通市值换算锚点 */
  anchor: Hs300PenetrationAnchor
  /** 入选「头部」的基金（按最新规模降序） */
  funds: Hs300PenetrationFund[]
  /** 季度序列（按报告期升序） */
  series: Hs300PenetrationPoint[]
  /** 日频估算序列；任一头部基金缺少日行情时为 null */
  daily: Hs300PenetrationDailySeries | null
  /** 元信息 */
  meta: Hs300PenetrationMeta
}

/** 组装季度序列的入参 */
export interface Hs300PenetrationBuildInput {
  /** 已选定的头部基金（顺序即 fundNetAssets 的下标顺序） */
  funds: readonly Hs300PenetrationFund[]
  /** 各基金的季报规模序列（按代码索引，序列内部需按日期升序） */
  fundScales: Record<string, Hs300FundScaleRecord[]>
  /** 指数日行情（按日期升序） */
  tradingDays: readonly Hs300IndexDay[]
  /** 流通市值换算锚点 */
  anchor: Hs300PenetrationAnchor
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const QUARTER_END_MONTH_DAYS = new Set(['03-31', '06-30', '09-30', '12-31'])

/** 判断 yyyy-MM-dd 是否为自然季末（03-31 / 06-30 / 09-30 / 12-31） */
export function isQuarterEndDate(date: string): boolean {
  return DATE_RE.test(date) && QUARTER_END_MONTH_DAYS.has(date.slice(5))
}

/** 自然季末对应的季度标签，如 2026-09-30 → 2026Q3 */
export function formatQuarterLabel(date: string): string {
  if (!DATE_RE.test(date))
    return date
  const year = date.slice(0, 4)
  const month = Number(date.slice(5, 7))
  const quarter = month >= 10
    ? 4
    : month >= 7
      ? 3
      : month >= 4
        ? 2
        : 1
  return `${year}Q${quarter}`
}

/**
 * 从「key:[...]」形式的 JSON 文本中截取完整数组（按括号/字符串状态逐字符扫描）。
 * 天天基金 F10 接口返回的是 `var gmbd_apidata={ content:"...", "data":[...] }` 形式的
 * JS 脚本，`content` 内嵌 HTML 字符串，不能直接用 JSON.parse 整体解析。
 */
function extractJsonArrayAfterKey(raw: string, key: string): string | null {
  const start = raw.lastIndexOf(`"${key}":[`)
  if (start < 0)
    return null
  const arrayStart = raw.indexOf('[', start)
  if (arrayStart < 0)
    return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = arrayStart; i < raw.length; i++) {
    const char = raw[i]!
    if (inString) {
      if (escaped)
        escaped = false
      else if (char === '\\')
        escaped = true
      else if (char === '"')
        inString = false
      continue
    }
    if (char === '"') {
      inString = true
    }
    else if (char === '[') {
      depth++
    }
    else if (char === ']') {
      depth--
      if (depth === 0)
        return raw.slice(arrayStart, i + 1)
    }
  }
  return null
}

/**
 * 解析天天基金 F10「规模变动」接口返回的 JS 脚本，提取季报净资产序列。
 *
 * 上游会在建仓期/上市初期额外返回少量日度记录，这里统一按自然季末过滤，
 * 只保留 `NETNAV`（期末净资产，单位：元）为正数的季报记录。
 */
export function parseFundScalePayload(raw: string): Hs300FundScaleParsed {
  const arrayText = extractJsonArrayAfterKey(raw, 'data')
  if (!arrayText)
    return { name: null, records: [] }

  let rows: unknown
  try {
    rows = JSON.parse(arrayText)
  }
  catch {
    return { name: null, records: [] }
  }
  if (!Array.isArray(rows))
    return { name: null, records: [] }

  let name: string | null = null
  const byDate = new Map<string, number>()
  for (const row of rows) {
    if (!row || typeof row !== 'object')
      continue
    const record = row as Record<string, unknown>
    if (name === null && typeof record.SHORTNAME === 'string' && record.SHORTNAME.trim())
      name = record.SHORTNAME.trim()

    const date = typeof record.FSRQ === 'string'
      ? record.FSRQ
      : ''
    const netAssets = Number(record.NETNAV)
    if (!isQuarterEndDate(date) || !Number.isFinite(netAssets) || netAssets <= 0)
      continue
    // 上游按日期倒序返回，同一季末重复出现时保留第一条
    if (!byDate.has(date))
      byDate.set(date, netAssets)
  }

  const records = [
    ...byDate.entries(),
  ]
    .map(([date, netAssets]) => ({ date, netAssets }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return { name, records }
}

/** 把 'YYYYMMDD' 或 'YYYY-MM-DD' 统一为 'YYYY-MM-DD'；无法识别返回 null */
function toIsoDate(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 8)
    return null
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  return DATE_RE.test(date)
    ? date
    : null
}

/**
 * 解析中证指数官网 index-perf 响应，得到按日期升序的日收盘序列。
 * 上游 `tradeDate` 为 'YYYYMMDD'，`close` 为收盘点位。
 */
export function parseCsindexPerfPayload(payload: unknown): Hs300IndexDay[] {
  const list = (payload as { data?: unknown } | null)?.data
  if (!Array.isArray(list))
    return []

  const byDate = new Map<string, number>()
  for (const item of list) {
    if (!item || typeof item !== 'object')
      continue
    const row = item as Record<string, unknown>
    const date = toIsoDate(typeof row.tradeDate === 'string'
      ? row.tradeDate
      : '')
    const close = Number(row.close)
    if (!date || !Number.isFinite(close) || close <= 0)
      continue
    byDate.set(date, close)
  }

  return [
    ...byDate.entries(),
  ]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 解析东方财富指数行情快照（secid=1.000300, fields=f43,f59,f117）。
 * `f43` 为按 `f59` 位小数缩放的整数点位，`f117` 为流通市值（元）。
 */
export function parseEastmoneyIndexQuote(payload: unknown): Hs300QuoteSnapshot | null {
  const data = (payload as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object')
    return null

  const row = data as Record<string, unknown>
  const rawPrice = Number(row.f43)
  const decimals = Number(row.f59)
  const floatCap = Number(row.f117)
  if (!Number.isFinite(rawPrice) || rawPrice <= 0 || !Number.isFinite(floatCap) || floatCap <= 0)
    return null

  const scale = Number.isFinite(decimals)
    ? 10 ** Math.max(0, Math.trunc(decimals))
    : 1
  const indexClose = rawPrice / scale
  if (!Number.isFinite(indexClose) || indexClose <= 0)
    return null

  return { indexClose, floatCap }
}

/**
 * 按最新净资产降序挑出「头部」基金。
 * 规模缺失（<=0）的候选会被过滤，避免把停牌/无数据的基金计入。
 */
export function pickTopFunds(
  candidates: readonly Hs300PenetrationFund[],
  count: number = DEFAULT_TOP_FUND_COUNT,
): Hs300PenetrationFund[] {
  const limit = Math.max(1, Math.trunc(count))
  return candidates
    .filter(item => Number.isFinite(item.latestNetAssets) && item.latestNetAssets > 0)
    .sort((a, b) => b.latestNetAssets - a.latestNetAssets)
    .slice(0, limit)
}

/**
 * 把报告期（自然季末）对齐到不晚于该日期的最近交易日。
 * @returns 命中的交易行情，早于全部行情时返回 null
 */
export function alignToTradingDay(
  targetDate: string,
  tradingDays: readonly Hs300IndexDay[],
): Hs300IndexDay | null {
  let low = 0
  let high = tradingDays.length - 1
  let found: Hs300IndexDay | null = null
  while (low <= high) {
    const mid = (low + high) >> 1
    const day = tradingDays[mid]!
    if (day.date <= targetDate) {
      found = day
      low = mid + 1
    }
    else {
      high = mid - 1
    }
  }
  return found
}

/** 报告期与对齐交易日之间允许的最大间隔（自然日），超过视为行情缺失 */
export const MAX_TRADE_DAY_LAG_DAYS = 15

/** 两个 yyyy-MM-dd 日期之间相差的自然日天数（later 早于 earlier 时为负） */
export function daysBetween(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00Z`)
  const end = Date.parse(`${later}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return Number.NaN
  return Math.round((end - start) / 86_400_000)
}

/** 按锚点比例把指数点位还原为沪深300流通市值（元） */
export function deriveFloatCap(indexClose: number, anchor: Hs300PenetrationAnchor): number {
  if (!Number.isFinite(indexClose) || indexClose <= 0 || !Number.isFinite(anchor.floatCap) || anchor.floatCap <= 0 || !Number.isFinite(anchor.indexClose) || anchor.indexClose <= 0)
    return 0
  return indexClose * (anchor.floatCap / anchor.indexClose)
}

/** 计算「合计规模 / 流通市值」比例（%，保留原始精度，由展示层格式化） */
export function computeRatio(totalNetAssets: number, floatCap: number): number {
  if (!Number.isFinite(totalNetAssets) || !Number.isFinite(floatCap) || floatCap <= 0)
    return 0
  return (totalNetAssets / floatCap) * 100
}

/**
 * 取某基金在指定报告期的净资产：命中季报用季报值；中间缺报或最新一期尚未披露时
 * 沿用上一期（避免单个基金披露滞后导致合计规模断崖）；早于成立日记 0。
 */
function valueAtQuarter(date: string, records: readonly Hs300FundScaleRecord[]): number {
  let value = 0
  for (const record of records) {
    if (record.date > date)
      break
    value = record.netAssets
  }
  return value
}

/**
 * 组装季度占比序列。
 *
 * - 报告期取所有头部基金出现过的季末日期并集（升序）
 * - 分母按锚点比例由指数收盘点位还原
 * - 合计规模 <= 0 的报告期（头部基金均未成立）直接跳过
 */
export function buildPenetrationSeries(input: Hs300PenetrationBuildInput): Hs300PenetrationPoint[] {
  const fundRecords = input.funds.map(fund => [
    ...(input.fundScales[fund.code] ?? []),
  ]
    .sort((a, b) => a.date.localeCompare(b.date)))

  const dates = [
    ...new Set(fundRecords.flatMap(records => records.map(record => record.date))),
  ]
    .sort((a, b) => a.localeCompare(b))

  const points: Hs300PenetrationPoint[] = []
  for (const date of dates) {
    const day = alignToTradingDay(date, input.tradingDays)
    // 行情缺失/严重滞后时跳过该报告期，避免用过期点位还原流通市值
    if (!day || !(daysBetween(day.date, date) <= MAX_TRADE_DAY_LAG_DAYS))
      continue

    const fundNetAssets = fundRecords.map(records => valueAtQuarter(date, records))
    const totalNetAssets = fundNetAssets.reduce((sum, value) => sum + value, 0)
    if (totalNetAssets <= 0)
      continue

    const floatCap = deriveFloatCap(day.close, input.anchor)
    points.push({
      date,
      tradeDate: day.date,
      totalNetAssets,
      floatCap,
      ratio: computeRatio(totalNetAssets, floatCap),
      indexClose: day.close,
      fundNetAssets,
    })
  }
  return points
}

/**
 * 解析东方财富 ETF 日 K 线响应（push2his.eastmoney.com/api/qt/stock/kline/get，
 * fields2=f51,f53 → 每行 "yyyy-MM-dd,close"），按日期升序去重返回。
 */
export function parseEastmoneyKlinePayload(payload: unknown): Hs300PriceDay[] {
  const list = (payload as { data?: { klines?: unknown } } | null)?.data?.klines
  if (!Array.isArray(list))
    return []

  const byDate = new Map<string, number>()
  for (const line of list) {
    if (typeof line !== 'string')
      continue
    const [rawDate, rawClose] = line.split(',')
    const date = toIsoDate(rawDate ?? '')
    const close = Number(rawClose)
    if (!date || !Number.isFinite(close) || close <= 0)
      continue
    byDate.set(date, close)
  }

  return [
    ...byDate.entries(),
  ]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 组装日频估算序列。
 *
 * 对每个交易日 t：
 * - 每只基金取「不晚于 t 的最近一期季报」净资产，以及该季报期末收盘价 p0；
 * - 规模估算 = 净资产 × 当日收盘价 / p0（份额不变假设，价格随市）；
 * - 合计规模除以按锚点还原的流通市值得到占比。
 *
 * 季报切换的下一个交易日起改用新一期净资产，因此曲线会出现台阶；
 * 成立前（无价格/无季报）的交易日该基金记 0，全部为 0 的交易日跳过。
 */
export function buildDailyPenetrationSeries(input: Hs300DailyBuildInput): Hs300PenetrationDailySeries {
  const prepared = input.funds.map((fund) => {
    const records = [
      ...(input.fundScales[fund.code] ?? []),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
    const prices = [
      ...(input.fundPrices[fund.code] ?? []),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))

    // 每条季报对应的期末收盘价：不晚于报告期的最近交易日收盘
    const quarterCloses: (number | null)[] = []
    let priceIndex = -1
    for (const record of records) {
      while (priceIndex + 1 < prices.length && prices[priceIndex + 1]!.date <= record.date)
        priceIndex++
      quarterCloses.push(priceIndex >= 0
        ? prices[priceIndex]!.close
        : null)
    }
    return { records, prices, quarterCloses }
  })

  const series: Hs300PenetrationDailySeries = {
    dates: [],
    totalNetAssets: [],
    floatCap: [],
    ratio: [],
    indexClose: [],
  }
  const pointers = prepared.map(() => ({ record: -1, price: -1 }))

  for (const day of input.tradingDays) {
    let totalNetAssets = 0
    prepared.forEach((fund, index) => {
      const pointer = pointers[index]!
      while (pointer.price + 1 < fund.prices.length && fund.prices[pointer.price + 1]!.date <= day.date)
        pointer.price++
      while (pointer.record + 1 < fund.records.length && fund.records[pointer.record + 1]!.date <= day.date)
        pointer.record++
      if (pointer.record < 0 || pointer.price < 0)
        return
      const quarterClose = fund.quarterCloses[pointer.record]
      if (!quarterClose || quarterClose <= 0)
        return
      totalNetAssets += fund.records[pointer.record]!.netAssets * fund.prices[pointer.price]!.close / quarterClose
    })

    if (!(totalNetAssets > 0))
      continue
    const floatCap = deriveFloatCap(day.close, input.anchor)
    if (!(floatCap > 0))
      continue

    series.dates.push(day.date)
    series.totalNetAssets.push(Math.round(totalNetAssets))
    series.floatCap.push(Math.round(floatCap))
    series.ratio.push(Number(computeRatio(totalNetAssets, floatCap).toFixed(6)))
    series.indexClose.push(Number(day.close.toFixed(2)))
  }
  return series
}

/**
 * 把日频序列对齐到一批目标日期（如基金净值日期）：
 * 每天取「不晚于该日期的最近一个交易日」的日频点，早于序列起点返回 null。
 */
export function alignDailyToDates(
  targetDates: readonly string[],
  daily: Hs300PenetrationDailySeries,
): Array<Hs300DailyPoint | null> {
  const result: Array<Hs300DailyPoint | null> = []
  let pointer = -1
  for (const date of targetDates) {
    while (pointer + 1 < daily.dates.length && daily.dates[pointer + 1]! <= date)
      pointer++
    if (pointer < 0) {
      result.push(null)
      continue
    }
    result.push({
      date: daily.dates[pointer]!,
      totalNetAssets: daily.totalNetAssets[pointer] ?? 0,
      floatCap: daily.floatCap[pointer] ?? 0,
      ratio: daily.ratio[pointer] ?? 0,
      indexClose: daily.indexClose[pointer] ?? 0,
    })
  }
  return result
}

/**
 * 计算两组等长数值序列的皮尔逊相关系数。
 * 数据不足 3 组、含非有限值或任一序列无波动时返回 null。
 */
export function computePearsonCorrelation(xs: readonly number[], ys: readonly number[]): number | null {
  const length = Math.min(xs.length, ys.length)
  if (length < 3)
    return null

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  let sumYY = 0
  for (let i = 0; i < length; i++) {
    const x = xs[i]!
    const y = ys[i]!
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return null
    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
    sumYY += y * y
  }

  const numerator = length * sumXY - sumX * sumY
  const denominator = Math.sqrt((length * sumXX - sumX * sumX) * (length * sumYY - sumY * sumY))
  if (!(denominator > 0))
    return null
  return numerator / denominator
}
