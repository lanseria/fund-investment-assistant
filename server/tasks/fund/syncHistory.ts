/* eslint-disable no-console */
import type { holdings as HoldingsTable } from '~~/server/database/schemas'
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { holdings, navHistory } from '~~/server/database/schemas'
import { fetchFundHistory } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'

export default defineTask({
  meta: {
    name: 'fund:syncHistory',
    description: '每日同步所有持仓基金的历史净值并校准金额和收益',
  },
  async run() {
    console.log('开始执行基金历史净值同步任务(使用 BigNumber.js)...')
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
          .map(r => ({ code: holding.code, navDate: r.FSRQ, nav: r.DWJZ }))
          .filter(r => new BigNumber(r.nav).isGreaterThan(0))

        if (newRecords.length > 0) {
          await db.insert(navHistory).values(newRecords).onConflictDoNothing()

          // [核心修改] 使用 BigNumber.js 进行所有金融计算
          const latestNavBN = new BigNumber(newRecords[0]!.nav)
          const sharesBN = new BigNumber(holding.shares)
          const newHoldingAmountBN = sharesBN.times(latestNavBN)

          // 准备一个用于更新数据库的 payload 对象
          const updatePayload: Partial<typeof HoldingsTable.$inferInsert> = {
            yesterdayNav: latestNavBN.toFixed(4),
            holdingAmount: newHoldingAmountBN.toFixed(2),
          }

          // 如果该持仓记录了收益，则同步更新收益数据
          if (holding.holdingProfitAmount !== null && holding.holdingProfitAmount !== undefined) {
            // 1. 将旧数据转换为 BigNumber 对象
            const oldHoldingAmountBN = new BigNumber(holding.holdingAmount)
            const oldProfitAmountBN = new BigNumber(holding.holdingProfitAmount)

            // 2. 使用 .minus() 精确计算出持仓成本
            const costBasisBN = oldHoldingAmountBN.minus(oldProfitAmountBN)

            // 3. 计算新的收益金额
            const newProfitAmountBN = newHoldingAmountBN.minus(costBasisBN)

            // 4. 计算新的收益率，使用 .isGreaterThan(0) 避免除零错误
            const newProfitRate = costBasisBN.isGreaterThan(0)
              ? newProfitAmountBN.dividedBy(costBasisBN).times(100)
              : new BigNumber(0)

            // 5. 将计算结果格式化后添加到 payload 中
            updatePayload.holdingProfitAmount = newProfitAmountBN.toFixed(2)
            updatePayload.holdingProfitRate = newProfitRate.toNumber() // 存为 real 类型
          }

          // 使用准备好的 payload 一次性更新数据库
          await db.update(holdings)
            .set(updatePayload)
            .where(eq(holdings.code, holding.code))
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
