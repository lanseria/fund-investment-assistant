/* eslint-disable no-console */
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { funds, fundTransactions, holdings, navHistory, users } from '~~/server/database/schemas' // [修改] 导入 users
import { useDb } from '~~/server/utils/db'

export default defineTask({
  meta: {
    name: 'fund:processTransactions',
    description: '处理待确认的基金交易，更新用户持仓及现金余额',
  },
  async run() {
    console.log('开始处理待确认交易...')
    const db = useDb()

    const pendingTxs = await db.query.fundTransactions.findMany({
      where: eq(fundTransactions.status, 'pending'),
    })

    if (pendingTxs.length === 0) {
      return { result: 'No pending transactions' }
    }

    const sellTxs = pendingTxs.filter(t => t.type === 'sell' || t.type === 'convert_out')
    const buyTxs = pendingTxs.filter(t => t.type === 'buy' || t.type === 'convert_in')
    const sortedTxs = [...sellTxs, ...buyTxs]

    let processedCount = 0
    let skippedCount = 0
    const skippedReasons: string[] = []

    // 辅助函数：更新关联买入单的金额
    const updateRelatedBuyAmount = async (sellTxId: number, confirmedAmount: string) => {
      await db.update(fundTransactions)
        .set({ orderAmount: confirmedAmount })
        .where(eq(fundTransactions.relatedId, sellTxId))
    }

    for (const tx of sortedTxs) {
      try {
        // [前置检查] 转换买入等待卖出确认
        if ((tx.type === 'buy' || tx.type === 'convert_in') && tx.relatedId && !tx.orderAmount) {
          const freshTx = await db.query.fundTransactions.findFirst({
            where: eq(fundTransactions.id, tx.id),
          })
          if (freshTx && freshTx.orderAmount) {
            tx.orderAmount = freshTx.orderAmount
          }
          else {
            skippedCount++
            skippedReasons.push(`[${tx.fundCode}] 转换买入等待卖出确认 (TxID: ${tx.id})`)
            continue
          }
        }

        // 获取净值
        const navRecord = await db.query.navHistory.findFirst({
          where: and(eq(navHistory.code, tx.fundCode), eq(navHistory.navDate, tx.orderDate)),
        })

        if (!navRecord || new BigNumber(navRecord.nav).lte(0)) {
          skippedCount++
          skippedReasons.push(`[${tx.fundCode}] ${tx.orderDate} 净值缺失或无效 (TxID: ${tx.id})`)
          continue
        }

        const nav = new BigNumber(navRecord.nav)
        const currentHolding = await db.query.holdings.findFirst({
          where: and(eq(holdings.userId, tx.userId), eq(holdings.fundCode, tx.fundCode)),
        })

        let finalShares = new BigNumber(currentHolding?.shares || 0)
        let finalCostPrice = new BigNumber(currentHolding?.costPrice || 0)
        let confirmedShares = new BigNumber(0)
        let confirmedAmount = new BigNumber(0)
        let note = tx.note || ''

        // --- 买入 / 转入 ---
        if (tx.type === 'buy' || tx.type === 'convert_in') {
          const orderAmount = new BigNumber(tx.orderAmount || 0)
          confirmedShares = orderAmount.dividedBy(nav)
          confirmedAmount = orderAmount

          // 扣减余额
          if (tx.type === 'buy') {
            await db.update(users)
              .set({ availableCash: sql`${users.availableCash} - ${confirmedAmount.toString()}` })
              .where(eq(users.id, tx.userId))
            console.log(`[Cash] 用户 ${tx.userId} 买入扣款: -${confirmedAmount.toFixed(2)}`)
          }

          // 更新平均成本
          if (currentHolding && finalShares.gt(0)) {
            const oldTotalCost = finalShares.multipliedBy(finalCostPrice)
            const newTotalCost = oldTotalCost.plus(confirmedAmount)
            const newTotalShares = finalShares.plus(confirmedShares)
            finalCostPrice = newTotalCost.dividedBy(newTotalShares)
            finalShares = newTotalShares
          }
          else {
            finalShares = confirmedShares
            finalCostPrice = nav
          }
        }
        // --- 卖出 / 转出 (核心修改：FIFO 7天惩罚计算) ---
        else if (tx.type === 'sell' || tx.type === 'convert_out') {
          const orderShares = new BigNumber(tx.orderShares || 0)

          if (!currentHolding || finalShares.lt(orderShares.minus(0.0001))) { // 容差
            await db.update(fundTransactions)
              .set({ status: 'failed', note: `持仓不足 (需${orderShares.toFixed(2)}, 有${finalShares.toFixed(2)})` })
              .where(eq(fundTransactions.id, tx.id))
            continue
          }

          confirmedShares = orderShares
          let rawAmount = orderShares.multipliedBy(nav) // 未扣费前的金额

          // === FIFO 逻辑开始 ===
          // 1. 获取所有历史已确认的“增加份额”的交易 (买入/转入)，按时间正序
          const historyBuys = await db.query.fundTransactions.findMany({
            where: and(
              eq(fundTransactions.userId, tx.userId),
              eq(fundTransactions.fundCode, tx.fundCode),
              inArray(fundTransactions.type, ['buy', 'convert_in']),
              eq(fundTransactions.status, 'confirmed'),
              lt(fundTransactions.orderDate, tx.orderDate), // 仅查询本次交易之前的
            ),
            orderBy: [sql`${fundTransactions.orderDate} ASC`, sql`${fundTransactions.createdAt} ASC`],
          })

          // 2. 获取所有历史已确认的“减少份额”的交易 (卖出/转出)
          const historySells = await db.query.fundTransactions.findMany({
            where: and(
              eq(fundTransactions.userId, tx.userId),
              eq(fundTransactions.fundCode, tx.fundCode),
              inArray(fundTransactions.type, ['sell', 'convert_out']),
              eq(fundTransactions.status, 'confirmed'),
              lt(fundTransactions.orderDate, tx.orderDate),
            ),
            orderBy: [sql`${fundTransactions.orderDate} ASC`, sql`${fundTransactions.createdAt} ASC`],
          })

          // 3. 构建当前的持仓批次队列 (Lots)
          // 结构: { date: string, shares: BigNumber }
          const lots: { date: string, shares: BigNumber }[] = []

          // 3.1 填充买入
          for (const hBuy of historyBuys) {
            lots.push({
              date: hBuy.orderDate,
              shares: new BigNumber(hBuy.confirmedShares || 0),
            })
          }

          // 3.2 模拟历史卖出消耗 (FIFO)
          let totalHistorySold = historySells.reduce((acc, s) => acc.plus(new BigNumber(s.confirmedShares || 0)), new BigNumber(0))

          while (totalHistorySold.gt(0) && lots.length > 0) {
            const head = lots[0]!
            if (head.shares.lte(totalHistorySold)) {
              // 这一批次全部卖完了
              totalHistorySold = totalHistorySold.minus(head.shares)
              lots.shift() // 移除队头
            }
            else {
              // 这一批次只卖了一部分
              head.shares = head.shares.minus(totalHistorySold)
              totalHistorySold = new BigNumber(0)
            }
          }

          // 4. 计算本次卖出的惩罚
          let sharesToSell = new BigNumber(confirmedShares)
          let totalPenaltyFee = new BigNumber(0)
          const sellDate = dayjs(tx.orderDate)

          // 从剩下的批次中扣减
          for (const lot of lots) {
            if (sharesToSell.lte(0))
              break

            const take = BigNumber.min(lot.shares, sharesToSell)
            const buyDate = dayjs(lot.date)
            // 计算持有天数 (diff)
            const diffDays = sellDate.diff(buyDate, 'day')

            // 如果持有不足 7 天，对这一部分 (take) 收取手续费
            if (diffDays < 7) {
              const partValue = take.multipliedBy(nav)
              const partFee = partValue.multipliedBy(0.015) // 1.5%
              totalPenaltyFee = totalPenaltyFee.plus(partFee)
              console.log(`[FIFO Penalty] 扣减批次 ${lot.date} (持有${diffDays}天): 份额 ${take.toFixed(2)}, 费用 ${partFee.toFixed(2)}`)
            }

            sharesToSell = sharesToSell.minus(take)
          }

          // 5. 应用手续费
          if (totalPenaltyFee.gt(0)) {
            rawAmount = rawAmount.minus(totalPenaltyFee)
            note += ` | 持有<7天惩罚: -¥${totalPenaltyFee.toFixed(2)}`
          }
          // === FIFO 逻辑结束 ===

          confirmedAmount = rawAmount
          finalShares = finalShares.minus(confirmedShares)
          if (finalShares.lt(0.0001)) {
            finalShares = new BigNumber(0)
            finalCostPrice = new BigNumber(0)
          }

          // 卖出回款
          if (tx.type === 'sell') {
            await db.update(users)
              .set({ availableCash: sql`${users.availableCash} + ${confirmedAmount.toString()}` })
              .where(eq(users.id, tx.userId))
            console.log(`[Cash] 用户 ${tx.userId} 卖出回款: +${confirmedAmount.toFixed(2)}`)
          }

          await updateRelatedBuyAmount(tx.id, confirmedAmount.toString())
        }

        // 更新持仓
        if (currentHolding) {
          await updateHolding(tx.userId, tx.fundCode, { shares: finalShares.toNumber(), costPrice: finalCostPrice.toNumber() })
        }
        else {
          const fundInfo = await db.query.funds.findFirst({ where: eq(funds.code, tx.fundCode) })
          await addHolding({ userId: tx.userId, code: tx.fundCode, shares: finalShares.toNumber(), costPrice: finalCostPrice.toNumber(), fundType: fundInfo?.fundType || 'open' })
        }

        // 更新交易状态
        await db.update(fundTransactions)
          .set({
            status: 'confirmed',
            confirmedNav: nav.toString(),
            confirmedShares: confirmedShares.toString(),
            confirmedAmount: confirmedAmount.toString(),
            confirmedAt: new Date(),
            note: note || null,
          })
          .where(eq(fundTransactions.id, tx.id))

        processedCount++
      }
      catch (error: any) {
        console.error(`处理交易 ID ${tx.id} 时出错:`, error)
        skippedCount++
      }
    }

    return { processed: processedCount, skipped: skippedCount, skippedReasons }
  },
})
