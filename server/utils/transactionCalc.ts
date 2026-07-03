// server/utils/transactionCalc.ts
// 交易确认的纯计算逻辑,从 processTransactions 任务中抽离以便单元测试。
// 注意:所有数值运算使用 bignumber.js,与原任务逻辑保持精度一致。
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'

/** FIFO 持仓批次(一次买入形成的份额单元) */
export interface Lot {
  /** 买入日期(订单日期) */
  date: string
  /** 该批次剩余份额 */
  shares: BigNumber
}

/**
 * 根据历史买入/卖出交易,重建当前持仓的 FIFO 批次队列。
 *
 * 算法(与原任务逻辑等价):
 * 1. 把所有历史"增加份额"的交易(买入/转入)按时间正序填入批次队列;
 * 2. 用所有历史"减少份额"的交易(卖出/转出)按 FIFO(先进先出)从队头消耗批次;
 * 3. 返回未被历史卖出消耗完的剩余批次(即当前真实持仓批次)。
 *
 * @param historyBuys 历史已确认的增加份额交易(买入/转入),按时间正序
 * @param historySells 历史已确认的减少份额交易(卖出/转出)
 * @returns 剩余的 FIFO 批次队列
 */
export function buildFifoLots(
  historyBuys: { date: string, shares: number | string }[],
  historySells: { shares: number | string }[],
): Lot[] {
  // 1. 填充买入批次
  const lots: Lot[] = historyBuys.map(b => ({
    date: b.date,
    shares: new BigNumber(b.shares || 0),
  }))

  // 2. 模拟历史卖出消耗(FIFO)
  let totalHistorySold = historySells.reduce(
    (acc, s) => acc.plus(new BigNumber(s.shares || 0)),
    new BigNumber(0),
  )

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

  return lots
}

/**
 * 计算本次卖出在"持有不足 7 天"部分应收取的惩罚手续费。
 *
 * 算法(与原任务逻辑等价):
 * 1. 从剩余批次(lots)的队头开始,逐批次扣减本次卖出份额;
 * 2. 对每个被触及的批次,若持有天数 < 7,则对该批次的扣减份额收取 1.5% 手续费;
 * 3. 各批次的惩罚费累加返回。
 *
 * @param lots 当前剩余批次(应已扣除历史卖出,由 buildFifoLots 产出)
 * @param sellShares 本次卖出份额
 * @param sellDate 卖出日期(订单日期)
 * @param nav 卖出当日净值
 * @returns 总惩罚手续费(数值)
 */
export function calculatePenaltyFee(
  lots: Lot[],
  sellShares: number | string,
  sellDate: string,
  nav: number | string,
): { penaltyFee: BigNumber } {
  let sharesToSell = new BigNumber(sellShares)
  let totalPenaltyFee = new BigNumber(0)
  const sellDateDayjs = dayjs(sellDate)
  const navBn = new BigNumber(nav)

  for (const lot of lots) {
    if (sharesToSell.lte(0))
      break

    const take = BigNumber.min(lot.shares, sharesToSell)
    const buyDate = dayjs(lot.date)
    const diffDays = sellDateDayjs.diff(buyDate, 'day')

    // 持有不足 7 天,对这部分(take)收取 1.5% 手续费
    if (diffDays < 7) {
      const partValue = take.multipliedBy(navBn)
      const partFee = partValue.multipliedBy(0.015) // 1.5%
      totalPenaltyFee = totalPenaltyFee.plus(partFee)
    }

    sharesToSell = sharesToSell.minus(take)
  }

  return { penaltyFee: totalPenaltyFee }
}
