// server/tasks/fund/syncHistory.ts
/* eslint-disable no-console */
import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { funds, navHistory } from '~~/server/database/schemas'
import { fetchFundHistory } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'

export default defineTask({
  meta: {
    name: 'fund:syncHistory',
    description: '每日同步所有基金的历史净值 (更新 navHistory 和 funds 表)',
  },
  async run() {
    console.log('开始执行基金历史净值同步任务...')
    const db = useDb()
    // 从 funds 表获取所有需要同步的基金
    const allFunds = await db.query.funds.findMany()

    for (const fund of allFunds) {
      try {
        const latestRecord = await db.query.navHistory.findFirst({
          where: eq(navHistory.code, fund.code),
          orderBy: [desc(navHistory.navDate)],
        })

        const startDate = latestRecord ? dayjs(latestRecord.navDate).add(1, 'day').format('YYYY-MM-DD') : undefined
        const historyData = await fetchFundHistory(fund.code, startDate)

        if (!historyData.length)
          continue

        const newRecords = historyData
          .map(r => ({ code: fund.code, navDate: r.FSRQ, nav: r.DWJZ }))
          .filter(r => Number(r.nav) > 0)

        if (newRecords.length > 0) {
          await db.insert(navHistory).values(newRecords).onConflictDoNothing()

          // 更新 funds 表的昨日净值
          const latestNav = newRecords[0]!.nav
          await db.update(funds)
            .set({ yesterdayNav: latestNav })
            .where(eq(funds.code, fund.code))
        }
      }
      catch (e) {
        console.error(`同步基金 ${fund.code} 历史数据时出错:`, e)
      }
    }
    console.log('基金历史净值同步任务完成。')
    return { result: 'Success' }
  },
})
