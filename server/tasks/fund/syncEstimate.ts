/* eslint-disable no-console */
import { useDb } from '~~/server/utils/db'
import { syncSingleFundEstimate } from '~~/server/utils/holdings'

export default defineTask({
  meta: {
    name: 'fund:syncEstimate',
    description: '盘中定时同步所有持仓基金的实时估值',
  },
  async run() {
    console.log('开始执行基金实时估值同步任务...')
    const db = useDb()
    const allHoldings = await db.query.holdings.findMany()

    for (const holding of allHoldings)
      await syncSingleFundEstimate(holding.code)

    console.log('基金实时估值同步任务完成。')
    return { result: 'Success' }
  },
})
