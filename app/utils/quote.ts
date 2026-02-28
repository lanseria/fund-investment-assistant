/**
 * 客户端专用的行情抓取工具
 * 直接在浏览器端发起请求，利用客户端分散的 IP 避免服务端被封
 */

interface ClientEstimateData {
  fundcode: string
  name: string
  gsz: string // 估算值
  gszzl: string // 估算增长率
  gztime: string // 估值时间
}

/**
 * 抓取单个基金的实时估值 (浏览器端执行)
 * 使用 JSONP 原理或 fetch (如果支持 CORS)
 * 天天基金接口通常返回 text/javascript: jsonpgz({...});
 */
export async function fetchClientEstimate(fundCode: string): Promise<ClientEstimateData | null> {
  const timestamp = Date.now()
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${timestamp}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
    })

    if (!response.ok)
      return null

    const text = await response.text()

    // 解析 jsonpgz({...});
    const match = text.match(/jsonpgz\((.*?)\);/)
    if (match && match[1]) {
      const data = JSON.parse(match[1]) as ClientEstimateData
      return data
    }
    return null
  }
  catch (error) {
    console.warn(`[ClientFetch] Failed to fetch ${fundCode}:`, error)
    return null
  }
}
