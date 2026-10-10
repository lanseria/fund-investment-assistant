import type { StrategyTiers } from '~~/shared/strategyTiers'
import { desc, eq } from 'drizzle-orm'
import { funds, navHistory, users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { computeRsi } from '~~/server/utils/indicators'
import { buildTierIndicatorContext, describeStrategyTiers, evaluateStrategyTiers } from '~~/server/utils/tierStrategy'
import { generateDefaultTiers, parseStrategyTiers } from '~~/shared/strategyTiers'

/**
 * 获取基金的结构化档位策略 + 基于最新已确认净值的决策评估。
 * query: ?full=1 时附带最近 250 个交易日的净值/MA/RSI 序列 (供档位可视化图表使用)。
 */
export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码不能为空。' })

  const db = useDb()
  // 当前用户可用现金: 用于把低吸百分比折算成金额展示
  const me = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { availableCash: true } })
  const availableCash = Number(me?.availableCash ?? 0)

  const fund = await db.query.funds.findFirst({
    where: eq(funds.code, code),
    columns: { code: true, name: true, yesterdayNav: true, strategyTiers: true },
  })
  if (!fund)
    throw createError({ status: 404, statusText: '未找到该基金。' })

  const tiers: StrategyTiers | null = parseStrategyTiers(fund.strategyTiers)

  // 取最近 300 条已确认净值 (升序)，保证 MA250/RSI14 可计算
  const rows = await db.select().from(navHistory).where(eq(navHistory.code, code)).orderBy(desc(navHistory.navDate)).limit(300)
  const history = rows.reverse().map(r => ({ date: r.navDate, nav: Number(r.nav) }))

  const ctx = buildTierIndicatorContext(history)
  const decision = (tiers && ctx) ? evaluateStrategyTiers(tiers, ctx, availableCash) : null
  const summary = tiers ? describeStrategyTiers(tiers) : null

  // 可视化序列 (净值 + MA20/60/250 + RSI14)
  let series: { dates: string[], nav: number[], ma20: (number | null)[], ma60: (number | null)[], ma250: (number | null)[], rsi14: (number | null)[] } | null = null
  if (history.length > 0) {
    const navs = history.map(p => p.nav)
    const ma = (period: number): (number | null)[] =>
      history.map((_, i) => (i + 1 >= period ? Number((navs.slice(i + 1 - period, i + 1).reduce((s, v) => s + v, 0) / period).toFixed(4)) : null))
    series = {
      dates: history.map(p => p.date),
      nav: navs,
      ma20: ma(20),
      ma60: ma(60),
      ma250: ma(250),
      rsi14: history.map((_, i) => (i + 1 >= 15 ? computeRsi(navs.slice(0, i + 1), 14) : null)),
    }
  }

  return {
    availableCash,
    code: fund.code,
    name: fund.name,
    latestNav: ctx?.nav ?? Number(fund.yesterdayNav),
    /** 未配置档位时前端可用最新净值生成默认模板 */
    defaultTiers: generateDefaultTiers(ctx?.nav ?? Number(fund.yesterdayNav)),
    tiers,
    summary,
    context: ctx,
    decision,
    series,
  }
})
