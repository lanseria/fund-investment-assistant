import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { fundTransactions, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { buildNavMap, simulateProfitHistory } from '~~/server/utils/profitHistory'

/** 走势图数据点（精简版，仅保留绘图所需字段） */
interface TrendPoint {
  date: string
  totalProfit: number
  totalProfitRate: number
}

interface TrendUser {
  id: number
  username: string
  aiMode: 'auto' | 'draft' | 'off'
  history: TrendPoint[]
}

/**
 * 排行榜收益走势：批量计算所有用户的逐日累计收益曲线
 * @query aiOnly 仅统计 AI 账号 (aiMode != 'off')，与排行榜筛选保持一致
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const aiOnly = query.aiOnly === 'true' || query.aiOnly === '1'
  const db = useDb()

  try {
    // 1. 一次查询取回所有用户的已确认交易（按日期升序），附带用户信息
    const allTxs = await db
      .select({
        userId: fundTransactions.userId,
        username: users.username,
        aiMode: users.aiMode,
        fundCode: fundTransactions.fundCode,
        orderDate: fundTransactions.orderDate,
        type: fundTransactions.type,
        confirmedAmount: fundTransactions.confirmedAmount,
        confirmedShares: fundTransactions.confirmedShares,
      })
      .from(fundTransactions)
      .innerJoin(users, sql`${fundTransactions.userId} = ${users.id}`)
      .where(and(
        eq(fundTransactions.status, 'confirmed'),
        aiOnly ? ne(users.aiMode, 'off') : undefined,
      ))
      .orderBy(asc(fundTransactions.orderDate))

    if (allTxs.length === 0)
      return []

    // 2. 净值查找表全用户共享（从最早一笔交易日期开始）
    const fundCodes = [...new Set(allTxs.map(t => t.fundCode))]
    const navMap = await buildNavMap(fundCodes, allTxs[0]!.orderDate)

    // 3. 按用户分组后逐日回测（组内保持日期升序）
    const txsByUser = new Map<number, typeof allTxs>()
    const usernameMap = new Map<number, { username: string, aiMode: TrendUser['aiMode'] }>()
    for (const tx of allTxs) {
      if (!txsByUser.has(tx.userId)) {
        txsByUser.set(tx.userId, [])
        usernameMap.set(tx.userId, { username: tx.username, aiMode: tx.aiMode })
      }
      txsByUser.get(tx.userId)!.push(tx)
    }

    const result: TrendUser[] = []
    for (const [userId, txs] of txsByUser.entries()) {
      const info = usernameMap.get(userId)!
      // 精简为绘图所需字段，减小响应体积
      const history = simulateProfitHistory(txs, navMap).map(p => ({
        date: p.date,
        totalProfit: p.totalProfit,
        totalProfitRate: p.totalProfitRate,
      }))
      result.push({ id: userId, username: info.username, aiMode: info.aiMode, history })
    }

    return result
  }
  catch (error) {
    console.error('获取排行榜收益走势时出错:', error)
    throw createError({
      status: 500,
      statusText: '获取收益走势失败。',
    })
  }
})
