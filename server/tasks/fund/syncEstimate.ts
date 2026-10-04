// server/tasks/fund/syncEstimate.ts
import { format } from 'date-fns'
import { getHolidayRanges } from '~~/server/utils/holidayService'
import { syncAllFundsSelfEstimates } from '~~/server/utils/selfEstimateService'
import { isQuoteRefreshHours, isTradingDay } from '~~/shared/market'

export default defineTask({
  meta: {
    name: 'fund:syncEstimate',
    description: '盘中同步所有基金估值 (重仓股行情加权 + 黄金基金按金价 Au9999 + 场内/LOF 按场内价,写 funds 表主估值字段)',
  },
  async run() {
    // --- 交易日检查 (节假日数据来自数据库 market_holidays) ---
    const check = isTradingDay(undefined, await getHolidayRanges())
    if (!check.isTrading) {
      console.warn(`[syncEstimate] 今日 (${format(new Date(), 'yyyy-MM-dd')}) 跳过: ${check.reason}`)
      return { result: 'Skipped', reason: check.reason }
    }

    // --- 行情刷新时段检查 (cron 覆盖 9-16 点;A 股收盘后港股仍在交易,统一放宽到 16:30) ---
    if (!isQuoteRefreshHours()) {
      return { result: 'Skipped', reason: '非行情刷新时段' }
    }

    const result = await syncAllFundsSelfEstimates()
    // 任务完成后，通过 mitt 发出事件通知
    if (result.success > 0) {
      try {
        emitter.emit('holdings:updated')
      }
      catch (e) {
        console.error(`[Task] Failed to emit event:`, e)
      }
    }

    return {
      result: `Success (total: ${result.total}, success: ${result.success}, failed: ${result.failed}, skipped: ${result.skipped}, stocks: ${result.stockCount}, gold: ${result.goldCount}, lof: ${result.lofCount})`,
    }
  },
})
