// server/utils/market.ts
/* eslint-disable no-console */
import type { MarketIndexData } from './dataFetcher'
import { fetchMarketIndexes } from './dataFetcher'
import { emitter } from './emitter'

// 定义所有需要监控的指数代码
const ALL_INDEX_CODES = [
  // A 组
  'sh000001', // 上证指数
  'sh000300', // 沪深300
  'sh000016', // 上证50
  'sh000003', // B股指数
  'sh000688', // 科创50
  // B 组
  'sz399001', // 深证成指
  'sz399006', // 创业板指
  'sz399106', // 深证综指
  'sz399003', // 成份B指
  // C 组
  'hf_IF0', // 中金所IF当月
  'hkHSI', // 恒生指数
  'usDJI', // 道琼斯
  'usIXIC', // 纳斯达克
  'int_ni225', // 日经225
  'hf_DINIW', // 美元指数
  'hf_GC0', // COMEX黄金
  'hf_CL0', // NYMEX原油
  'hf_USDCNH', // 美元离岸人民币
]

let isPolling = false
let marketDataCache: Record<string, MarketIndexData> = {}
let pollingInterval: NodeJS.Timeout | null = null

async function pollMarketData() {
  try {
    const data = await fetchMarketIndexes(ALL_INDEX_CODES)
    // 更新缓存
    marketDataCache = data.reduce((acc, index) => {
      acc[index.code] = index
      return acc
    }, {} as Record<string, MarketIndexData>)

    // 广播事件
    emitter.emit('market:updated', marketDataCache)
  }
  catch (e) {
    console.error('[Market Polling] Error fetching market data:', e)
  }
}

// 导出一个函数，确保轮询只启动一次
export function startMarketPolling() {
  if (isPolling)
    return

  isPolling = true
  console.log('✅ [Market Polling] Starting market data polling service...')
  // 立即执行一次
  pollMarketData()
  // 每3秒轮询一次
  pollingInterval = setInterval(pollMarketData, 3000)
}

// 可选：停止轮询的函数
export function stopMarketPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    isPolling = false
    console.log('🛑 [Market Polling] Stopped market data polling service.')
  }
}
