// server/utils/tierRepave.ts
// 每周档位重铺 (v1 金额制最小版)：
// 以最新已确认净值为基准，重铺低吸/高抛档位的"净值位"，保留金额、触发条件与减仓比例，
// 并把变更写入 funds.strategy_tiers + strategy_tiers_history 快照。
import type { StrategyBuyTier, StrategySellTier, StrategyTiers } from '~~/shared/strategyTiers'
import { format } from 'date-fns'
import { desc, eq, isNotNull } from 'drizzle-orm'
import { funds, navHistory } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { setFundStrategyTiers } from '~~/server/utils/fundService'
import { buildTierIndicatorContext } from '~~/server/utils/tierStrategy'
import { parseStrategyTiers, repaveStrategyTiersNavs } from '~~/shared/strategyTiers'

export interface TierRepaveChange {
  code: string
  name: string
  /** 重铺基准：最新已确认净值 */
  nav: number
  navDate: string | null
  oldBuyTiers: StrategyBuyTier[]
  newBuyTiers: StrategyBuyTier[]
  oldSellTiers: StrategySellTier[]
  newSellTiers: StrategySellTier[]
  /** 高抛档位是否同步重铺 (false = 保留原档) */
  sellTiersRepaved: boolean
}

export interface TierRepaveResult {
  dryRun: boolean
  /** 配置了档位的基金总数 */
  total: number
  /** 重铺并写库 (dryRun 时为"将会重铺") 的数量 */
  repaved: number
  /** 未启用/数据不足/无档位等跳过数量 */
  skipped: number
  /** 净值未变化、档位无需调整的数量 */
  unchanged: number
  failed: number
  changes: TierRepaveChange[]
  errors: { code: string, name: string, message: string }[]
}

function sameTiers(a: StrategyTiers, b: StrategyTiers): boolean {
  return JSON.stringify({ buy: a.buyTiers, sell: a.sellTiers }) === JSON.stringify({ buy: b.buyTiers, sell: b.sellTiers })
}

/**
 * 对全部已配置档位的基金执行每周重铺。
 * @param options 选项
 * @param options.dryRun true 时只计算并返回变更，不写库
 */
export async function repaveAllFundTiers(options: { dryRun?: boolean } = {}): Promise<TierRepaveResult> {
  const dryRun = options.dryRun === true
  const db = useDb()
  const today = format(new Date(), 'yyyy-MM-dd')
  const result: TierRepaveResult = {
    dryRun,
    total: 0,
    repaved: 0,
    skipped: 0,
    unchanged: 0,
    failed: 0,
    changes: [],
    errors: [],
  }

  const fundRows = await db.select({
    code: funds.code,
    name: funds.name,
    strategyTiers: funds.strategyTiers,
  }).from(funds).where(isNotNull(funds.strategyTiers))

  result.total = fundRows.length

  for (const fund of fundRows) {
    const current = parseStrategyTiers(fund.strategyTiers)
    if (!current || !current.enabled) {
      result.skipped++
      continue
    }

    try {
      // 取最近 300 条确认净值 (升序)，用于计算最新净值 / MA / RSI / bias
      const rows = await db.select().from(navHistory).where(eq(navHistory.code, fund.code)).orderBy(desc(navHistory.navDate)).limit(300)
      const history = rows.reverse().map(r => ({ date: r.navDate, nav: Number(r.nav) }))
      const ctx = buildTierIndicatorContext(history)
      if (!ctx || !(ctx.nav > 0)) {
        result.skipped++
        continue
      }

      const repaved = repaveStrategyTiersNavs(current, ctx.nav)
      if (!repaved) {
        result.skipped++
        continue
      }

      if (sameTiers(current, repaved)) {
        result.unchanged++
        continue
      }

      const navText = `${ctx.nav}${ctx.date ? `（${ctx.date}）` : ''}`
      const reason = `每周重铺(${today})：以最新确认净值 ${navText} 为基准重铺档位净值（低吸首档 -5%，保持原档距比例），金额/触发条件/高抛比例不变。`
      const next: StrategyTiers = {
        ...repaved,
        note: `每周重铺(${today})：以最新确认净值 ${navText} 为基准重铺档位；金额/触发/高抛比例沿用上一版。`,
      }

      if (!dryRun) {
        await setFundStrategyTiers(fund.code, next, {
          source: 'weekly',
          reason,
          context: ctx,
        })
      }

      result.repaved++
      result.changes.push({
        code: fund.code,
        name: fund.name,
        nav: ctx.nav,
        navDate: ctx.date,
        oldBuyTiers: current.buyTiers,
        newBuyTiers: next.buyTiers,
        oldSellTiers: current.sellTiers,
        newSellTiers: next.sellTiers,
        sellTiersRepaved: JSON.stringify(current.sellTiers) !== JSON.stringify(next.sellTiers),
      })
    }
    catch (e: any) {
      result.failed++
      result.errors.push({ code: fund.code, name: fund.name, message: e?.message ?? String(e) })
    }
  }

  return result
}
