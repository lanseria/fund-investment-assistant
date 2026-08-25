/* eslint-disable no-console */
import BigNumber from 'bignumber.js'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { fundFees, funds, fundTransactions, holdings, navHistory, users } from '~~/server/database/schemas' // [修改] 导入 users
import { useDb } from '~~/server/utils/db'
import { buildFifoLots, calculatePenaltyFee } from '~~/server/utils/transactionCalc'

/** db 事务回调拿到的事务句柄类型(与 useDb() 实例同构的查询/写入接口) */
type DbExecutor = Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0]

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

    // 辅助函数：更新关联买入单的金额(executor 必须传事务句柄,保证与转出确认原子提交)
    const updateRelatedBuyAmount = async (executor: DbExecutor, sellTxId: number, confirmedAmount: string) => {
      await executor.update(fundTransactions)
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
        // 现金变动(buy 为负、sell 为正;基金转换两端不动现金),统一在下方事务中写入
        let cashDelta: BigNumber | null = null

        // --- 买入 / 转入 ---
        if (tx.type === 'buy' || tx.type === 'convert_in') {
          const orderAmount = new BigNumber(tx.orderAmount || 0)
          confirmedShares = orderAmount.dividedBy(nav)
          confirmedAmount = orderAmount

          // 买入扣减现金余额(只记录金额,写入统一收敛到下方事务)
          if (tx.type === 'buy')
            cashDelta = confirmedAmount.negated()

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

          // === FIFO 逻辑开始(计算逻辑抽离至 transactionCalc.ts) ===
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

          // 3. 重建当前持仓的 FIFO 批次队列(已扣除历史卖出消耗)
          const lots = buildFifoLots(
            historyBuys.map(h => ({ date: h.orderDate, shares: h.confirmedShares || 0 })),
            historySells.map(h => ({ shares: h.confirmedShares || 0 })),
          )

          // 4. 查询该基金的赎回费阶梯(若有),按真实费率计算赎回费
          const feeRecord = await db.query.fundFees.findFirst({
            where: eq(fundFees.fundCode, tx.fundCode),
          })
          const rateTiers = (feeRecord?.redemptionFees as { holdingPeriod: string, rate: string }[] | null) ?? null

          // toString() 保持 BigNumber 精度(函数签名接受 string | number)
          const { penaltyFee: totalRedemptionFee } = calculatePenaltyFee(lots, confirmedShares.toString(), tx.orderDate, nav.toString(), rateTiers)

          // 5. 应用赎回费
          if (totalRedemptionFee.gt(0)) {
            rawAmount = rawAmount.minus(totalRedemptionFee)
            note += ` | 赎回费: -¥${totalRedemptionFee.toFixed(2)}`
          }
          // === FIFO 逻辑结束 ===

          confirmedAmount = rawAmount
          finalShares = finalShares.minus(confirmedShares)
          if (finalShares.lt(0.0001)) {
            finalShares = new BigNumber(0)
            finalCostPrice = new BigNumber(0)
          }

          // 卖出回款(只记录金额,写入统一收敛到下方事务;转换回填也移入事务)
          if (tx.type === 'sell')
            cashDelta = confirmedAmount
        }

        // === 写入收敛到单个事务 ===
        // 扣/回现金、更新持仓、更新交易状态、回填转换买入金额必须原子提交:
        // 若分散写入,中途崩溃时交易仍是 pending,下次运行会重复扣现金/重复扣份额。
        // 新持仓时需先确保基金元数据存在(原 addHolding 的行为)。该调用对新基金会
        // 触发网络抓取,幂等且读多写少,放到事务外执行,避免长时间占用事务连接。
        if (!currentHolding) {
          const fundInfo = await db.query.funds.findFirst({ where: eq(funds.code, tx.fundCode) })
          await findOrCreateFund(tx.fundCode, fundInfo?.fundType || 'open')
        }

        const newShares = finalShares.toNumber()
        const newCostPrice = finalCostPrice.toNumber()

        await db.transaction(async (trx) => {
          // 1. 现金变动(仅 buy 扣款 / sell 回款;基金转换两端不动现金)
          if (cashDelta && !cashDelta.isZero()) {
            await trx.update(users)
              .set({ availableCash: sql`${users.availableCash} + ${cashDelta.toString()}` })
              .where(eq(users.id, tx.userId))
            console.log(`[Cash] 用户 ${tx.userId} ${cashDelta.gt(0) ? '卖出回款' : '买入扣款'}: ${cashDelta.gt(0) ? '+' : ''}${cashDelta.toFixed(2)}`)
          }

          // 2. 更新持仓(shares/costPrice 归零时写 null,与原 updateHolding 语义一致)
          if (currentHolding) {
            await trx.update(holdings)
              .set({
                shares: newShares ? String(newShares) : null,
                costPrice: newCostPrice ? String(newCostPrice) : null,
              })
              .where(and(eq(holdings.userId, tx.userId), eq(holdings.fundCode, tx.fundCode)))
          }
          else {
            await trx.insert(holdings).values({
              userId: tx.userId,
              fundCode: tx.fundCode,
              shares: newShares ? String(newShares) : null,
              costPrice: newCostPrice ? String(newCostPrice) : null,
              attentionLevel: 1,
            })
          }

          // 3. 回填转换买入的金额(与转出确认同事务:若转出确认后、回填前崩溃,
          //    转入单会因 orderAmount 永远为空而被无限跳过)
          if (tx.type === 'sell' || tx.type === 'convert_out')
            await updateRelatedBuyAmount(trx, tx.id, confirmedAmount.toString())

          // 4. 更新交易状态为已确认
          await trx.update(fundTransactions)
            .set({
              status: 'confirmed',
              confirmedNav: nav.toString(),
              confirmedShares: confirmedShares.toString(),
              confirmedAmount: confirmedAmount.toString(),
              confirmedAt: new Date(),
              note: note || null,
            })
            .where(eq(fundTransactions.id, tx.id))
        })

        processedCount++

        // 持仓已确认,刷新估值(原 updateHolding 的副作用;失败只影响估值展示,不影响确认结果)。
        // preserveEstimateUpdateTime:todayEstimateUpdateTime 只表示"当日盘中估值"的更新时间,
        // 本任务 9 点执行时写入会让 isEstimateFresh 等判断误以为当日估值已更新,故保留原值
        try {
          await syncSingleFundEstimate(tx.fundCode, { preserveEstimateUpdateTime: true })
        }
        catch (e) {
          console.warn(`[TxID ${tx.id}] 刷新 ${tx.fundCode} 估值失败(不影响交易确认):`, e)
        }
      }
      catch (error: any) {
        console.error(`处理交易 ID ${tx.id} 时出错:`, error)
        skippedCount++
      }
    }

    return { processed: processedCount, skipped: skippedCount, skippedReasons }
  },
})
