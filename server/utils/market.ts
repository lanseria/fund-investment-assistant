// server/utils/market.ts
/* eslint-disable no-console */
import type { MarketIndexData } from './dataFetcher'
import { ALL_INDEX_CODES } from '~~/shared/market'
import { fetchMarketIndexes } from './dataFetcher'
import { emitter } from './emitter'

let isPolling = false
let pollingInterval: NodeJS.Timeout | null = null
// v2：MarketIndexData 新增 datetime/as_of/delayed 字段，旧缓存缺少这些字段，直接换 key 作废旧数据
const CACHE_KEY = 'market:indexes:v2'

/**
 * 获取缓存的市场数据 (Record<code, data>)
 * 如果缓存不存在，尝试立即抓取一次
 */
export async function getCachedMarketData(): Promise<Record<string, MarketIndexData>> {
  const storage = useStorage('redis')
  let data = await storage.getItem<Record<string, MarketIndexData>>(CACHE_KEY)

  if (!data) {
    // 如果 Redis 中没有数据（例如刚启动），则主动抓取一次
    console.log('[Market] Cache miss, fetching immediately...')
    try {
      const rawList = await fetchMarketIndexes(ALL_INDEX_CODES)
      data = rawList.reduce((acc, index) => {
        acc[index.code] = index
        return acc
      }, {} as Record<string, MarketIndexData>)

      await storage.setItem(CACHE_KEY, data)
    }
    catch (e) {
      console.error('[Market] Failed to fetch data on cache miss:', e)
      return {}
    }
  }
  return data || {}
}

async function pollMarketData() {
  try {
    const rawList = await fetchMarketIndexes(ALL_INDEX_CODES)

    // 转换为 Map 结构方便查找和前端使用
    const dataMap = rawList.reduce((acc, index) => {
      acc[index.code] = index
      return acc
    }, {} as Record<string, MarketIndexData>)

    // 1. 存入 Redis
    const storage = useStorage('redis')
    await storage.setItem(CACHE_KEY, dataMap)

    // 2. 广播事件 (用于 SSE 推送)
    emitter.emit('market:updated', dataMap)
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
  console.log('✅ [Market Polling] Starting market data polling service (Interval: 60s)...')

  // 立即执行一次
  pollMarketData()

  // 修改为 60秒 (60000ms) 轮询一次
  pollingInterval = setInterval(pollMarketData, 60000)
}

// 可选：停止轮询的函数
export function stopMarketPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    isPolling = false
    console.log('🛑 [Market Polling] Stopped market data polling service.')
  }
}
