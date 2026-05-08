import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdingAnalysis'

export default defineMcpTool({
  name: 'get_portfolio',
  description: '获取用户的当前基金持仓摘要、总资产、可用现金、近期交易记录和详细列表。列表包含基金代码、名称、板块、持有金额、收益率、策略信号建议及近期交易记录。',
  // 不需要任何参数，直接从 Context 获取用户
  inputSchema: {},
  handler: async () => {
    const event = useEvent()
    const userId = event.context.userId

    // 工具层面的硬性拦截
    if (!userId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Authentication required. Please provide a valid API key in the Authorization header (Bearer token).',
        }],
      }
    }

    try {
      const db = useDb()
      const [portfolioData, userData] = await Promise.all([
        getUserHoldingsAndSummary(userId),
        db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { availableCash: true },
        }),
      ])

      const { holdings, summary } = portfolioData

      // 简化持仓数据，保留近期交易记录用于判断惩罚费率和做T条件
      const simplifiedHoldings = holdings.map(h => ({
        code: h.code,
        name: h.name,
        sector: h.sector || '未分类',
        amount: h.holdingAmount,
        profitRate: h.holdingProfitRate,
        todayChange: h.percentageChange,
        recommendation: h.signals?.rsi === '买入' ? 'RSI买入信号' : (h.signals?.rsi === '卖出' ? 'RSI卖出信号' : '持有'),
        recentTransactions: h.recentTransactions,
      }))

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: {
              totalAsset: summary.totalEstimateAmount,
              totalProfit: summary.totalProfitLoss,
              dayChangeRate: summary.totalPercentageChange,
              availableCash: userData?.availableCash ? Number(userData.availableCash) : 0,
            },
            holdings: simplifiedHoldings,
          }, null, 2),
        }],
      }
    }
    catch (error: any) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `查询错误: ${error.message}`,
        }],
      }
    }
  },
})
