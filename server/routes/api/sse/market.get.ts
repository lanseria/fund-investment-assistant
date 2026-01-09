/* eslint-disable no-console */
// server/routes/api/sse/market.get.ts
import type { MarketIndexData } from '~~/server/utils/dataFetcher'
import { emitter } from '~~/server/utils/emitter'
import { getCachedMarketData } from '~~/server/utils/market'

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event)

  const sendUpdate = (data: Record<string, MarketIndexData>) => {
    eventStream.push(JSON.stringify(data))
  }

  // 监听广播事件 (每分钟轮询触发)
  emitter.on('market:updated', sendUpdate)

  // 连接关闭时，移除监听器
  eventStream.onClosed(() => {
    emitter.off('market:updated', sendUpdate)
    console.log('[SSE Market] Connection closed. Listener removed.')
  })

  console.log('[SSE Market] New connection established.')

  // [新增] 连接建立后，立即从 Redis 获取并推送一次最新数据
  // 避免用户等待下一个 1 分钟周期
  try {
    const cachedData = await getCachedMarketData()
    if (Object.keys(cachedData).length > 0) {
      sendUpdate(cachedData)
    }
  }
  catch (e) {
    console.error('[SSE Market] Failed to send initial data:', e)
  }

  return eventStream.send()
})
