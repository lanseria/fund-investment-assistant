import { format, subDays } from 'date-fns'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds, sectorBindings, sectorCapitalHistory, strategySignals } from '~~/server/database/schemas'
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
  description: '获取指定基金的深度诊断信息，包含：基础信息、MA均线数据（MA5/MA20）、最近30天的净值走势、RSI/布林带等策略信号，以及所属板块的主力资金行为（抢筹/建仓/洗盘/出货、主力强度、主力净流入、暗盘等）。',
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
    const endDate = format(new Date(), 'yyyy-MM-dd')
    const queryDays = Math.max((days || 30) + 90, 120)
    const startDate = format(subDays(new Date(), queryDays), 'yyyy-MM-dd')

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

    // 5. 获取该基金所属板块的主力资金行为
    // fund.sector 为项目板块 dictValue，需先通过 sector_bindings 找到对应东财板块代码，
    // 再从 sector_capital_daily 取最近的主力资金快照（与 /api/sectors/[dictValue]/history 逻辑一致）。
    let sectorCapital: Record<string, any> = { bound: false }
    if (fund.sector) {
      const binding = await db.query.sectorBindings.findFirst({
        where: eq(sectorBindings.dictValue, fund.sector),
      })

      if (binding) {
        // 取最近 10 条（按日期倒序），随后反转为升序便于阅读短期趋势
        const recentRecords = await db.query.sectorCapitalHistory.findMany({
          where: eq(sectorCapitalHistory.sectorCode, binding.sectorCode),
          orderBy: [desc(sectorCapitalHistory.date)],
          limit: 10,
        })
        recentRecords.reverse()

        // 升序后最后一条即最新交易日
        const latestRecord = recentRecords[recentRecords.length - 1]
        sectorCapital = {
          sector: fund.sector,
          bound: true,
          sector_code: binding.sectorCode,
          sector_name: binding.sectorName ?? latestRecord?.sectorName ?? null,
          sector_type: binding.sectorType,
          latest: latestRecord
            ? {
                date: latestRecord.date,
                main_action: latestRecord.mainAction, // 抢筹 / 建仓 / 洗盘 / 出货
                main_strength: latestRecord.mainStrength !== null ? Number(latestRecord.mainStrength) : null,
                main_capital: latestRecord.mainCapital !== null ? Number(latestRecord.mainCapital) : null,
                main_hidden: latestRecord.mainHidden !== null ? Number(latestRecord.mainHidden) : null,
                change_percent: latestRecord.changePercent !== null ? Number(latestRecord.changePercent) : null,
              }
            : null,
          recent_trend: recentRecords.map(r => ({
            date: r.date,
            main_action: r.mainAction,
            main_strength: r.mainStrength !== null ? Number(r.mainStrength) : null,
          })),
        }
      }
      else {
        sectorCapital = { sector: fund.sector, bound: false }
      }
    }

    // 6. 组装返回数据
    // history 是按时间正序排列的 (旧 -> 新)，所以最后一个是最新的
    const currentPoint = history.length > 0 ? history.at(-1) : null

    // 计算乖离率 (Bias): (现价 - 均线) / 均线
    let bias20 = 'N/A'
    // 使用可选链 ?. 访问属性，类型安全
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
          sector_capital: sectorCapital,
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
