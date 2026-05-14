import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds, strategySignals } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { getHistoryWithMA } from '~~/server/utils/holdingAnalysis'

// 定义包含动态 MA 属性的接口
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
  description: '获取指定基金的深度诊断信息，包含：基础信息、MA均线数据（MA5/MA20/MA60）、MACD指标、乖离率、趋势判断、最近30天的净值走势以及RSI/布林带等策略信号。',
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
    // 扩大查询窗口确保 MA 均线有足够数据点（MA60 需约 90 个交易日）
    const endDate = dayjs().format('YYYY-MM-DD')
    const queryDays = Math.max((days || 30) + 90, 120)
    const startDate = dayjs().subtract(queryDays, 'day').format('YYYY-MM-DD')

    // 使用 'as' 关键字强制转换类型，告诉 TS 这里包含了 ma5/ma20 等字段
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
    const currentPoint = history.length > 0 ? history.at(-1) : null

    // 计算乖离率 (Bias): (现价 - 均线) / 均线
    let bias5 = 'N/A'
    let bias20 = 'N/A'
    let bias60 = 'N/A'
    if (currentPoint?.nav && currentPoint?.ma5) {
      const val = ((currentPoint.nav - currentPoint.ma5) / currentPoint.ma5) * 100
      bias5 = `${val.toFixed(2)}%`
    }
    if (currentPoint?.nav && currentPoint?.ma20) {
      const val = ((currentPoint.nav - currentPoint.ma20) / currentPoint.ma20) * 100
      bias20 = `${val.toFixed(2)}%`
    }
    if (currentPoint?.nav && currentPoint?.ma60) {
      const val = ((currentPoint.nav - currentPoint.ma60) / currentPoint.ma60) * 100
      bias60 = `${val.toFixed(2)}%`
    }

    // 计算 MACD (12,26,9)
    let macdSignal: Record<string, any> = {}
    if (history.length >= 35) {
      // 计算 EMA12 和 EMA26
      const ema12: number[] = []
      const ema26: number[] = []
      const dif: number[] = []
      const mult12 = 2 / (12 + 1)
      const mult26 = 2 / (26 + 1)

      // 初始化 EMA（使用首日净值作为种子）
      const len = history.length
      ema12[0] = history[0].nav
      ema26[0] = history[0].nav
      dif[0] = 0

      for (let i = 1; i < len; i++) {
        ema12[i] = history[i].nav * mult12 + ema12[i - 1] * (1 - mult12)
        ema26[i] = history[i].nav * mult26 + ema26[i - 1] * (1 - mult26)
        dif[i] = ema12[i] - ema26[i]
      }

      // 计算 DEA (DIF 的 9 日 EMA)
      const dea: number[] = []
      const mult9 = 2 / (9 + 1)
      dea[0] = dif[0]
      for (let i = 1; i < len; i++) {
        dea[i] = dif[i] * mult9 + dea[i - 1] * (1 - mult9)
      }

      const lastIdx = len - 1
      const prevIdx = lastIdx - 1
      const macdHistogram = 2 * (dif[lastIdx] - dea[lastIdx])

      macdSignal = {
        dif: Number(dif[lastIdx].toFixed(4)),
        dea: Number(dea[lastIdx].toFixed(4)),
        macd: Number(macdHistogram.toFixed(4)),
        prev_dif: prevIdx >= 0 ? Number(dif[prevIdx].toFixed(4)) : null,
        prev_dea: prevIdx >= 0 ? Number(dea[prevIdx].toFixed(4)) : null,
        cross: prevIdx >= 0
          ? (dif[prevIdx] < dea[prevIdx] && dif[lastIdx] > dea[lastIdx]
              ? 'golden_cross'
              : dif[prevIdx] > dea[prevIdx] && dif[lastIdx] < dea[lastIdx]
                ? 'death_cross'
                : 'none')
          : 'unknown',
      }
    }

    // 计算趋势描述：基于均线排列
    const hasAllMA = currentPoint?.nav && currentPoint?.ma5 && currentPoint?.ma20 && currentPoint?.ma60
    let trendDescription = 'Unknown'
    if (hasAllMA) {
      if (currentPoint!.nav > currentPoint!.ma5! && currentPoint!.ma5! > currentPoint!.ma20! && currentPoint!.ma20! > currentPoint!.ma60!) {
        trendDescription = 'Strong Bullish (All MA Bullish Alignment)'
      }
      else if (currentPoint!.nav > currentPoint!.ma20!) {
        trendDescription = 'Bullish (Above MA20)'
      }
      else if (currentPoint!.nav < currentPoint!.ma5! && currentPoint!.ma5! < currentPoint!.ma20! && currentPoint!.ma20! < currentPoint!.ma60!) {
        trendDescription = 'Strong Bearish (All MA Bearish Alignment)'
      }
      else {
        trendDescription = 'Bearish (Below MA20)'
      }
    }

    // 计算 MA5 趋势方向（连续3天）
    let ma5Trend = 'unknown'
    if (history.length >= 5) {
      const recentMA5 = history.slice(-3).map(h => h.ma5).filter(Boolean) as number[]
      if (recentMA5.length === 3) {
        ma5Trend = recentMA5[0] < recentMA5[1] && recentMA5[1] < recentMA5[2]
          ? 'rising'
          : recentMA5[0] > recentMA5[1] && recentMA5[1] > recentMA5[2]
            ? 'falling'
            : 'mixed'
      }
    }

    // 简化历史数据（最近10天）
    const recentHistory = history.slice(-10).map(h => ({
      date: h.date,
      nav: h.nav,
      ma5: h.ma5,
      ma20: h.ma20,
      ma60: h.ma60,
    }))

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
            bias5,
            bias20,
            bias60,
            trend: trendDescription,
            ma5_trend: ma5Trend,
            macd: macdSignal,
          },
          strategy_signals: activeSignals,
          recent_price_action: recentHistory,
        }, null, 2),
      }],
    }
  },
})
