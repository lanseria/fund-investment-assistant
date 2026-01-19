import { buildAiContext } from '~~/server/utils/aiTrader'
import { getUserFromEvent } from '~~/server/utils/auth'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdingAnalysis'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)

  try {
    // 1. 获取用户持仓详情 (包含信号、指标等)
    const { holdings } = await getUserHoldingsAndSummary(user.id)

    // 2. 复用 AI Trader 的上下文构建逻辑
    // 这将返回包含：market_events (新闻), market_indices (指数), holdings (持仓), watchlist (自选) 的标准结构
    const contextData = await buildAiContext(holdings)

    return contextData
  }
  catch (error: any) {
    console.error(`获取用户上下文数据失败 (User: ${user.username}):`, error)
    throw createError({
      statusCode: 500,
      message: '无法生成上下文数据',
    })
  }
})
