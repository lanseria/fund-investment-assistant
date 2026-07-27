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

// Python 服务 /fund/realtime/{code} 的返回结构
interface StrategyRealtimeResponse {
  code: string
  name: string
  estimateNav: string | null // 估算单位净值(4 位小数字符串)
  estimateGrowthRate: number | null // 估算涨跌幅(%)
  estimateDate: string // 估值日期(仅日级)
  publishedNav: string | null // 当日官方净值(盘前为 null,收盘后公布)
  publishedGrowthRate: number | null // 当日官方涨跌幅(%)
  yesterdayNav: string | null // 上一交易日官方净值
  yesterdayDate: string
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
 * 获取基金的历史净值数据
 * @param fundCode 基金代码
 * @param startDate 开始日期 'YYYY-MM-DD'
 * @param endDate 结束日期 'YYYY-MM-DD'
 */
export async function fetchFundHistory(fundCode: string, startDate?: string, endDate?: string): Promise<HistoryRecord[]> {
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
  time: string
  chartData: [string, number][] // 用于分时图的数据点 [时间, 价格]
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
      const result = {
        code,
        name: parts[1]!,
        value: Number.parseFloat(parts[3]!),
        changeAmount: Number.parseFloat(parts[31]!),
        changeRate: Number.parseFloat(parts[32]!),
        time: parts[30] ? `${parts[30].substring(8, 10)}:${parts[30].substring(10, 12)}:${parts[30].substring(12, 14)}` : 'N/A',
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
