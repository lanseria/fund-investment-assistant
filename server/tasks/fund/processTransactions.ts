/* eslint-disable no-console */
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { and, desc, eq, inArray, lt } from 'drizzle-orm' // [修改] 导入 lt, desc, inArray
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
        // [前置检查] 买入/转入 等待卖出确认逻辑 (保持不变)
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

        // 2. 获取净值 (保持不变)
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
        let note = tx.note || ''

        // --- 逻辑分支：买入 / 转入 ---
        if (tx.type === 'buy' || tx.type === 'convert_in') {
          // (保持不变)
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
            await db.update(fundTransactions)
              .set({ status: 'failed', note: `持仓不足 (需${orderShares}, 有${finalShares})` })
              .where(eq(fundTransactions.id, tx.id))
            continue
          }

          confirmedShares = orderShares
          // 初始确认金额 = 份额 * 净值
          let rawAmount = orderShares.multipliedBy(nav)

          // [新增] 7天惩罚性费率检查逻辑
          // 查找该用户该基金最近一笔已确认的买入(或转入)记录
          const lastBuyTx = await db.query.fundTransactions.findFirst({
            where: and(
              eq(fundTransactions.userId, tx.userId),
              eq(fundTransactions.fundCode, tx.fundCode),
              inArray(fundTransactions.type, ['buy', 'convert_in']),
              eq(fundTransactions.status, 'confirmed'),
              // 必须是在当前卖出单日期之前的买入
              lt(fundTransactions.orderDate, tx.orderDate),
            ),
            orderBy: [desc(fundTransactions.orderDate)],
          })

          if (lastBuyTx) {
            const sellDate = dayjs(tx.orderDate)
            const buyDate = dayjs(lastBuyTx.orderDate)
            const diffDays = sellDate.diff(buyDate, 'day')

            // 如果持有不足7天
            if (diffDays < 7) {
              const feeRate = 0.015 // 1.5%
              const fee = rawAmount.multipliedBy(feeRate)

              // 扣除手续费
              rawAmount = rawAmount.minus(fee)

              const feeStr = fee.toFixed(2)
              note = note ? `${note} | ` : ''
              note += `持有${diffDays}天(<7)，扣除1.5%费率(¥${feeStr})`

              console.log(`[Fee] 用户 ${tx.userId} 卖出 ${tx.fundCode} 触发短期惩罚: -${feeStr}`)
            }
          }

          confirmedAmount = rawAmount
          finalShares = finalShares.minus(confirmedShares)

          if (finalShares.lt(0.0001)) {
            finalShares = new BigNumber(0)
            finalCostPrice = new BigNumber(0)
          }

          // 更新关联的买入交易
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
            note: note || null, // [修改] 保存更新后的备注
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
