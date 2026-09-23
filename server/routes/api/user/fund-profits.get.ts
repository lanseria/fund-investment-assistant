import BigNumber from 'bignumber.js'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { funds, fundTransactions, holdings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { getBatchLatest2Navs, isEstimateFresh } from '~~/server/utils/holdingAnalysis'
import { summarizeFundProfit } from '~~/server/utils/profitHistory'

/** 基金收益总览单行 (持有中 + 已清仓的所有基金) */
export interface FundProfitRow {
  code: string
  name: string
  sector: string | null
  /** held: 持有中 / sold: 已清仓 */
  status: 'held' | 'sold'
  /** 首次交易日期 (yyyy-MM-dd) */
  firstTradeDate: string | null
  /** 最近交易日期 (yyyy-MM-dd) */
  lastTradeDate: string | null
  shares: number | null
  costPrice: number | null
  /** 持有总成本 = 份额 × 成本价 */
  totalCost: number | null
  /** 当前持有金额 = 份额 × 最新已确认净值 (funds.yesterdayNav) */
  holdingAmount: number | null
  /** 日收益(已确认口径) = 份额 × (最新净值 - 前一交易日净值);无前一净值为 null */
  dayProfit: number | null
  dayProfitRate: number | null
  /** 今日估算收益 = 份额 × (今日估算净值 - 最新确认净值);估值非今日时为 null */
  estimateProfit: number | null
  /** 持有收益(浮动) = 持有金额 - 持有成本 */
  holdingProfit: number | null
  holdingProfitRate: number | null
  /** 累计收益 = 持有收益(浮动) + 已落袋盈亏;已清仓基金即其历史全部落袋盈亏 */
  totalProfit: number
  latestNav: number | null
}

export interface FundProfitsData {
  funds: FundProfitRow[]
  summary: {
    /** 涉及基金总数 (含已清仓) */
    fundCount: number
    heldCount: number
    soldCount: number
    /** 持有中基金的市值合计 */
    totalHoldingAmount: number
    /** 全部基金累计收益合计 */
    totalProfit: number
  }
}

export default defineEventHandler(async (event): Promise<FundProfitsData> => {
  const user = getUserFromEvent(event)
  const db = useDb()

  const [userHoldings, confirmedTxs] = await Promise.all([
    db.query.holdings.findMany({
      where: eq(holdings.userId, user.id),
    }),
    db.query.fundTransactions.findMany({
      where: and(
        eq(fundTransactions.userId, user.id),
        eq(fundTransactions.status, 'confirmed'),
      ),
      orderBy: [asc(fundTransactions.orderDate)],
    }),
  ])

  // 涉及基金 = 有已确认交易的 ∪ 当前仍有持仓份额的 (纯关注、从未交易的基金没有收益数据,不纳入)
  const txCodes = [...new Set(confirmedTxs.map(t => t.fundCode))]
  const heldCodes = userHoldings
    .filter(h => h.shares && new BigNumber(h.shares).isGreaterThan(0))
    .map(h => h.fundCode)
  const codes = [...new Set([...txCodes, ...heldCodes])]

  if (codes.length === 0) {
    return {
      funds: [],
      summary: { fundCount: 0, heldCount: 0, soldCount: 0, totalHoldingAmount: 0, totalProfit: 0 },
    }
  }

  const [fundInfos, latest2NavsMap] = await Promise.all([
    db.query.funds.findMany({ where: inArray(funds.code, codes) }),
    getBatchLatest2Navs(codes),
  ])
  const fundMap = new Map(fundInfos.map(f => [f.code, f]))

  // 已落袋盈亏回测:卖出份额超过交易推导份额时(手工导入),缺口按当前持仓成本价兜底
  const fallbackCostPrice: Record<string, number> = {}
  for (const h of userHoldings) {
    if (h.costPrice)
      fallbackCostPrice[h.fundCode] = Number(h.costPrice)
  }
  const summaries = summarizeFundProfit(confirmedTxs, fallbackCostPrice)

  const rows: FundProfitRow[] = []
  let heldCount = 0
  let totalHoldingAmount = new BigNumber(0)
  let totalProfit = new BigNumber(0)

  for (const code of codes) {
    const fundInfo = fundMap.get(code)
    if (!fundInfo)
      continue

    const holdingRow = userHoldings.find(h => h.fundCode === code)
    const isHeld = !!(holdingRow?.shares && holdingRow?.costPrice && new BigNumber(holdingRow.shares).isGreaterThan(0))
    const summary = summaries.get(code)
    const realized = new BigNumber(summary?.realizedProfit ?? 0)
    const latestNav = new BigNumber(fundInfo.yesterdayNav)

    const row: FundProfitRow = {
      code,
      name: fundInfo.name,
      sector: fundInfo.sector,
      status: isHeld ? 'held' : 'sold',
      firstTradeDate: summary?.firstTradeDate ?? null,
      lastTradeDate: summary?.lastTradeDate ?? null,
      shares: null,
      costPrice: null,
      totalCost: null,
      holdingAmount: null,
      dayProfit: null,
      dayProfitRate: null,
      estimateProfit: null,
      holdingProfit: null,
      holdingProfitRate: null,
      totalProfit: 0,
      latestNav: latestNav.toNumber(),
    }

    if (isHeld && holdingRow) {
      heldCount++
      const shares = new BigNumber(holdingRow.shares!)
      const costPrice = new BigNumber(holdingRow.costPrice!)

      // 与首页持仓列表口径一致:持有金额/持有收益按最新已确认净值
      const totalCost = shares.times(costPrice)
      const holdingAmount = shares.times(latestNav)
      const holdingProfit = holdingAmount.minus(totalCost)

      row.shares = shares.toNumber()
      row.costPrice = costPrice.toNumber()
      row.totalCost = totalCost.toNumber()
      row.holdingAmount = holdingAmount.toNumber()
      row.holdingProfit = holdingProfit.toNumber()
      row.holdingProfitRate = totalCost.isGreaterThan(0)
        ? holdingProfit.dividedBy(totalCost).times(100).toNumber()
        : 0

      // 日收益(已确认口径):最新净值 vs 前一交易日净值,与持仓列表"昨日收益"同口径
      const latest2 = latest2NavsMap.get(code)
      if (latest2 && latest2.prev !== null && latest2.prev > 0) {
        row.dayProfit = shares.times(latest2.latest).minus(shares.times(latest2.prev)).toNumber()
        row.dayProfitRate = new BigNumber(latest2.latest)
          .minus(latest2.prev)
          .dividedBy(latest2.prev)
          .times(100)
          .toNumber()
      }

      // 今日估算收益:估值更新时间为今日时提供,前端标注"估"
      if (fundInfo.todayEstimateNav && isEstimateFresh(fundInfo.todayEstimateUpdateTime)) {
        row.estimateProfit = shares.times(new BigNumber(fundInfo.todayEstimateNav)).minus(holdingAmount).toNumber()
      }

      totalHoldingAmount = totalHoldingAmount.plus(holdingAmount)
      row.totalProfit = holdingProfit.plus(realized).toNumber()
    }
    else {
      // 已清仓:累计收益即历史全部已落袋盈亏
      row.totalProfit = realized.toNumber()
    }

    totalProfit = totalProfit.plus(row.totalProfit)
    rows.push(row)
  }

  // 默认排序:持有中在前,组内按持有金额/累计收益降序 (前端可再排序)
  rows.sort((a, b) => {
    if (a.status !== b.status)
      return a.status === 'held' ? -1 : 1
    const keyA = a.status === 'held' ? (a.holdingAmount ?? 0) : a.totalProfit
    const keyB = b.status === 'held' ? (b.holdingAmount ?? 0) : b.totalProfit
    return keyB - keyA
  })

  return {
    funds: rows,
    summary: {
      fundCount: rows.length,
      heldCount,
      soldCount: rows.length - heldCount,
      totalHoldingAmount: totalHoldingAmount.toNumber(),
      totalProfit: totalProfit.toNumber(),
    },
  }
})
