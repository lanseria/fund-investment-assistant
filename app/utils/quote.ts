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

// 扩展 Window 类型
declare global {
  interface Window {
    jsonpgz?: (data: ClientEstimateData) => void
  }
}

/**
 * 抓取单个基金的实时估值 (浏览器端执行)
 * 使用 JSONP 原理动态创建 script 标签
 * 天天基金接口返回: jsonpgz({...});
 */
export async function fetchClientEstimate(fundCode: string): Promise<ClientEstimateData | null> {
  return new Promise((resolve) => {
    const script = document.createElement('script')
    const timestamp = Date.now()

    // 保存原有的回调函数（如果存在）
    const originalJsonpgz = window.jsonpgz

    // 定义全局回调
    window.jsonpgz = (data: ClientEstimateData) => {
      resolve(data)
      // 清理
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
      // 恢复原有的回调函数
      window.jsonpgz = originalJsonpgz
    }

    // 处理加载失败的情况
    script.onerror = () => {
      console.warn(`[ClientFetch] Failed to load script for ${fundCode}`)
      resolve(null)
      // 清理
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
      // 恢复原有的回调函数
      window.jsonpgz = originalJsonpgz
    }

    script.src = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${timestamp}`
    document.body.appendChild(script)

    // 超时处理，防止内存泄漏
    setTimeout(() => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
        window.jsonpgz = originalJsonpgz
        resolve(null)
      }
    }, 10000) // 10秒超时
  })
}
