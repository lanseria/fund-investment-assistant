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
  const url = `http://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${timestamp}`

  try {
    // 尝试使用 fetch 获取文本
    // 注意：如果浏览器强制 CORS 且服务器不支持，这里可能会失败。
    // 但通常 fundgz 接口比较宽松，或者用户可能安装了 Allow CORS 插件，
    // 或者在开发环境下配置了 Proxy。如果是纯客户端环境，且无 Proxy，JSONP 是兜底方案。
    // 这里简单实现 fetch + 解析文本。
    const response = await fetch(url, {
      method: 'GET',
      // mode: 'no-cors' // 注意：no-cors 无法获取 response body，必须要是 cors 或非严格模式
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
