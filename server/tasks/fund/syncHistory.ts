/* eslint-disable no-console */
import dayjs from 'dayjs'
import { desc, eq, gt } from 'drizzle-orm'
import { holdings, navHistory } from '~~/server/database/schemas'
import { fetchFundHistory } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'

export default defineTask({
  meta: {
    name: 'fund:syncHistory',
    description: '每日同步所有持仓基金的历史净值并校准金额',
  },
  async run() {
    console.log('开始执行基金历史净值同步任务...')
    const db = useDb()
    const allHoldings = await db.query.holdings.findMany()

    for (const holding of allHoldings) {
      try {
        const latestRecord = await db.query.navHistory.findFirst({
          where: eq(navHistory.code, holding.code),
          orderBy: [desc(navHistory.navDate)],
        })

        const startDate = latestRecord ? dayjs(latestRecord.navDate).add(1, 'day').format('YYYY-MM-DD') : undefined

        const historyData = await fetchFundHistory(holding.code, startDate)
        if (!historyData.length)
          continue

        const newRecords = historyData
          .map(r => ({
            code: holding.code,
            navDate: r.FSRQ,
            nav: r.DWJZ,
          }))
          .filter(r => Number(r.nav) > 0)

        if (newRecords.length > 0) {
          await db.insert(navHistory).values(newRecords).onConflictDoNothing()

          // 更新持仓的最新净值和金额
          const latestNav = Number(newRecords[0]!.nav) // API返回是降序的
          const newAmount = Number(holding.shares) * latestNav

          await db.update(holdings).set({
            yesterdayNav: latestNav.toFixed(4),
            holdingAmount: newAmount.toFixed(2),
          }).where(eq(holdings.code, holding.code))
        }
      }
      catch (e) {
        console.error(`同步基金 ${holding.code} 历史数据时出错:`, e)
      }
    }
    console.log('基金历史净值同步任务完成。')
    return { result: 'Success' }
  },
})
