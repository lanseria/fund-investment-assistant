// server/tasks/sector/syncCapital.ts
/* eslint-disable no-console */
import { format } from 'date-fns'
import { syncSectorCapitalSnapshot } from '~~/server/utils/sectorSnapshot'
import { isTradingDay } from '~~/shared/market'

/**
 * 板块主力资金快照任务。
 * 与 syncEstimate 共用同一调度 (盘中 9:30-16:30 每半小时)，盘中持续抓取并落库。
 */
export default defineTask({
  meta: {
    name: 'sector:syncCapital',
    description: '抓取所有已绑定板块的当日主力资金快照并落库',
  },
  async run() {
    // --- 交易日检查 ---
    const check = isTradingDay()
    if (!check.isTrading) {
      console.log(`[sector:syncCapital] 今日 (${format(new Date(), 'yyyy-MM-dd')}) 跳过: ${check.reason}`)
      return { result: 'Skipped', reason: check.reason }
    }

    console.log('开始执行板块主力资金快照任务...')
    try {
      const result = await syncSectorCapitalSnapshot()
      console.log(`板块主力资金快照任务完成：绑定 ${result.total} 个，保存 ${result.saved} 条，跳过 ${result.skipped} 个。`)
      return { result: 'Success', ...result }
    }
    catch (e) {
      console.error('板块主力资金快照任务失败:', e)
      return { result: 'Failed' }
    }
  },
})
