// server/tasks/fund/syncSelfEstimate.ts
import { format } from 'date-fns'
import { syncAllFundsSelfEstimates } from '~~/server/utils/selfEstimateService'
import { isQuoteRefreshHours, isTradingDay } from '~~/shared/market'

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

    // --- 行情刷新时段检查 (cron 覆盖 9-16 点;A 股收盘后港股仍在交易,统一放宽到 16:30) ---
    if (!isQuoteRefreshHours()) {
      return { result: 'Skipped', reason: '非行情刷新时段' }
    }

    const result = await syncAllFundsSelfEstimates()
    return {
      result: `Success (total: ${result.total}, success: ${result.success}, failed: ${result.failed}, skipped: ${result.skipped}, stocks: ${result.stockCount})`,
    }
  },
})
