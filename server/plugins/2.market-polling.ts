// server/plugins/2.market-polling.ts
import { startMarketPolling } from '~~/server/utils/market'

export default defineNitroPlugin(() => {
  // 跟随调度器总开关：开发模式下默认不启动 60s 市场轮询，避免本地 dev 频繁请求外部接口
  const { disableScheduler } = useRuntimeConfig()
  if (disableScheduler) {
    console.warn('[Market Polling] Skipped (DISABLE_SCHEDULER is enabled).')
    return
  }

  // 在 Nitro 启动时启动市场数据轮询
  startMarketPolling()
})
