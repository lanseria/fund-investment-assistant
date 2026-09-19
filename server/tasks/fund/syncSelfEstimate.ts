// server/tasks/fund/syncSelfEstimate.ts
import { format } from 'date-fns'
import { syncAllFundsSelfEstimates } from '~~/server/utils/selfEstimateService'
import { isTradingDay, isTradingHours } from '~~/shared/market'

export default defineTask({
  meta: {
    name: 'fund:syncSelfEstimate',
    description: '盘中按重仓股行情加权自算基金估值 (写 funds 表 self_estimate_* 字段,与官方估算并存)',
  },
  async run() {
    // --- 交易日检查 ---
    const check = isTradingDay()
    if (!check.isTrading) {
      console.warn(`[syncSelfEstimate] 今日 (${format(new Date(), 'yyyy-MM-dd')}) 跳过: ${check.reason}`)
      return { result: 'Skipped', reason: check.reason }
    }

    // --- 交易时段检查 (cron 覆盖 9-15 点,非交易时段直接跳过) ---
    if (!isTradingHours()) {
      return { result: 'Skipped', reason: '非交易时段' }
    }

    const result = await syncAllFundsSelfEstimates()
    return {
      result: `Success (total: ${result.total}, success: ${result.success}, failed: ${result.failed}, skipped: ${result.skipped}, stocks: ${result.stockCount})`,
    }
  },
})
