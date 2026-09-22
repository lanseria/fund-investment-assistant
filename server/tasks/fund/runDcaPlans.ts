/* eslint-disable no-console */
import { format } from 'date-fns'
import { and, eq, lte } from 'drizzle-orm'
import { dcaPlans, fundTransactions } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { anchorDayLabel, computeNextExecutionDate, frequencyLabel } from '~~/shared/dcaPlan'
import { isTradingDay } from '~~/shared/market'

/**
 * 定投执行任务 (fund:runDcaPlans)
 *
 * 每个交易日 02:45 运行 (在 02:30 fund:processTransactions 结算之后):
 * 昨日卖单回款已入账,当天生成的定投买入单 orderDate = 今天,
 * 次日 02:30 由结算任务按今日净值确认扣款——完全复用现有交易结算链路。
 *
 * 幂等性: 插入买入单与推进计划到下一期在单个 DB 事务内原子提交;
 * 计划推进后 nextExecutionDate 严格晚于今天,任务当天重跑不会重复下单。
 */
export default defineTask({
  meta: {
    name: 'fund:runDcaPlans',
    description: '执行到期的基金定投计划，生成待确认买入单',
  },
  async run() {
    console.log('开始执行定投计划...')
    const db = useDb()
    const today = format(new Date(), 'yyyy-MM-dd')

    const trading = isTradingDay(today)
    if (!trading.isTrading) {
      console.log(`[DCA] 今日 (${today}) ${trading.reason}，跳过定投`)
      return { result: `非交易日 (${today})，跳过` }
    }

    const duePlans = await db.query.dcaPlans.findMany({
      where: and(eq(dcaPlans.enabled, true), lte(dcaPlans.nextExecutionDate, today)),
    })

    if (duePlans.length === 0)
      return { result: '没有到期的定投计划', executed: 0, failed: 0 }

    let executed = 0
    const failedPlans: string[] = []

    for (const plan of duePlans) {
      const label = `${frequencyLabel(plan.frequency)}${anchorDayLabel(plan.frequency, plan.anchorDay)}`
      try {
        await db.transaction(async (trx) => {
          // 1. 生成定投买入单 (pending)，由 fund:processTransactions 按今日净值结算
          await trx.insert(fundTransactions).values({
            userId: plan.userId,
            fundCode: plan.fundCode,
            type: 'buy',
            status: 'pending',
            orderAmount: plan.amount,
            orderDate: today,
            note: `定投买入 (${label})`,
          })

          // 2. 推进计划到下一期 (与 1 同事务,保证崩溃重跑不重复下单)
          await trx.update(dcaPlans)
            .set({
              nextExecutionDate: computeNextExecutionDate(today, plan.frequency, plan.anchorDay),
              lastExecutionDate: today,
              updatedAt: new Date(),
            })
            .where(eq(dcaPlans.id, plan.id))
        })

        executed++
        console.log(`[DCA] 用户 ${plan.userId} 基金 ${plan.fundCode} ${label} 定投 ¥${plan.amount} 买入单已生成`)
      }
      catch (error) {
        console.error(`[DCA] 执行定投计划 ID ${plan.id} (${plan.fundCode}) 失败:`, error)
        failedPlans.push(`计划 ${plan.id} (${plan.fundCode})`)
      }
    }

    return { executed, failed: failedPlans.length, failedPlans }
  },
})
