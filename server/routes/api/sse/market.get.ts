/* eslint-disable no-console */
// server/routes/api/sse/market.get.ts
import type { MarketIndexData } from '~~/server/utils/dataFetcher'
import { emitter } from '~~/server/utils/emitter'

export default defineEventHandler((event) => {
  const eventStream = createEventStream(event)

  const sendUpdate = (data: Record<string, MarketIndexData>) => {
    eventStream.push(JSON.stringify(data))
  }

  // 监听广播事件
  emitter.on('market:updated', sendUpdate)

  // 连接关闭时，移除监听器
  eventStream.onClosed(() => {
    emitter.off('market:updated', sendUpdate)
    console.log('[SSE Market] Connection closed. Listener removed.')
  })

  // 立即发送一次当前缓存的数据，防止新连接需要等待下一次轮询
  // (这里可以从 market.ts 中导出一个 getMarketCache 函数来获取)
  // 为简单起见，我们让客户端等待第一次推送

  console.log('[SSE Market] New connection established.')
  return eventStream.send()
})
