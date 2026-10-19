import type { StrategyTiers } from '~~/shared/strategyTiers'
import { desc, eq, sql } from 'drizzle-orm'
import { strategyTiersHistory } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

/**
 * 获取基金档位策略的历史快照 (按日期倒序)。
 * query: ?limit=30 (1~100)
 */
export default defineEventHandler(async (event) => {
  getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码不能为空。' })

  const query = getQuery(event)
  const rawLimit = Number(query.limit)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT

  const db = useDb()
  const rows = await db.select({
    date: sql<string>`to_char(${strategyTiersHistory.date}, 'YYYY-MM-DD')`.as('date'),
    source: strategyTiersHistory.source,
    tiers: strategyTiersHistory.tiers,
    nav: strategyTiersHistory.nav,
    ma20: strategyTiersHistory.ma20,
    ma60: strategyTiersHistory.ma60,
    ma250: strategyTiersHistory.ma250,
    rsi14: strategyTiersHistory.rsi14,
    bias20: strategyTiersHistory.bias20,
    reason: strategyTiersHistory.reason,
    updatedAt: strategyTiersHistory.updatedAt,
  }).from(strategyTiersHistory).where(eq(strategyTiersHistory.fundCode, code)).orderBy(desc(strategyTiersHistory.date), desc(strategyTiersHistory.id)).limit(limit)

  return {
    code,
    history: rows.map(row => ({
      ...row,
      tiers: row.tiers as StrategyTiers | null,
    })),
  }
})
