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
      const portfolioData = await getUserHoldingsAndSummary(userId)
      const { holdings, summary } = portfolioData

      // 计算板块暴露度和持仓集中度
      const heldItems = holdings.filter(h => h.holdingAmount !== null && h.holdingAmount > 0)
      const totalHeld = heldItems.reduce((sum, h) => sum + (h.holdingAmount || 0), 0)

      const sectorExposure: Record<string, { amount: number, percentage: number, funds: string[] }> = {}
      for (const h of heldItems) {
        const sector = h.sector || '未分类'
        if (!sectorExposure[sector]) {
          sectorExposure[sector] = { amount: 0, percentage: 0, funds: [] }
        }
        sectorExposure[sector].amount += h.holdingAmount || 0
        sectorExposure[sector].funds.push(h.code)
      }
      for (const sector of Object.keys(sectorExposure)) {
        sectorExposure[sector].percentage = totalHeld > 0
          ? Number(((sectorExposure[sector].amount / totalHeld) * 100).toFixed(2))
          : 0
      }

      // 计算集中度告警
      const concentrationWarnings: string[] = []
      for (const h of heldItems) {
        const pct = totalHeld > 0 ? (h.holdingAmount! / totalHeld) * 100 : 0
        if (pct > 30) {
          concentrationWarnings.push(`${h.code}(${h.name}) 占比 ${pct.toFixed(1)}%，超过30%阈值`)
        }
      }
      for (const [sector, data] of Object.entries(sectorExposure)) {
        if (data.percentage > 50) {
          concentrationWarnings.push(`板块[${sector}] 占比 ${data.percentage}%，超过50%阈值`)
        }
      }

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
              totalAssets: summary.totalAssets,
              totalProfit: summary.totalProfitLoss,
              dayChangeRate: summary.totalPercentageChange,
              availableCash: summary.cash,
              holdingCount: heldItems.length,
              staleCount: summary.staleCount,
            },
            risk_metrics: {
              sector_exposure: sectorExposure,
              concentration_warnings: concentrationWarnings,
              max_single_fund_pct: heldItems.length > 0
                ? Number((Math.max(...heldItems.map(h => h.holdingAmount || 0)) / totalHeld * 100).toFixed(1))
                : 0,
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
