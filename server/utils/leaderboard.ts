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

  // 1. 获取所有用户的持仓数据 + 用户的可用现金
  const allHoldings = await db
    .select({
      userId: holdings.userId,
      username: users.username,
      isAiAgent: users.isAiAgent,
      userCash: users.availableCash, // [修改] 直接读取可用现金
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

  if (allHoldings.length === 0)
    return []

  // 2. 准备历史净值数据 (用于计算区间收益)
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
      // 使用 Postgres 的 DISTINCT ON 获取每个基金在 targetDate 之前(或当天) 的最近一条净值
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
  const userMap = new Map<number, LeaderboardUser>()

  for (const h of allHoldings) {
    if (!userMap.has(h.userId)) {
      userMap.set(h.userId, {
        id: h.userId,
        rank: 0,
        username: h.username,
        isAiAgent: h.isAiAgent,
        // 初始化现金 (从第一条记录获取即可，因为同一用户的 userCash 是一样的)
        cash: Number(h.userCash || 0),
        fundValue: 0,
        totalAssets: 0, // 稍后计算
        periodProfit: 0,
        periodProfitRate: 0,
        holdingCount: 0,
      })
    }

    const user = userMap.get(h.userId)!
    const shares = new BigNumber(h.shares || 0)

    // A. 计算当前市值 (Live Value)
    const yesterdayNav = Number(h.yesterdayNav)
    // 优先取今日实时估值，否则取昨日净值
    const currentPrice = h.todayEstimateNav ? Number(h.todayEstimateNav) : yesterdayNav
    const holdingValue = shares.multipliedBy(currentPrice).toNumber()

    user.fundValue += holdingValue
    user.holdingCount += 1

    // B. 计算区间收益 (Profit)
    // 逻辑：(当前价 - 期初价) * 份额
    // 注意：这里的期初价是“当前持有份额在期初的价值”，忽略了期间交易导致的份额变化
    // 这是一种静态回测算法，对于高频交易用户会有误差，但对大多数用户足够准确
    let startPrice = 0
    if (period === '1d') {
      startPrice = yesterdayNav
    }
    else {
      // 如果找不到历史净值（如新发基金），则假设期初=当前（收益为0）
      startPrice = startNavMap.get(h.fundCode) || currentPrice
    }

    const profit = shares.multipliedBy(currentPrice - startPrice).toNumber()
    user.periodProfit += profit
  }

  // 4. 最终结算与排序
  const usersList = Array.from(userMap.values()).map((u) => {
    // 实时总权益 = 数据库记录的现金 + 实时持仓市值
    const realTimeTotalAssets = u.cash + u.fundValue
    u.totalAssets = realTimeTotalAssets

    // 收益率计算
    // 分母(期初权益) = 期末权益 - 期间收益
    // 假设这是一个封闭系统(无充值提现)，则 期初 + 收益 = 期末
    // 如果 totalAssets 为 0 (空仓且无现金)，则收益率为 0
    const startEquity = realTimeTotalAssets - u.periodProfit

    if (startEquity > 0) {
      u.periodProfitRate = (u.periodProfit / startEquity) * 100
    }
    else {
      // 如果期初权益 <= 0 (理论上不应发生，除非亏光了或者数据异常)，收益率设为 0
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

  // 添加排名并截取前 50 名
  return usersList.slice(0, 50).map((u, index) => {
    u.rank = index + 1
    return u
  })
}
