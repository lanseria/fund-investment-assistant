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
      return { result: 'No pending transactions' }
    }

    // [关键] 预处理：将交易分为两组，优先处理卖出/转出
    // 这样确保转换交易中的“卖出”先结算，从而计算出“买入”的金额
    const sellTxs = pendingTxs.filter(t => t.type === 'sell' || t.type === 'convert_out')
    const buyTxs = pendingTxs.filter(t => t.type === 'buy' || t.type === 'convert_in')

    // 合并列表：先卖(转出) 后 买(转入)
    const sortedTxs = [...sellTxs, ...buyTxs]

    let processedCount = 0
    let skippedCount = 0
    const skippedReasons: string[] = []

    // 辅助函数：更新关联的买入交易金额
    const updateRelatedBuyAmount = async (sellTxId: number, confirmedAmount: string) => {
      await db.update(fundTransactions)
        .set({ orderAmount: confirmedAmount }) // 将卖出的钱填入买入单
        .where(eq(fundTransactions.relatedId, sellTxId))
    }

    for (const tx of sortedTxs) {
      try {
        // [新增] 检查：如果是转换买入(convert_in)交易，需要检查金额是否已填
        // 这里兼容旧数据的 'buy' 类型转换，以及新的 'convert_in'
        if ((tx.type === 'buy' || tx.type === 'convert_in') && tx.relatedId && !tx.orderAmount) {
          // 尝试从数据库重新查一下最新的 orderAmount (因为刚才可能被 updateRelatedBuyAmount 更新了)
          const freshTx = await db.query.fundTransactions.findFirst({
            where: eq(fundTransactions.id, tx.id),
          })

          if (freshTx && freshTx.orderAmount) {
            tx.orderAmount = freshTx.orderAmount // 更新内存中的数据
          }
          else {
            // 对应的卖出还没成交，或者今日无净值，跳过本次循环，等待卖出成交
            // (如果是同一天的交易，上面的 sellTxs 循环应该已经处理了卖出并更新了 DB)
            // 如果走到这里，说明卖出可能失败了或者净值没更新
            skippedCount++
            skippedReasons.push(`[${tx.fundCode}] 转换买入等待卖出确认 (TxID: ${tx.id})`)
            continue
          }
        }

        // 2. 获取订单日期对应的历史净值
        const navRecord = await db.query.navHistory.findFirst({
          where: and(
            eq(navHistory.code, tx.fundCode),
            eq(navHistory.navDate, tx.orderDate),
          ),
        })

        if (!navRecord) {
          skippedCount++
          skippedReasons.push(`[${tx.fundCode}] 缺少 ${tx.orderDate} 的净值数据 (TxID: ${tx.id})`)
          continue
        }

        const nav = new BigNumber(navRecord.nav)
        if (nav.lte(0)) {
          skippedCount++
          skippedReasons.push(`[${tx.fundCode}] ${tx.orderDate} 净值无效(${nav}) (TxID: ${tx.id})`)
          continue
        }

        // 3. 获取用户当前的持仓
        const currentHolding = await db.query.holdings.findFirst({
          where: and(
            eq(holdings.userId, tx.userId),
            eq(holdings.fundCode, tx.fundCode),
          ),
        })

        let finalShares = new BigNumber(currentHolding?.shares || 0)
        let finalCostPrice = new BigNumber(currentHolding?.costPrice || 0)
        let confirmedShares = new BigNumber(0)
        let confirmedAmount = new BigNumber(0)

        // --- 逻辑分支：买入 / 转入 ---
        if (tx.type === 'buy' || tx.type === 'convert_in') {
          // 此时 orderAmount 应该已经被前面的 Sell/ConvertOut 逻辑填充了
          const orderAmount = new BigNumber(tx.orderAmount || 0)

          confirmedShares = orderAmount.dividedBy(nav)
          confirmedAmount = orderAmount

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
        // --- 逻辑分支：卖出 / 转出 ---
        else if (tx.type === 'sell' || tx.type === 'convert_out') {
          const orderShares = new BigNumber(tx.orderShares || 0)

          if (!currentHolding || finalShares.lt(orderShares)) {
            // 失败逻辑
            await db.update(fundTransactions)
              .set({ status: 'failed', note: `持仓不足 (需${orderShares}, 有${finalShares})` })
              .where(eq(fundTransactions.id, tx.id))

            // 如果是关联交易，卖出失败，对应的买入也应该标记失败或取消
            // 这里暂不处理复杂的级联失败，留给买入逻辑自己判断（没有金额就一直 pending）
            continue
          }

          confirmedShares = orderShares
          confirmedAmount = orderShares.multipliedBy(nav)
          finalShares = finalShares.minus(confirmedShares)

          if (finalShares.lt(0.0001)) {
            finalShares = new BigNumber(0)
            finalCostPrice = new BigNumber(0)
          }

          // [核心] 卖出成功后，立即更新关联的买入交易
          // 这里的 tx.id 就是买入交易记录中 relatedId 指向的值
          await updateRelatedBuyAmount(tx.id, confirmedAmount.toString())
        }

        // 4. 更新持仓数据库
        if (currentHolding) {
          await updateHolding(tx.userId, tx.fundCode, {
            shares: finalShares.toNumber(),
            costPrice: finalCostPrice.toNumber(),
          })
        }
        else {
          // 新建仓 (转换买入可能会走到这里)
          const fundInfo = await db.query.funds.findFirst({ where: eq(funds.code, tx.fundCode) })
          const fundType = fundInfo?.fundType || 'open'
          await addHolding({
            userId: tx.userId,
            code: tx.fundCode,
            shares: finalShares.toNumber(),
            costPrice: finalCostPrice.toNumber(),
            fundType,
          })
        }

        // 5. 更新交易记录状态
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
      catch (error: any) {
        console.error(`处理交易 ID ${tx.id} 时出错:`, error)
        skippedCount++
        skippedReasons.push(`[${tx.fundCode}] 处理异常: ${error.message} (TxID: ${tx.id})`)
      }
    }

    console.log(`交易处理完成。成功: ${processedCount}, 跳过: ${skippedCount}`)
    return { processed: processedCount, skipped: skippedCount, skippedReasons }
  },
})
