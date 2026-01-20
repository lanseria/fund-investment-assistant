import { getUserHoldingsAndSummary } from '~~/server/utils/holdingAnalysis'

export default defineMcpTool({
  name: 'get_portfolio',
  description: '获取用户的当前基金持仓摘要、总资产和详细列表。',
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
      // 2. 获取数据
      const { holdings, summary } = await getUserHoldingsAndSummary(userId)

      // 3. 简化持仓数据以减少 AI Context 占用
      const simplifiedHoldings = holdings.map(h => ({
        code: h.code,
        name: h.name,
        amount: h.holdingAmount,
        profitRate: h.holdingProfitRate,
        todayChange: h.percentageChange,
        recommendation: h.signals?.rsi === '买入' ? 'RSI买入信号' : (h.signals?.rsi === '卖出' ? 'RSI卖出信号' : '持有'),
      }))

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: {
              totalAsset: summary.totalEstimateAmount,
              totalProfit: summary.totalProfitLoss,
              dayChangeRate: summary.totalPercentageChange,
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
