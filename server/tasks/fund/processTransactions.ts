/* eslint-disable no-console */
import BigNumber from 'bignumber.js'
import { and, eq } from 'drizzle-orm'
import { funds, fundTransactions, holdings, navHistory } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { addHolding, updateHolding } from '~~/server/utils/holdings'

export default defineTask({
  meta: {
    name: 'fund:processTransactions',
    description: '处理待确认的基金交易，更新用户持仓',
  },
  async run() {
    console.log('开始处理待确认交易...')
    const db = useDb()

    // 1. 获取所有 pending 状态的交易
    const pendingTxs = await db.query.fundTransactions.findMany({
      where: eq(fundTransactions.status, 'pending'),
    })

    if (pendingTxs.length === 0) {
      console.log('没有待处理的交易。')
      return { result: 'No pending transactions' }
    }

    let processedCount = 0
    let skippedCount = 0

    for (const tx of pendingTxs) {
      try {
        // 2. 获取订单日期对应的历史净值
        const navRecord = await db.query.navHistory.findFirst({
          where: and(
            eq(navHistory.code, tx.fundCode),
            eq(navHistory.navDate, tx.orderDate),
          ),
        })

        // 如果找不到当天的净值（可能是因为还没更新，或者是周末/节假日递延）
        // 暂时跳过，等待下次任务（例如第二天）再处理
        if (!navRecord) {
          skippedCount++
          continue
        }

        const nav = new BigNumber(navRecord.nav)
        if (nav.lte(0)) {
          console.warn(`交易 ID ${tx.id}: 净值无效 (${nav.toString()})，跳过。`)
          skippedCount++
          continue
        }

        // 3. 获取用户当前的持仓 (可能为空)
        const currentHolding = await db.query.holdings.findFirst({
          where: and(
            eq(holdings.userId, tx.userId),
            eq(holdings.fundCode, tx.fundCode),
          ),
        })

        // 准备更新持仓的数据
        let finalShares = new BigNumber(currentHolding?.shares || 0)
        let finalCostPrice = new BigNumber(currentHolding?.costPrice || 0)

        // 记录本次交易确认的数据
        let confirmedShares = new BigNumber(0)
        let confirmedAmount = new BigNumber(0)

        // --- 逻辑分支：买入 ---
        if (tx.type === 'buy') {
          const orderAmount = new BigNumber(tx.orderAmount || 0)

          // 计算份额 = 金额 / 净值 (暂忽略手续费)
          confirmedShares = orderAmount.dividedBy(nav)
          confirmedAmount = orderAmount

          if (currentHolding && finalShares.gt(0)) {
            // 已有持仓：计算加权平均成本
            // 新成本价 = (旧持仓市值 + 本次买入金额) / (旧份额 + 本次份额)
            // 注意：旧持仓市值 = 旧份额 * 旧成本价 (这是基于成本的计算)
            const oldTotalCost = finalShares.multipliedBy(finalCostPrice)
            const newTotalCost = oldTotalCost.plus(confirmedAmount)
            const newTotalShares = finalShares.plus(confirmedShares)

            finalCostPrice = newTotalCost.dividedBy(newTotalShares)
            finalShares = newTotalShares
          }
          else {
            // 新建仓 (或之前已清仓)
            finalShares = confirmedShares
            finalCostPrice = nav // 初始成本价即为当前净值
          }
        }
        // --- 逻辑分支：卖出 ---
        else if (tx.type === 'sell') {
          const orderShares = new BigNumber(tx.orderShares || 0)

          // 检查持仓是否足够
          if (!currentHolding || finalShares.lt(orderShares)) {
            console.error(`交易 ID ${tx.id}: 卖出失败，持仓不足。持有: ${finalShares}, 卖出: ${orderShares}`)
            // 标记为失败
            await db.update(fundTransactions)
              .set({ status: 'failed', note: '持仓份额不足' })
              .where(eq(fundTransactions.id, tx.id))
            continue
          }

          confirmedShares = orderShares
          confirmedAmount = orderShares.multipliedBy(nav)

          // 卖出：份额减少，成本价(单位成本)通常保持不变
          finalShares = finalShares.minus(confirmedShares)

          // 如果份额极小，视为清仓，重置成本价
          if (finalShares.lt(0.01)) {
            finalShares = new BigNumber(0)
            finalCostPrice = new BigNumber(0)
          }
        }

        // 4. 更新数据库

        // A. 更新或创建持仓
        if (currentHolding) {
          // 如果是清仓(份额为0)，可以选择删除记录或者保留但设为0
          // 这里我们选择更新为0，保持“仅关注”状态
          await updateHolding(tx.userId, tx.fundCode, {
            shares: finalShares.toNumber(),
            costPrice: finalCostPrice.toNumber(),
          })
        }
        else {
          // 新建仓 (仅买入会走到这里)
          // 需要先确保 fundType 存在。addHolding 内部会处理 findOrCreateFund
          // 我们需要知道 fundType。可以先查 funds 表，如果是个新基金可能需要从接口查
          // 为简单起见，addHolding 需要 fundType。我们查询现有的 funds 表
          const fundInfo = await db.query.funds.findFirst({ where: eq(funds.code, tx.fundCode) })
          // 如果 funds 表也没这个基金(极少见，因为添加交易时通常已有)，默认为 open
          const fundType = fundInfo?.fundType || 'open'

          await addHolding({
            userId: tx.userId,
            code: tx.fundCode,
            shares: finalShares.toNumber(),
            costPrice: finalCostPrice.toNumber(),
            fundType,
          })
        }

        // B. 更新交易记录状态
        await db.update(fundTransactions)
          .set({
            status: 'confirmed',
            confirmedNav: nav.toString(),
            confirmedShares: confirmedShares.toString(),
            confirmedAmount: confirmedAmount.toString(),
            confirmedAt: new Date(),
          })
          .where(eq(fundTransactions.id, tx.id))

        processedCount++
      }
      catch (error) {
        console.error(`处理交易 ID ${tx.id} 时出错:`, error)
        // 可以选择标记为 failed 或保持 pending 等待人工修复
      }
    }

    console.log(`交易处理完成。成功: ${processedCount}, 跳过(无净值): ${skippedCount}`)

    // 任务完成后，发出更新通知
    if (processedCount > 0) {
      // 这里的 emitter 需要引入，或者不做通知，等待前端轮询
      // import { emitter } from '~~/server/utils/emitter'
      // emitter.emit('holdings:updated')
    }

    return { processed: processedCount, skipped: skippedCount }
  },
})
