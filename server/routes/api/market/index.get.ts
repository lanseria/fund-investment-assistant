// server/routes/api/market/index.get.ts
import { getCachedMarketData } from '~~/server/utils/market'

export default defineEventHandler(async () => {
  return await getCachedMarketData()
})
