// server/utils/market.ts
/* eslint-disable no-console */
import type { MarketIndexData } from './dataFetcher'
import { ALL_INDEX_CODES } from '~~/shared/market'
import { fetchMarketIndexes } from './dataFetcher'
import { emitter } from './emitter'

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
