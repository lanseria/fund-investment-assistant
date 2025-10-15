// server/plugins/2.market-polling.ts
import { startMarketPolling } from '~~/server/utils/market'

export default defineNitroPlugin(() => {
  // 在 Nitro 启动时启动市场数据轮询
  startMarketPolling()
})
