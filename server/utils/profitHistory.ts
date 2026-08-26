import BigNumber from 'bignumber.js'
import { addDays, format, isBefore, isSameDay, parseISO } from 'date-fns'
import { and, gte, inArray } from 'drizzle-orm'
import { navHistory } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

/** 单日收益数据点 */
export interface DailyProfitPoint {
  date: string
  totalAssets: number
  dayProfit: number
  dayProfitRate: number
  totalProfit: number
  totalProfitRate: number
}

/** 回测所需的交易记录字段（与 fundTransactions 表字段类型一致） */
export interface SimulateTxRow {
  fundCode: string
  orderDate: string
  type: string
  confirmedAmount: string | null
  confirmedShares: string | null
}

/**
 * 构建净值查找表: navMap[date][code] = nav
 * @param fundCodes 涉及的基金代码
 * @param sinceDate 起始日期 (yyyy-MM-dd)，通常为最早交易日期
 */
export async function buildNavMap(fundCodes: string[], sinceDate: string): Promise<Record<string, Record<string, string>>> {
  const navMap: Record<string, Record<string, string>> = {}
  if (fundCodes.length === 0)
    return navMap

  const db = useDb()
  const navs = await db.query.navHistory.findMany({
    where: and(
      inArray(navHistory.code, fundCodes),
      gte(navHistory.navDate, sinceDate),
    ),
  })

  navs.forEach((n) => {
    if (!navMap[n.navDate])
      navMap[n.navDate] = {}
    navMap[n.navDate]![n.code] = n.nav
  })
  return navMap
}

/**
 * 按天回测计算收益历史
 * @param allTxs 已确认的交易记录（必须按 orderDate 升序排列）
 * @param navMap 净值查找表（可由 buildNavMap 生成，跨用户共享）
 */
export function simulateProfitHistory(allTxs: SimulateTxRow[], navMap: Record<string, Record<string, string>>): DailyProfitPoint[] {
  if (allTxs.length === 0)
    return []

  const firstTxDate = parseISO(allTxs[0]!.orderDate)

  const history: DailyProfitPoint[] = []

  // 持仓状态：Map<fundCode, { shares: BigNumber, avgCost: BigNumber }>
  // cost: 该基金当前持有的总成本
  const portfolio = new Map<string, { shares: BigNumber, avgCost: BigNumber }>()

  let totalRealizedProfit = new BigNumber(0) // 已落袋盈亏 (卖出产生的盈亏)
  let lastDayTotalAssets = new BigNumber(0) // 昨日总资产 (用于计算日盈亏)

  // 辅助：记录每个基金最近已知的净值，用于填充节假日
  const lastKnownNavs: Record<string, string> = {}

  // 当前小时 >= 15 (收盘后) 时，today 已包含当日净值；loopEndDate 统一取今天，循环条件按天比较即可。
  const loopEndDate = new Date()

  // 优化：交易记录按日期分组，避免内层循环查找
  const txsByDate: Record<string, SimulateTxRow[]> = {}
  allTxs.forEach((tx) => {
    if (!txsByDate[tx.orderDate])
      txsByDate[tx.orderDate] = []
    txsByDate[tx.orderDate]!.push(tx)
  })

  let currentDate = firstTxDate
  while (isBefore(currentDate, loopEndDate) || isSameDay(currentDate, loopEndDate)) {
    const dateStr = format(currentDate, 'yyyy-MM-dd')

    // --- A. 处理当日交易 ---
    const dailyTxs = txsByDate[dateStr] || []
    let dailyNetInflow = new BigNumber(0) // 当日净投入资金 (买入 - 卖出)

    for (const tx of dailyTxs) {
      if (!portfolio.has(tx.fundCode)) {
        portfolio.set(tx.fundCode, { shares: new BigNumber(0), avgCost: new BigNumber(0) })
      }
      const position = portfolio.get(tx.fundCode)!

      // 交易确认金额/份额
      const confirmedAmt = new BigNumber(tx.confirmedAmount || 0)
      const confirmedShares = new BigNumber(tx.confirmedShares || 0)

      if (tx.type === 'buy' || tx.type === 'convert_in') {
        // 买入：增加份额，重新计算持仓成本
        // 新成本 = 旧持仓成本 + 新买入金额
        const oldCost = position.shares.multipliedBy(position.avgCost)
        const newCost = oldCost.plus(confirmedAmt)
        const newShares = position.shares.plus(confirmedShares)

        position.shares = newShares
        // 避免除以0
        position.avgCost = newShares.gt(0) ? newCost.dividedBy(newShares) : new BigNumber(0)

        dailyNetInflow = dailyNetInflow.plus(confirmedAmt)
      }
      else if (tx.type === 'sell' || tx.type === 'convert_out') {
        // 卖出：减少份额，计算落袋盈亏
        // 卖出部分的成本 = 卖出份额 * 当前平均成本
        const costOfSold = confirmedShares.multipliedBy(position.avgCost)
        const revenue = confirmedAmt // 卖出实际到手金额

        // 此次交易盈亏
        const tradeProfit = revenue.minus(costOfSold)
        totalRealizedProfit = totalRealizedProfit.plus(tradeProfit)

        position.shares = position.shares.minus(confirmedShares)
        // 卖出不改变剩余份额的平均成本，所以 avgCost 不变 (除非清仓)
        if (position.shares.lte(0.0001)) {
          position.shares = new BigNumber(0)
          position.avgCost = new BigNumber(0)
        }

        dailyNetInflow = dailyNetInflow.minus(revenue)
      }
    }

    // --- B. 计算当日持仓市值 ---
    let currentTotalAssets = new BigNumber(0)
    let currentTotalHoldingCost = new BigNumber(0) // 当前持仓的总成本

    // 更新今日可用净值
    if (navMap[dateStr]) {
      Object.assign(lastKnownNavs, navMap[dateStr])
    }

    for (const [code, position] of portfolio.entries()) {
      if (position.shares.gt(0)) {
        // 获取净值：优先用当日，否则用最近已知的
        const navStr = navMap[dateStr]?.[code] || lastKnownNavs[code]
        // 如果连最近已知的都没有（比如刚买入还没出净值），暂用持仓成本价估算，或者 0
        const currentNav = navStr ? new BigNumber(navStr) : position.avgCost

        const marketValue = position.shares.multipliedBy(currentNav)
        currentTotalAssets = currentTotalAssets.plus(marketValue)

        const holdingCost = position.shares.multipliedBy(position.avgCost)
        currentTotalHoldingCost = currentTotalHoldingCost.plus(holdingCost)
      }
    }

    // --- C. 计算关键指标 ---

    // 1. 累计盈亏 = (当前持仓市值 - 当前持仓成本) + 已落袋盈亏
    const totalFloatingProfit = currentTotalAssets.minus(currentTotalHoldingCost)
    const totalProfit = totalFloatingProfit.plus(totalRealizedProfit)

    // 2. 累计收益率 = 累计盈亏 / 当前持仓成本。空仓时为 0
    let totalProfitRate = new BigNumber(0)
    if (currentTotalHoldingCost.gt(0)) {
      totalProfitRate = totalProfit.dividedBy(currentTotalHoldingCost).multipliedBy(100)
    }

    // 3. 当日盈亏
    // 公式: 今日资产 - 昨日资产 - 净资金流入
    // 第一天特殊处理
    let dayProfit = new BigNumber(0)
    if (isSameDay(currentDate, firstTxDate)) {
      // 第一天: 盈亏 = (市值 - 成本) [因为都是刚买的，波动即盈亏]
      dayProfit = currentTotalAssets.minus(dailyNetInflow)
    }
    else {
      dayProfit = currentTotalAssets.minus(lastDayTotalAssets).minus(dailyNetInflow)
    }

    // 4. 当日收益率
    // 公式: 当日盈亏 / (昨日资产 + 今日买入)
    // 精确点: 如果昨日资产为0，分母为今日投入。
    let dayProfitRate = new BigNumber(0)
    const denominator = lastDayTotalAssets.gt(0) ? lastDayTotalAssets : dailyNetInflow
    if (denominator.gt(0)) {
      dayProfitRate = dayProfit.dividedBy(denominator).multipliedBy(100)
    }

    // --- D. 记录数据 ---
    history.push({
      date: dateStr,
      totalAssets: Number(currentTotalAssets.toFixed(2)),
      dayProfit: Number(dayProfit.toFixed(2)),
      dayProfitRate: Number(dayProfitRate.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalProfitRate: Number(totalProfitRate.toFixed(2)),
    })

    // 更新状态供下一轮使用
    lastDayTotalAssets = currentTotalAssets
    currentDate = addDays(currentDate, 1)
  }

  return history
}
