import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds, strategySignals } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { getHistoryWithMA } from '~~/server/utils/holdingAnalysis'

// [修复] 定义包含动态 MA 属性的接口
interface FundHistoryPoint {
  date: string
  nav: number
  ma5?: number
  ma20?: number
  ma60?: number
  [key: string]: any // 允许其他动态属性
}

export default defineMcpTool({
  name: 'get_fund_details',
  description: '获取指定基金的深度诊断信息，包含：基础信息、MA均线数据（MA5/MA20）、最近30天的净值走势以及RSI/MACD等策略信号。',
  inputSchema: {
    fundCode: z.string().describe('基金代码 (例如 "161725")'),
    days: z.number().optional().default(30).describe('获取历史数据的天数，默认为30天'),
  },
  handler: async ({ fundCode, days }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Authentication required. Please provide a valid API key.',
        }],
      }
    }

    const db = useDb()

    // 2. 获取基金基础信息
    const fund = await db.query.funds.findFirst({
      where: eq(funds.code, fundCode),
    })

    if (!fund) {
      return {
        isError: true,
        content: [{ type: 'text', text: `未找到基金代码: ${fundCode}。请确认该基金已添加到系统中。` }],
      }
    }

    // 3. 获取历史净值与均线
    const endDate = dayjs().format('YYYY-MM-DD')
    const startDate = dayjs().subtract(days || 30, 'day').format('YYYY-MM-DD')

    // [修复] 使用 'as' 关键字强制转换类型，告诉 TS 这里包含了 ma5/ma20 等字段
    const history = (await getHistoryWithMA(fundCode, startDate, endDate, [5, 20, 60])) as FundHistoryPoint[]

    // 4. 获取最新策略信号
    const rawSignals = await db.query.strategySignals.findMany({
      where: eq(strategySignals.fundCode, fundCode),
      orderBy: [desc(strategySignals.latestDate)],
      limit: 10,
    })

    const activeSignals: Record<string, any> = {}
    rawSignals.forEach((s) => {
      if (!activeSignals[s.strategyName]) {
        activeSignals[s.strategyName] = {
          signal: s.signal,
          date: s.latestDate,
          reason: s.reason,
          metrics: s.metrics,
        }
      }
    })

    // 5. 组装返回数据
    // history 是按时间正序排列的 (旧 -> 新)，所以最后一个是最新的
    const currentPoint = history.length > 0 ? history[history.length - 1] : null

    // 计算乖离率 (Bias): (现价 - 均线) / 均线
    let bias20 = 'N/A'
    // [修复] 使用可选链 ?. 访问属性，类型安全
    if (currentPoint?.nav && currentPoint?.ma20) {
      const val = ((currentPoint.nav - currentPoint.ma20) / currentPoint.ma20) * 100
      bias20 = `${val.toFixed(2)}%`
    }

    // 简化历史数据
    const recentHistory = history.slice(-10).map(h => ({
      date: h.date,
      nav: h.nav,
      ma5: h.ma5,
      ma20: h.ma20,
    }))

    // [优化] 计算趋势描述
    const trendDescription = (currentPoint?.nav && currentPoint?.ma20)
      ? (currentPoint.nav > currentPoint.ma20 ? 'Bullish (Above MA20)' : 'Bearish (Below MA20)')
      : 'Unknown'

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          info: {
            code: fund.code,
            name: fund.name,
            sector: fund.sector || '未分类',
            latest_nav: currentPoint?.nav,
            latest_date: currentPoint?.date,
          },
          technical_analysis: {
            ma5: currentPoint?.ma5,
            ma20: currentPoint?.ma20,
            ma60: currentPoint?.ma60,
            bias_20: bias20,
            trend: trendDescription,
          },
          strategy_signals: activeSignals,
          recent_price_action: recentHistory,
        }, null, 2),
      }],
    }
  },
})
