// server/tasks/fund/syncStockHoldings.ts
import { format } from 'date-fns'
import { useDb } from '~~/server/utils/db'
import { syncFundStockHoldings } from '~~/server/utils/stockHoldingService'

/** 逐基金同步的间隔(ms),仿 syncFundsList 防上游限流 */
const SYNC_DELAY = 1500

export default defineTask({
  meta: {
    name: 'fund:syncStockHoldings',
    description: '同步所有基金的重仓股持仓明细到 fund_stock_holdings 表 (季报口径,供自算估值)',
  },
  async run() {
    const db = useDb()
    const allFunds = await db.query.funds.findMany()

    let success = 0
    let failed = 0
    let empty = 0

    for (const [index, fund] of allFunds.entries()) {
      try {
        const result = await syncFundStockHoldings(fund.code)
        if (result.synced > 0)
          success++
        else
          empty++
        console.warn(`[syncStockHoldings] 基金 ${fund.code}(${fund.name}) 同步 ${result.synced} 条,报告期 ${result.reportDate ?? '无'}`)
      }
      catch (e) {
        failed++
        console.error(`[syncStockHoldings] 基金 ${fund.code} 重仓股同步失败:`, e)
      }

      // 如果不是最后一个,则暂停降低上游频率
      if (index < allFunds.length - 1)
        await new Promise(resolve => setTimeout(resolve, SYNC_DELAY))
    }

    // 持仓数据更新后触发一次自算估值,让新报告期数据尽快生效
    if (success > 0) {
      try {
        const { syncAllFundsSelfEstimates } = await import('~~/server/utils/selfEstimateService')
        const r = await syncAllFundsSelfEstimates()
        console.warn(`[syncStockHoldings] 持仓更新后自算估值: success=${r.success}, failed=${r.failed}, stocks=${r.stockCount}`)
      }
      catch (e) {
        console.error('[syncStockHoldings] 持仓更新后自算估值失败:', e)
      }
    }

    console.warn(`[syncStockHoldings] ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')} 完成: total=${allFunds.length}, success=${success}, empty=${empty}, failed=${failed}`)
    return { result: `Success (total: ${allFunds.length}, success: ${success}, empty: ${empty}, failed: ${failed})` }
  },
})
