import type { DailyProfitPoint } from '~~/server/utils/profitHistory'
import BigNumber from 'bignumber.js'
import { format, startOfYear, subDays } from 'date-fns'
import { and, asc, eq } from 'drizzle-orm'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { buildNavMap, simulateProfitHistory } from '~~/server/utils/profitHistory'

// 定义返回给前端的数据结构
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

  // 2. 批量获取涉及基金的历史净值并逐日回测
  const navMap = await buildNavMap([...new Set(allTxs.map(t => t.fundCode))], allTxs[0]!.orderDate)
  const history = simulateProfitHistory(allTxs, navMap)

  const calendar: Record<string, number> = {}
  history.forEach((p) => {
    calendar[p.date] = p.dayProfit
  })

  // 3. 生成 Summary
  const lastPoint = history.at(-1) || {
    dayProfit: 0,
    totalProfitRate: 0,
    totalAssets: 0,
    totalProfit: 0,
  }

  // 明确获取“昨天”的数据点用于展示
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  // 在 history 数组中倒序查找（因为在末尾附近），找到日期匹配的记录
  // 如果昨天是周末或刚开始回测没数据，则回退为 0
  const yesterdayPoint = history.toReversed().find(p => p.date === yesterdayStr)

  // 计算本年收益 (Year To Date Profit)
  const startOfYearStr = format(startOfYear(new Date()), 'yyyy-MM-dd')
  const startOfYearPoint = history.find(p => p.date >= startOfYearStr)

  const yearProfit = startOfYearPoint
    ? new BigNumber(lastPoint.totalProfit).minus(startOfYearPoint.totalProfit).toNumber()
    : lastPoint.totalProfit

  return {
    summary: {
      // 这里使用明确查找到的 yesterdayPoint
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
