import type { LeaderboardPeriod, LeaderboardUser } from '~/types/leaderboard'
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { sql } from 'drizzle-orm'
import { funds, holdings, navHistory, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

/**
 * 获取排行榜数据
 * @param period 时间周期: '1d' (日), '1w' (周), '1m' (月), '1y' (年)
 */
export async function getLeaderboardData(period: LeaderboardPeriod = '1d'): Promise<LeaderboardUser[]> {
  const db = useDb()

  // 1. 获取所有用户的持仓数据 + 用户设置的总资产
  const allHoldings = await db
    .select({
      userId: holdings.userId,
      username: users.username,
      isAiAgent: users.isAiAgent,
      userDeclaredAssets: users.totalAssets, // 用户在后台设置的总资产 (作为基准成本)
      fundCode: holdings.fundCode,
      shares: holdings.shares,
      costPrice: holdings.costPrice,
      // 基金实时数据
      fundName: funds.name,
      yesterdayNav: funds.yesterdayNav,
      todayEstimateNav: funds.todayEstimateNav,
    })
    .from(holdings)
    .innerJoin(users, sql`${holdings.userId} = ${users.id}`)
    .innerJoin(funds, sql`${holdings.fundCode} = ${funds.code}`)

  // 即使没有持仓的用户，如果有设置 totalAssets 也应该上榜吗？
  // 目前逻辑是 innerJoin holdings，所以必须有持仓才能上榜。
  // 如果想让空仓用户也上榜，需要改为 rightJoin users 并处理 null holdings。
  // 暂时保持“有持仓才参与排行”的逻辑。
  if (allHoldings.length === 0)
    return []

  // 2. 准备历史净值数据 (用于计算区间收益)
  // 如果是 '1d'，我们直接用 funds 表数据，不需要查 history
  const startNavMap = new Map<string, number>()

  if (period !== '1d') {
    let startDate = dayjs()
    if (period === '1w')
      startDate = startDate.startOf('week')
    else if (period === '1m')
      startDate = startDate.startOf('month')
    else if (period === '1y')
      startDate = startDate.startOf('year')

    const targetDateStr = startDate.format('YYYY-MM-DD')
    const fundCodes = [...new Set(allHoldings.map(h => h.fundCode))]

    if (fundCodes.length > 0) {
      const historyQuery = sql`
        SELECT DISTINCT ON (code) code, nav
        FROM ${navHistory}
        WHERE nav_date <= ${targetDateStr}
        AND code IN ${fundCodes}
        ORDER BY code, nav_date DESC
      `
      const historyResults = await db.execute(historyQuery)
      for (const row of historyResults.rows) {
        startNavMap.set(String(row.code), Number(row.nav))
      }
    }
  }

  // 3. 计算每个用户的资产状况
  // 我们使用一个中间对象来暂存计算所需的累计值
  interface UserStats {
    info: LeaderboardUser
    totalCost: number // 累计持仓成本 (用于计算 Cash)
  }
  const userMap = new Map<number, UserStats>()

  for (const h of allHoldings) {
    if (!userMap.has(h.userId)) {
      userMap.set(h.userId, {
        info: {
          id: h.userId,
          rank: 0,
          username: h.username,
          isAiAgent: h.isAiAgent,
          totalAssets: 0,
          fundValue: 0,
          cash: 0,
          periodProfit: 0,
          periodProfitRate: 0,
          holdingCount: 0,
        },
        totalCost: 0,
      })
    }

    const stats = userMap.get(h.userId)!
    const user = stats.info

    // 基础数据处理
    const shares = new BigNumber(h.shares || 0)
    const costPrice = new BigNumber(h.costPrice || 0)

    // 1. 累计持仓成本 (用于后续推导现金)
    const holdingCost = shares.multipliedBy(costPrice).toNumber()
    stats.totalCost += holdingCost

    // 2. 计算当前市值 (Live Value)
    const yesterdayNav = Number(h.yesterdayNav)
    // 优先取今日实时估值，否则取昨日净值
    const currentPrice = h.todayEstimateNav ? Number(h.todayEstimateNav) : yesterdayNav
    const holdingValue = shares.multipliedBy(currentPrice).toNumber()

    user.fundValue += holdingValue
    user.holdingCount += 1

    // 3. 计算区间收益 (Profit)
    // 逻辑：(当前价 - 期初价) * 份额
    let startPrice = 0
    if (period === '1d') {
      startPrice = yesterdayNav
    }
    else {
      // 如果找不到历史净值（如新发基金），则假设期初=当前（收益为0），避免极端数据
      startPrice = startNavMap.get(h.fundCode) || currentPrice
    }

    const profit = shares.multipliedBy(currentPrice - startPrice).toNumber()
    user.periodProfit += profit

    // 我们在这里把 userDeclaredAssets 存入 totalAssets 暂时占位，最后循环再统一结算
    // 注意：h.userDeclaredAssets 是字符串
    user.totalAssets = Number(h.userDeclaredAssets || 0)
  }

  // 4. 最终结算与排序
  const usersList = Array.from(userMap.values()).map((stats) => {
    const u = stats.info
    const declaredAssets = u.totalAssets // 这是用户在后台填写的“账户总资产”

    // 核心逻辑：推导现金
    // 现金 = 用户填写的总资产 - 持仓总成本
    // 如果用户没填总资产(0)，或者填写的值小于持仓成本，则假设现金为 0
    let cash = 0
    if (declaredAssets > stats.totalCost) {
      cash = declaredAssets - stats.totalCost
    }

    u.cash = cash

    // 实时总权益 = 现金 + 当前持仓市值
    // 注意：这里我们重新计算 totalAssets，使其反映实时涨跌
    // 用户的 declaredAssets 相当于 "Book Value" (账面成本 + 现金)，而这里算出的是 "Market Value"
    const realTimeTotalAssets = cash + u.fundValue
    u.totalAssets = realTimeTotalAssets

    // 计算收益率
    // 分母 = 期初权益 = 期末权益 - 期间收益
    const startEquity = realTimeTotalAssets - u.periodProfit

    if (startEquity > 0) {
      u.periodProfitRate = (u.periodProfit / startEquity) * 100
    }
    else {
      u.periodProfitRate = 0
    }

    // 格式化小数位
    u.totalAssets = Number(u.totalAssets.toFixed(2))
    u.fundValue = Number(u.fundValue.toFixed(2))
    u.cash = Number(u.cash.toFixed(2))
    u.periodProfit = Number(u.periodProfit.toFixed(2))

    return u
  })

  // 按收益率降序排序
  usersList.sort((a, b) => b.periodProfitRate - a.periodProfitRate)

  // 添加排名
  return usersList.slice(0, 50).map((u, index) => {
    u.rank = index + 1
    return u
  })
}
