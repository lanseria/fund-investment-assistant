import { getCachedMarketData } from '~~/server/utils/market'
import { marketGroups } from '~~/shared/market'

/** 构建 AI 决策所需的上下文数据：实时市场指数 + 持仓/关注列表（精简字段）。 */
export async function buildAiContext(fullHoldingsData: any[]) {
  // A. 获取实时市场指数 (宏观)
  const marketData: Record<string, any[]> = {}
  try {
    const indicesMap = await getCachedMarketData()
    for (const [_, groupInfo] of Object.entries(marketGroups)) {
      const groupList = []
      for (const code of groupInfo.codes) {
        const idx = indicesMap[code]
        if (idx) {
          groupList.push({
            name: idx.name,
            value: idx.value,
            changeRate: `${idx.changeRate.toFixed(2)}%`,
          })
        }
      }
      if (groupList.length > 0) {
        marketData[groupInfo.label] = groupList
      }
    }
  }
  catch (e) {
    console.error('获取市场指数失败:', e)
  }

  // B. 格式化持仓与关注列表
  const floorShares = (num: number) => Math.floor(num * 10000) / 10000

  const simplify = (h: any) => {
    let availableShares = 0
    if (h.shares !== null) {
      const pendingFrozen = h.pendingTransactions
        ?.filter((t: any) => t.type === 'sell' || t.type === 'convert_out')
        .reduce((sum: number, t: any) => sum + (Number(t.orderShares) || 0), 0) || 0

      const rawAvailable = Math.max(0, Number(h.shares) - pendingFrozen)
      availableShares = floorShares(rawAvailable)
    }

    return {
      code: h.code,
      name: h.name,
      ...(h.holdingAmount !== null
        ? {
            costPrice: h.costPrice,
            holdingAmount: h.holdingAmount,
            profitRate: h.holdingProfitRate ? `${h.holdingProfitRate.toFixed(2)}%` : '0%',
            totalShares: h.shares,
            availableShares,
          }
        : {}),
      percentageChange: h.percentageChange ? `${h.percentageChange.toFixed(2)}%` : '0%',
      signals: h.signals,
      bias20: h.bias20,
      recentTransactions: h.recentTransactions?.slice(0, 3).map((t: any) => ({
        type: t.type,
        date: t.date,
        nav: t.nav,
        amount: t.amount,
        shares: t.shares,
      })) || [],
    }
  }

  const myHoldings = fullHoldingsData.filter(h => h.holdingAmount !== null).map(simplify)
  const myWatchlist = fullHoldingsData.filter(h => h.holdingAmount === null).map(simplify)

  return {
    market_indices: marketData,
    holdings: myHoldings,
    watchlist: myWatchlist,
  }
}
