import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { fundTransactions, navHistory } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 定义返回给前端的数据结构
interface DailyProfitPoint {
  date: string
  totalAssets: number
  dayProfit: number
  dayProfitRate: number
  totalProfit: number
  totalProfitRate: number
}

interface ProfitAnalysisData {
  summary: {
    yesterdayProfit: number
    yearProfit: number
    totalProfitRate: number
    totalAssets: number
  }
  history: DailyProfitPoint[]
  calendar: Record<string, number>
}

export default defineEventHandler(async (event): Promise<ProfitAnalysisData> => {
  const user = getUserFromEvent(event)
  const db = useDb()

  // 1. 获取用户所有已确认的交易记录，按日期升序排列
  const allTxs = await db.query.fundTransactions.findMany({
    where: and(
      eq(fundTransactions.userId, user.id),
      eq(fundTransactions.status, 'confirmed'),
    ),
    orderBy: [asc(fundTransactions.orderDate)],
  })

  // 如果没有交易，返回空数据
  if (allTxs.length === 0) {
    return {
      summary: { yesterdayProfit: 0, yearProfit: 0, totalProfitRate: 0, totalAssets: 0 },
      history: [],
      calendar: {},
    }
  }

  // 2. 确定时间范围和涉及的基金
  const firstTxDate = dayjs(allTxs[0].orderDate)
  const today = dayjs()
  // 提取所有涉及的基金代码 (去重)
  const fundCodes = [...new Set(allTxs.map(t => t.fundCode))]

  // 3. 批量获取这些基金在时间范围内的历史净值
  // 为了防止数据量过大，只获取第一笔交易日期之后的净值
  const navs = await db.query.navHistory.findMany({
    where: and(
      inArray(navHistory.code, fundCodes),
      gte(navHistory.navDate, firstTxDate.format('YYYY-MM-DD')),
    ),
  })

  // 构建净值查找表: navMap[date][code] = nav
  const navMap: Record<string, Record<string, string>> = {}
  navs.forEach((n) => {
    if (!navMap[n.navDate])
      navMap[n.navDate] = {}
    navMap[n.navDate]![n.code] = n.nav
  })

  // 4. 初始化回测状态
  const history: DailyProfitPoint[] = []
  const calendar: Record<string, number> = {}

  // 持仓状态：Map<fundCode, { shares: BigNumber, cost: BigNumber }>
  // cost: 该基金当前持有的总成本
  const portfolio = new Map<string, { shares: BigNumber, avgCost: BigNumber }>()

  let totalRealizedProfit = new BigNumber(0) // 已落袋盈亏 (卖出产生的盈亏)
  let lastDayTotalAssets = new BigNumber(0) // 昨日总资产 (用于计算日盈亏)

  // 辅助：记录每个基金最近已知的净值，用于填充节假日
  const lastKnownNavs: Record<string, string> = {}

  // 5. 按天回测
  // 循环从第一笔交易前一天开始(作为基准)，直到今天
  // 但为了图表展示，我们从第一笔交易当天开始记录
  let currentDate = firstTxDate
  const loopEndDate = today.hour() >= 15 ? today : today // 如果要含今日预估，这里逻辑会更复杂，暂算到昨日净值为止或最新有净值的日期

  // 优化：交易记录按日期分组，避免内层循环查找
  const txsByDate: Record<string, typeof allTxs> = {}
  allTxs.forEach((tx) => {
    if (!txsByDate[tx.orderDate])
      txsByDate[tx.orderDate] = []
    txsByDate[tx.orderDate]!.push(tx)
  })

  while (currentDate.isBefore(loopEndDate) || currentDate.isSame(loopEndDate, 'day')) {
    const dateStr = currentDate.format('YYYY-MM-DD')

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
      // const nav = new BigNumber(tx.confirmedNav || 0)

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

    // 2. 累计收益率 = 累计盈亏 / (当前持仓成本 + 已卖出的成本...?)
    // 简单算法：累计盈亏 / 当前持仓成本。如果空仓，则无收益率?
    // 更好的算法（TWRR）太复杂。这里用：累计盈亏 / (当前持仓成本 + abs(已落袋盈亏? No))
    // 采用：累计盈亏 / (当前持仓成本 > 0 ? 当前持仓成本 : (历史最大投入?))
    // 为防止分母为0 (空仓时)，如果空仓，收益率 = 0 (或者保留上一日的?)
    let totalProfitRate = new BigNumber(0)
    if (currentTotalHoldingCost.gt(0)) {
      totalProfitRate = totalProfit.dividedBy(currentTotalHoldingCost).multipliedBy(100)
    }
    else if (totalRealizedProfit.gt(0)) {
      // 空仓但有盈利，收益率怎么算？这是一个经典问题。
      // 暂时设为 0 或者 100%? 这里简单处理：设为0，或者显示上次的。
      // 为了UI不崩，设为0。
      totalProfitRate = new BigNumber(0)
    }

    // 3. 当日盈亏
    // 公式: 今日资产 - 昨日资产 - 净资金流入
    // 第一天特殊处理
    let dayProfit = new BigNumber(0)
    if (currentDate.isSame(firstTxDate, 'day')) {
      // 第一天: 盈亏 = (市值 - 成本) [因为都是刚买的，波动即盈亏]
      dayProfit = currentTotalAssets.minus(dailyNetInflow)
    }
    else {
      dayProfit = currentTotalAssets.minus(lastDayTotalAssets).minus(dailyNetInflow)
    }

    // 4. 当日收益率
    // 公式: 当日盈亏 / (昨日资产 + 今日买入)
    let dayProfitRate = new BigNumber(0)
    // 分母 = 昨日资产。如果今日有大额买入，应该加到分母里去吗？通常 T日买入 T+1才算收益，所以分母是昨日资产。
    // 精确点: 如果昨日资产为0，分母为今日投入。
    const denominator = lastDayTotalAssets.gt(0) ? lastDayTotalAssets : dailyNetInflow
    if (denominator.gt(0)) {
      dayProfitRate = dayProfit.dividedBy(denominator).multipliedBy(100)
    }

    // --- D. 记录数据 ---
    // 为了平滑曲线，如果是非交易日（周末）且没有净值更新，其实数据会保持不变（除了 lastKnownNav 导致的细微变化）
    // 这里我们全量记录，前端再做展示优化

    const point: DailyProfitPoint = {
      date: dateStr,
      totalAssets: Number(currentTotalAssets.toFixed(2)),
      dayProfit: Number(dayProfit.toFixed(2)),
      dayProfitRate: Number(dayProfitRate.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalProfitRate: Number(totalProfitRate.toFixed(2)),
    }

    history.push(point)
    calendar[dateStr] = point.dayProfit

    // 更新状态供下一轮使用
    lastDayTotalAssets = currentTotalAssets
    currentDate = currentDate.add(1, 'day')
  }

  // 6. 生成 Summary
  const lastPoint = history[history.length - 1] || {
    dayProfit: 0,
    totalProfitRate: 0,
    totalAssets: 0,
    totalProfit: 0,
  }

  // [修复] 明确获取“昨天”的数据点用于展示
  const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  // 在 history 数组中倒序查找（因为在末尾附近），找到日期匹配的记录
  // 如果昨天是周末或刚开始回测没数据，则回退为 0
  const yesterdayPoint = history.slice().reverse().find(p => p.date === yesterdayStr)

  // 计算本年收益 (Year To Date Profit)
  const startOfYear = dayjs().startOf('year').format('YYYY-MM-DD')
  const startOfYearPoint = history.find(p => p.date >= startOfYear)

  const yearProfit = startOfYearPoint
    ? new BigNumber(lastPoint.totalProfit).minus(startOfYearPoint.totalProfit).toNumber()
    : lastPoint.totalProfit

  return {
    summary: {
      // [修改] 这里使用明确查找到的 yesterdayPoint
      yesterdayProfit: yesterdayPoint ? yesterdayPoint.dayProfit : 0,
      yearProfit,
      // 累计收益率和总资产依然显示“当前/最新”的状态 (即 lastPoint)
      totalProfitRate: lastPoint.totalProfitRate,
      totalAssets: lastPoint.totalAssets,
    },
    history,
    calendar,
  }
})
