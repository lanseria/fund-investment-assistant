import { desc, eq } from 'drizzle-orm'
import { funds, navHistory } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { analyzePullback } from '~~/server/utils/pullbackStrategy'
import { PULLBACK_LIMITATIONS, PULLBACK_PARAMS, PULLBACK_STATUS_LABEL } from '~~/shared/pullbackStrategy'

/**
 * 强势基金回调买入法（场外日线分批版）图表数据。
 *
 * 只面向场外基金（fundType = 'open'）：分钟级买点、即时止损、AVWAP 与跳空缺口
 * 对场外基金不可执行，场内 ETF/LOF 请使用档位策略图，因此场内直接返回 supported = false。
 * 返回内容为基金级数据（与用户无关），仓位建议由前端结合账户资产计算。
 */
export default defineEventHandler(async (event) => {
  getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码不能为空。' })

  const db = useDb()
  const fund = await db.query.funds.findFirst({
    where: eq(funds.code, code),
    columns: { code: true, name: true, fundType: true },
  })
  if (!fund)
    throw createError({ status: 404, statusText: '未找到该基金。' })

  const base = {
    code: fund.code,
    name: fund.name,
    fundType: fund.fundType,
    params: PULLBACK_PARAMS,
    limitations: PULLBACK_LIMITATIONS,
  }

  if (fund.fundType !== 'open') {
    return {
      ...base,
      supported: false,
      unsupportedReason: '本图为「场外基金 · 日线分批低吸版」，仅适用于场外基金；场内 ETF/LOF 的分钟级买点与即时止损无法在净值口径下复现，请参考上方档位策略图。',
      status: 'unsupported' as const,
      statusLabel: PULLBACK_STATUS_LABEL.unsupported,
      latestNav: null,
      latestDate: null,
      series: null,
      structure: null,
      zones: [],
      primaryZone: null,
      keyZone: null,
      levels: null,
      signals: { buy: [], sell: [] },
      dataNote: null,
    }
  }

  // 取最近 400 条已确认净值（升序）：覆盖 EMA50、近 6 月涨幅（126 个交易日）与摆动结构
  const rows = await db.select().from(navHistory).where(eq(navHistory.code, code)).orderBy(desc(navHistory.navDate)).limit(400)
  const history = rows.reverse().map(r => ({ date: r.navDate, nav: Number(r.nav) }))

  const analysis = analyzePullback(history)
  const latest = history[history.length - 1] ?? null

  return {
    ...base,
    supported: true,
    unsupportedReason: null,
    ...analysis,
    statusLabel: PULLBACK_STATUS_LABEL[analysis.status],
    latestNav: latest?.nav ?? null,
    latestDate: latest?.date ?? null,
  }
})
