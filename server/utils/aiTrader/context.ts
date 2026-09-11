import { getCachedMarketData } from '~~/server/utils/market'
import { marketGroups } from '~~/shared/market'

/**
 * 计算持仓的可用份额:总份额扣除在途卖出/转出冻结,保留 4 位小数。
 * 上下文构建(availableShares 字段)与碎仓清理兜底共用同一口径。
 */
export function calcAvailableShares(h: any): number {
  if (h.shares === null)
    return 0
  const pendingFrozen = h.pendingTransactions
    ?.filter((t: any) => t.type === 'sell' || t.type === 'convert_out')
    .reduce((sum: number, t: any) => sum + (Number(t.orderShares) || 0), 0) || 0
  return Math.floor(Math.max(0, Number(h.shares) - pendingFrozen) * 10000) / 10000
}

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
  const simplify = (h: any) => ({
    code: h.code,
    name: h.name,
    ...(h.holdingAmount !== null
      ? {
          costPrice: h.costPrice,
          holdingAmount: h.holdingAmount,
          profitRate: h.holdingProfitRate ? `${h.holdingProfitRate.toFixed(2)}%` : '0%',
          totalShares: h.shares,
          availableShares: calcAvailableShares(h),
        }
      : {}),
    percentageChange: h.percentageChange ? `${h.percentageChange.toFixed(2)}%` : '0%',
    signals: h.signals,
    bias20: h.bias20,
    // 用户为该基金自定义的操作策略，是决策的强参考：与信号冲突时应优先尊重用户策略
    ...(h.operationStrategy ? { userStrategy: h.operationStrategy } : {}),
    recentTransactions: h.recentTransactions?.slice(0, 3).map((t: any) => ({
      type: t.type,
      date: t.date,
      nav: t.nav,
      amount: t.amount,
      shares: t.shares,
    })) || [],
  })

  const myHoldings = fullHoldingsData.filter(h => h.holdingAmount !== null).map(simplify)
  const myWatchlist = fullHoldingsData.filter(h => h.holdingAmount === null).map(simplify)

  return {
    market_indices: marketData,
    holdings: myHoldings,
    watchlist: myWatchlist,
  }
}
