import { and, desc, eq } from 'drizzle-orm'
import { strategyTiersHistory } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

/**
 * 查询基金档位策略的历史快照 (按日期倒序, 每天每来源一条)。
 * query: ?limit=60 最多返回条数 (默认 60)
 */
export default defineEventHandler(async (event) => {
  getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码不能为空。' })

  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 60, 1), 365)

  const db = useDb()
  const rows = await db.select()
    .from(strategyTiersHistory)
    .where(and(eq(strategyTiersHistory.fundCode, code)))
    .orderBy(desc(strategyTiersHistory.date), desc(strategyTiersHistory.updatedAt))
    .limit(limit)

  return {
    code,
    history: rows.map(r => ({
      date: r.date,
      source: r.source,
      tiers: r.tiers,
      nav: r.nav != null ? Number(r.nav) : null,
      ma20: r.ma20 != null ? Number(r.ma20) : null,
      ma60: r.ma60 != null ? Number(r.ma60) : null,
      ma250: r.ma250 != null ? Number(r.ma250) : null,
      rsi14: r.rsi14,
      bias20: r.bias20,
      reason: r.reason,
      updatedAt: r.updatedAt,
    })),
  }
})
