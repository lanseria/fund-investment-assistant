import { Buffer } from 'node:buffer'
import iconv from 'iconv-lite'

interface FundRealtimeData {
  name: string
  code: string
  yesterdayNav: string
  estimateNav: string
  percentageChange: string
  updateTime: string
}

/** 盘中分时数据点(time 格式取决于数据源,通常为 HH:mm) */
export interface IntradayPoint {
  time: string
  value: number
  [key: string]: unknown
}

/**
 * Python 服务 /fund/realtime/{code} 的完整返回结构。
 * 行为变化(2026-07):数据源改为 powercloud 聚合接口后,新增 quoteSource/message 状态标识
 * 与 intraday 分时数据,publishedNav 恢复官方净值填充。
 * 行为变化(2026-08):新增 holdingsDate/holdings 重仓股持仓明细(报告期持仓 + 最新行情快照)。
 */
export interface StrategyRealtimeResponse {
  code: string
  name: string
  estimateNav: string | null // 估算单位净值(4 位小数字符串,来自 powercloud basic.gsz 原值)
  estimateGrowthRate: number | null // 估算涨跌幅(%)
  estimateDate: string // 估值日期(yyyy-mm-dd)
  publishedNav: string | null // 已确认官方净值(盘前/QDII 为 null)
  publishedGrowthRate: number | null // 已确认官方涨跌幅(%)
  yesterdayNav: string | null // 上一交易日单位净值(来自 powercloud basic.dwjz)
  yesterdayDate: string // 上一交易日日期
  quoteSource: 'realtime' | 'history_fallback' | null // 数据来源标识
  message: string // 状态说明(如「QDII暂无盘中估值,展示最近净值」)
  intraday: IntradayPoint[] // 盘中分时数据,非交易时段为空数组
  holdingsDate: string | null // 重仓股持仓报告期(yyyy-mm-dd)
  holdings: {
    code: string // 股票代码
    name: string // 股票名称
    pct: string // 占净值比例(带 % 字符串)
    price: string | null // 最新价
    change_pct: string | null // 当日涨跌幅(%数值字符串)
    quote_date: string | null // 行情日期
    quote_time: string | null // 行情时间(HH:mm:ss,与 quote_date 组合即行情更新时间)
    [key: string]: unknown
  }[] | null // 重仓股明细,无股票仓位的基金为 null/空数组
}

// 天天基金网历史净值API返回的类型
interface HistoryAPIResponse {
  Data: {
    LSJZList: HistoryRecord[]
  }
  TotalCount: number
}

interface HistoryRecord {
  FSRQ: string // 净值日期
  DWJZ: string // 单位净值
  JZZZL: string // 净值增长率
}

// 获取场内基金的实时价格
export async function fetchFundLofPrice(fundCode: string): Promise<FundRealtimeData | null> {
  // 自动判断交易所前缀 (6开头为沪市sh, 其他为深市sz)
  const prefix = fundCode.startsWith('6') ? 'sh' : 'sz'
  const url = `https://qt.gtimg.cn/q=${prefix}${fundCode}`

  try {
    // 将 responseType 从 'json' 或 'text' 改为 'arrayBuffer'
    // 这样 ofetch 就会返回原始的、未经解码的 ArrayBuffer 数据。
    const responseBuffer = await $fetch<ArrayBuffer>(url, {
      responseType: 'arrayBuffer',
      headers: { Referer: 'https://gu.qq.com/' },
    })

    // 使用 iconv-lite 将 GBK 编码的 Buffer 解码为 UTF-8 字符串
    const responseText = iconv.decode(Buffer.from(responseBuffer), 'GBK')
    const parts = responseText.split('~')
    if (parts.length < 33 || !parts[3]) // 简单验证返回数据是否有效
      return null

    // 现在这里的 parts[1] 就是正确解码后的中文字符串了
    const name = parts[1]!
    const code = parts[2]!
    const currentPrice = parts[3]!
    const yesterdayClose = parts[4]! // 昨日收盘价
    const percentageChange = parts[32]!
    const updateTimeStr = parts[30]! // 格式: YYYYMMDDHHmmss

    // 格式化时间
    const year = updateTimeStr.substring(0, 4)
    const month = updateTimeStr.substring(4, 6)
    const day = updateTimeStr.substring(6, 8)
    const hour = updateTimeStr.substring(8, 10)
    const minute = updateTimeStr.substring(10, 12)
    const second = updateTimeStr.substring(12, 14)
    const updateTime = `${year}-${month}-${day} ${hour}:${minute}:${second}`

    return {
      name,
      code,
      yesterdayNav: yesterdayClose,
      estimateNav: currentPrice,
      percentageChange,
      updateTime,
    }
  }
  catch (error) {
    console.error(`获取LOF基金 ${fundCode} 价格失败:`, error)
    return null
  }
}

/**
 * 获取开放式基金的盘中实时估值。
 *
 * 数据来源为 Python 服务 (`NUXT_STRATEGY_API_URL/fund/realtime/{code}`，
 * 底层调用东方财富盘中估值表，进程内缓存 60s)。
 *
 * 注意:旧的天天基金 JSONP 接口 `fundgz.1234567.com.cn/js/{code}.js` 已废弃失效。
 * 注意:QDII/货币型/部分小众基金不在东财盘中估值列表,接口会返回 404,这里优雅降级为 null。
 */
export async function fetchFundRealtimeEstimate(fundCode: string): Promise<FundRealtimeData | null> {
  const config = useRuntimeConfig()
  const url = `${config.strategyApiUrl}/fund/realtime/${fundCode}`

  try {
    const data = await $fetch<StrategyRealtimeResponse>(url)

    // 涨跌幅优先取已公布的官方值(收盘后),否则取估算值
    const growthRate = data.publishedGrowthRate ?? data.estimateGrowthRate
    // 净值优先取已公布的官方值(收盘后),否则取估算值
    const nav = data.publishedNav ?? data.estimateNav

    // 估值日期仅到日级,无分钟级时间戳;用服务端当前时刻以保留"X 分钟前更新"语义
    return {
      name: data.name,
      code: data.code,
      yesterdayNav: data.yesterdayNav ?? '',
      estimateNav: nav ?? '',
      percentageChange: growthRate != null ? String(growthRate) : '',
      updateTime: new Date().toISOString(),
    }
  }
  catch (error: any) {
    // 404 = 该基金不在盘中估值列表(QDII/货币型等),属于预期情况,降级为 warn
    const status = error?.response?.status || error?.statusCode
    if (status === 404)
      console.warn(`[RealtimeEstimate] 基金 ${fundCode} 不在盘中估值列表(可能是 QDII/货币型),已跳过。`)
    else
      console.error(`[RealtimeEstimate] 获取基金 ${fundCode} 实时估值失败:`, error?.message || error)
    return null
  }
}

/**
 * 获取开放式基金的盘中实时估值(原始完整响应,供展示用)。
 *
 * 与 fetchFundRealtimeEstimate 的区别:
 * - 本函数原样返回 powercloud 完整响应,包含 intraday 分时数据、quoteSource/message 状态标识
 * - 不做字段裁剪与降级映射,适合「盘中估值展示页」直接消费
 * - 仅用于展示,不落库;定时同步任务仍用 fetchFundRealtimeEstimate
 *
 * 错误会向上抛出(状态码透传),由调用方(API 路由)处理:
 * - 400: 代码格式错误(非 6 位数字)——由 API 路由层先行校验,本函数假定代码已合规
 * - 404: 基金不存在(powercloud 返回 name==code 且 gsz 占位),或数据源不可用
 * - 5xx: 服务故障
 */
export async function fetchFundRealtimeRaw(fundCode: string): Promise<StrategyRealtimeResponse> {
  const config = useRuntimeConfig()
  const url = `${config.strategyApiUrl}/fund/realtime/${fundCode}`
  // ofetch 默认对非 2xx 抛出带 statusCode 的错误,这里原样抛出供路由层透传
  return await $fetch<StrategyRealtimeResponse>(url)
}

/** Python 服务 /stocks/realtime 返回的单只股票实时行情 */
export interface StockRealtimeQuote {
  code: string // 股票代码(A 股 6 位/港股 5 位,如 00700)
  name: string // 股票名称
  price: number | null // 最新价(停牌等无行情为 null)
  changePct: number | null // 当日涨跌幅(%,停牌等无行情为 null)
  date: string // 行情日期(yyyy-mm-dd,北京时间)
  time: string // 行情时间(HH:mm:ss,北京时间)
}

/** Python 服务 /stocks/realtime 的完整响应结构 */
export interface StocksRealtimeResponse {
  count: number
  stocks: StockRealtimeQuote[]
  missing: string[] // 不支持的市场(北交所/美股)、非法代码或拉取失败的代码
}

/**
 * 批量获取 A 股/港股股票实时行情(供重仓股加权自算估值/详情页行情快照)。
 *
 * 数据来源为 Python 服务 (`NUXT_STRATEGY_API_URL/stocks/realtime`，
 * 底层腾讯行情 qt.gtimg.cn,A 股 sh/sz 前缀、港股 hk 前缀,
 * 进程内 60s TTL 缓存,单次上限 200 只)。
 *
 * 任何错误(接口未部署 404 / 服务不可用 / 超时)都返回 null,
 * 由调用方降级处理(自算跳过本轮/详情页行情字段置 null)。
 */
export async function fetchStocksRealtime(codes: string[], opts?: { timeoutMs?: number }): Promise<StockRealtimeQuote[] | null> {
  if (codes.length === 0)
    return []

  const config = useRuntimeConfig()
  const url = `${config.strategyApiUrl}/stocks/realtime`

  try {
    const data = await $fetch<StocksRealtimeResponse>(url, {
      params: { codes: codes.join(',') },
      timeout: opts?.timeoutMs ?? 15_000,
    })
    if (data.missing.length > 0)
      console.warn(`[StockRealtime] ${data.missing.length} 只股票无行情:`, data.missing.slice(0, 10).join(','))
    return data.stocks
  }
  catch (error: any) {
    const status = error?.response?.status || error?.statusCode
    if (status === 404)
      console.warn('[StockRealtime] /stocks/realtime 接口不存在(Python 服务未部署新版本),自算估值跳过。')
    else
      console.error(`[StockRealtime] 批量获取 ${codes.length} 只股票行情失败:`, error?.message || error)
    return null
  }
}

/** Python 服务 /gold/realtime 返回的单只贵金属行情(SGE 沪金99 等) */
export interface GoldRealtimeQuote {
  code: string // 贵金属代码(如 AU9999 沪金99 / AUTD 黄金延期)
  name: string // 合约名称(如 "沪金99")
  price: number | null // 最新价(元/克,未开盘/无行情为 null)
  prevClose: number | null // 昨收(元/克)
  changePct: number | null // 当日涨跌幅(%,按昨收计算,无昨收为 null)
  date: string // 行情日期(yyyy-mm-dd,北京时间)
  time: string // 行情时间(HH:mm:ss,北京时间)
}

/** Python 服务 /gold/realtime 的完整响应结构 */
export interface GoldRealtimeResponse {
  count: number
  quotes: GoldRealtimeQuote[]
  missing: string[] // 不支持的贵金属代码或拉取失败的代码
}

/**
 * 批量获取上海黄金交易所贵金属实时行情(供黄金类基金自算估值)。
 *
 * 数据来源为 Python 服务 (`NUXT_STRATEGY_API_URL/gold/realtime`，
 * 底层新浪财经贵金属行情 gds_ 接口,涨跌幅按昨收计算,SGE 夜市归属
 * 次一交易日,涨跌幅天然包含隔夜跳空,与黄金基金净值口径一致;
 * 进程内 60s TTL 缓存)。
 *
 * 任何错误(接口未部署 404 / 服务不可用 / 超时)都返回 null,
 * 由调用方降级处理(黄金基金自算跳过本轮)。
 */
export async function fetchGoldRealtime(codes: string[], opts?: { timeoutMs?: number }): Promise<GoldRealtimeQuote[] | null> {
  if (codes.length === 0)
    return []

  const config = useRuntimeConfig()
  const url = `${config.strategyApiUrl}/gold/realtime`

  try {
    const data = await $fetch<GoldRealtimeResponse>(url, {
      params: { codes: codes.join(',') },
      timeout: opts?.timeoutMs ?? 15_000,
    })
    if (data.missing.length > 0)
      console.warn(`[GoldRealtime] ${data.missing.length} 个贵金属合约无行情:`, data.missing.join(','))
    return data.quotes
  }
  catch (error: any) {
    const status = error?.response?.status || error?.statusCode
    if (status === 404)
      console.warn('[GoldRealtime] /gold/realtime 接口不存在(Python 服务未部署新版本),黄金基金自算估值跳过。')
    else
      console.error(`[GoldRealtime] 批量获取贵金属行情失败:`, error?.message || error)
    return null
  }
}

/**
 * 获取基金的历史净值数据
 * @param fundCode 基金代码
 * @param startDate 开始日期 'YYYY-MM-DD'
 * @param endDate 结束日期 'YYYY-MM-DD'
 */export async function fetchFundHistory(fundCode: string, startDate?: string, endDate?: string): Promise<HistoryRecord[]> {
  const url = 'http://api.fund.eastmoney.com/f10/lsjz'
  const allData: HistoryRecord[] = []
  let pageIndex = 1
  const pageSize = 50

  while (true) {
    try {
      const response = await $fetch<HistoryAPIResponse>(url, {
        params: {
          fundCode,
          pageIndex,
          pageSize,
          startDate: startDate || '',
          endDate: endDate || '',
          _: Date.now(),
        },
        headers: {
          Referer: `http://fundf10.eastmoney.com/jjjz_${fundCode}.html`,
        },
      })

      const records = response.Data.LSJZList
      if (!records || records.length === 0)
        break

      allData.push(...records)

      if (allData.length >= response.TotalCount)
        break

      pageIndex++
      await new Promise(resolve => setTimeout(resolve, 200)) // 避免请求过于频繁
    }
    catch (error) {
      console.error(`获取基金 ${fundCode} 历史数据失败 (Page ${pageIndex}):`, error)
      break // 出错则停止获取
    }
  }
  return allData
}

// 定义单个指数的数据结构
export interface MarketIndexData {
  code: string
  name: string
  value: number
  changeAmount: number
  changeRate: number
  /** 报价时间 HH:mm:ss（交易所当地时区，兼容旧缓存的紧凑格式已归一化） */
  time: string
  /** 报价完整时间 yyyy-MM-dd HH:mm:ss（交易所当地时区） */
  datetime: string | null
  /** 报价日期 yyyy-MM-dd（= datetime 的日期部分，供 MCP/前端标注 as_of） */
  as_of: string | null
  /** 是否延迟行情（日经期货、COMEX 黄金、NYMEX 原油等为延迟） */
  delayed: boolean
  chartData: [string, number][] // 用于分时图的数据点 [时间, 价格]
}

/**
 * 解析行情源时间字段。上游存在三种格式：
 * - A股: "20260918153802" (紧凑数字)
 * - 港股: "2026/09/18 15:23:54"
 * - 美股/期货: "2026-09-17 16:35:03"
 * 统一归一化为 { date: yyyy-MM-dd, time: HH:mm:ss, datetime }。
 */
export function parseQuoteTime(raw: string): { date: string, time: string, datetime: string } | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 14)
    return null
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  const time = `${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`
  return { date, time, datetime: `${date} ${time}` }
}

export async function fetchMarketIndexes(codes: string[]): Promise<MarketIndexData[]> {
  if (codes.length === 0)
    return []

  const url = `https://qt.gtimg.cn/q=${codes.join(',')}`
  // console.warn('[DEBUG] Fetching market indexes...', url)
  try {
    const responseBuffer = await $fetch<ArrayBuffer>(url, {
      responseType: 'arrayBuffer',
    })
    const responseText = iconv.decode(Buffer.from(responseBuffer), 'GBK')
    const lines = responseText.split(';\n').filter(line => line.trim())

    const promises = lines.map(async (line) => {
      const parts = line.split('~')
      if (parts.length < 5) {
        console.warn('[DEBUG] Line skipped: Not enough parts.')
        return null
      }

      // 代码解析
      const codeWithPrefix = parts[0]!.split('=')[0]!
      const code = codeWithPrefix.substring(2)

      // 获取分时图数据
      const chartUrl = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`

      let chartData: [string, number][] = []
      try {
        const chartResponse = await $fetch<any>(chartUrl, { responseType: 'json' })

        // --- 核心调试区域 ---

        // 1. 检查 chartResponse.data 是否存在
        if (!chartResponse.data) {
          console.warn(`[DEBUG] WARN: chartResponse.data is undefined for code '${code}'.`)
        }
        // 2. 检查 chartResponse.data[code] 是否存在
        else if (!chartResponse.data[code]) {
          console.warn(`[DEBUG] WARN: chartResponse.data['${code}'] is undefined. Available keys:`, Object.keys(chartResponse.data))
        }
        // 3. 检查更深层的路径
        else {
          const minuteDataArray = chartResponse.data[code]?.data?.data

          if (Array.isArray(minuteDataArray)) {
            chartData = minuteDataArray.map((p: string) => {
              const pointParts = p.split(' ')
              const timeStr = pointParts[0]!
              const priceStr = pointParts[1]!
              return [`${timeStr.slice(0, 2)}:${timeStr.slice(2)}`, Number.parseFloat(priceStr)]
            })
          }
          else {
            console.warn(`[DEBUG] WARN: minuteDataArray is not an array. Type is: ${typeof minuteDataArray}. Value:`, minuteDataArray)
          }
        }
        // --------------------
      }
      catch (e: any) {
        console.error(`[DEBUG] ERROR fetching or parsing chart data for ${code}:`, e.message)
      }

      // 为了调试，我们先返回一个包含 chartData 长度的对象
      // parts[0] 形如 v_sh000001="1 / v_hkHSI="100 / v_fuNIY="delay，= 后标记行情类型
      const quoteKindFlag = parts[0]!.split('=')[1] ?? ''
      const parsedTime = parts[30] ? parseQuoteTime(parts[30]) : null
      const result = {
        code,
        name: parts[1]!,
        value: Number.parseFloat(parts[3]!),
        changeAmount: Number.parseFloat(parts[31]!),
        changeRate: Number.parseFloat(parts[32]!),
        time: parsedTime?.time ?? 'N/A',
        datetime: parsedTime?.datetime ?? null,
        as_of: parsedTime?.date ?? null,
        delayed: quoteKindFlag === 'delay',
        chartData,
      }
      return result
    })

    const results = await Promise.all(promises)
    return results.filter(Boolean) as MarketIndexData[]
  }
  catch (error) {
    console.error(`[DEBUG] CRITICAL ERROR in fetchMarketIndexes:`, error)
    return []
  }
}
