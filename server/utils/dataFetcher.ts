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

// 天天基金网实时估值返回的类型
interface RealtimeEstimateResponse {
  fundcode: string
  name: string
  jzrq: string // 净值日期
  dwjz: string // 单位净值
  gsz: string // 估算值
  gszzl: string // 估算涨跌率
  gztime: string // 估值时间
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

export async function fetchFundRealtimeEstimate(fundCode: string): Promise<FundRealtimeData | null> {
  const url = `http://fundgz.1234567.com.cn/js/${fundCode}.js`

  try {
    const responseText = await $fetch<string>(url, {
      responseType: 'text',
      headers: { Referer: 'http://fund.eastmoney.com/' },
    })

    // 现在 responseText 保证是一个字符串，可以安全地调用 .replace()
    const jsonStr = responseText.replace('jsonpgz(', '').replace(');', '')
    const parsedData: RealtimeEstimateResponse = JSON.parse(jsonStr)

    // 返回统一的数据结构
    return {
      name: parsedData.name,
      code: parsedData.fundcode,
      yesterdayNav: parsedData.dwjz,
      estimateNav: parsedData.gsz,
      percentageChange: parsedData.gszzl,
      updateTime: parsedData.gztime,
    }
  }
  catch (error: any) {
    console.error(`[DEBUG] !!! ERROR fetching fund ${fundCode} !!!`)
    if (error.response) {
      console.error('[DEBUG] Error Response Status:', error.response.status)
      console.error('[DEBUG] Error Response Status Text:', error.response.statusText)
      console.error('[DEBUG] Error Response Body:', error.response._data)
    }
    else {
      console.error('[DEBUG] Generic Error:', error.message)
      console.error('[DEBUG] Full Error Object:', error)
    }
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
