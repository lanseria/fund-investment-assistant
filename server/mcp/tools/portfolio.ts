import { getUserHoldingsAndSummary } from '~~/server/utils/holdingAnalysis'
import { buildMcpMeta, localDateStr } from '~~/server/utils/mcpMeta'

export default defineMcpTool({
  name: 'get_portfolio',
  description: `获取当前认证用户的基金持仓摘要、总资产、可用现金与持仓明细（不需要参数，用户从 Bearer Token 解析）。所有响应都包在 { meta, data } 外壳中：meta.as_of 为数据生成日，meta.staleness 声明各区块口径；金额币种为人民币 CNY，单位"元"。

【返回内容清单】
1) summary：totalAssets（总资产=持仓市值+现金，单位元）、availableCash（可用现金，单位元）、totalProfit（今日有效收益额，单位元，可为负；仅统计盘中估值未过期的持仓）、dayChangeRate（今日收益率，数值单位 %，如 1.83 表示 +1.83%，不是 0.0183；同样仅统计估值未过期的持仓）、yesterdayProfit（昨日收益额，单位元，已确认净值口径=份额×(最新净值-前一净值)，基于当前持仓份额）、yesterdayProfitRate（昨日收益率，数值单位 %，=昨日收益合计/前一净值基准市值）、holding_count（已持仓基金数量）、estimate_stale_count（盘中估值已过期、未计入今日收益的持仓数量，>0 时 dayChangeRate/totalProfit 覆盖不全）。
2) holdings[]（按已持仓排前、市值降序）：code/name/sector；held（true=已持仓，false=观察中未持仓）；amount（持仓市值，单位元，按 T-1 已确认净值计算）；profitRate（持有收益率，数值单位 %，如 -27.02 表示 -27.02%；基于持仓成本价与 T-1 净值）；todayChange（该基金当日估算涨跌幅，数值单位 %，来自盘中估算净值）；yesterdayChange（该基金昨日涨跌幅，数值单位 %，最新确认净值相对前一交易日，null=新基金无前一净值）；yesterdayProfit（该基金昨日收益额，单位元，null=未持仓或无前一净值）；estimate_updated_at（该基金盘中估算净值的更新时间 ISO8601，null=今日无有效估值）；shares（持有份额，单位份，未持仓为 null）、costPrice（持仓成本价，单位元/份，未持仓为 null）；recommendation（基于 RSI(14) 策略信号的粗略文案："RSI买入信号"/"RSI卖出信号"/"持有"，仅供参考，精确信号请调 get_fund_details 看 strategy_signals）；operationStrategy（基金级全局操作策略文本，null=未设置，可通过 manage_fund_strategy 修改）；recentTransactions（最近确认交易，最多 7 条：type=buy/sell、date、amount 单位元、shares 单位份、nav 单位元/份）。

【已知限制】amount/profitRate 基于 T-1 已确认净值（非实时）；todayChange 依赖盘中估算净值，QDII 与非交易时段可能过期（看 estimate_updated_at 与 estimate_stale_count）；昨日收益按"当前份额"回看计算，未剔除期间申赎的资金流影响；观察中的基金（held=false）amount/profitRate/shares/costPrice 均为 null。

【典型误用警示】amount=null 或 profitRate=null 表示"观察中、未持仓"，不是数据缺失或接口故障；不要把 profitRate=-27.02 读成"亏了 27.02 元"（是 -27.02%）；不要把 totalProfit 当累计收益（它是"今日"收益额，昨日收益请看 yesterdayProfit）。`,
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

      // 简化持仓数据，保留近期交易记录用于判断惩罚费率和做T条件
      const simplifiedHoldings = holdings.map(h => ({
        code: h.code,
        name: h.name,
        sector: h.sector || '未分类',
        // holdingAmount 为 null 即"观察中、未持仓"，与 null 值字段含义保持一致
        held: h.holdingAmount !== null,
        amount: h.holdingAmount, // 单位: 元, 基于T-1确认净值; null=未持仓
        profitRate: h.holdingProfitRate, // 单位: %; null=未持仓
        todayChange: h.percentageChange, // 单位: %, 基金当日估算涨跌幅
        yesterdayChange: h.yesterdayChangeRate, // 单位: %, 最新确认净值相对前一交易日涨幅; null=新基金无前一净值
        yesterdayProfit: h.yesterdayProfit, // 单位: 元, 昨日收益(当前份额×净值涨幅); null=未持仓或无前一净值
        estimate_updated_at: h.todayEstimateUpdateTime, // 盘中估值时间, null=今日无有效估值
        shares: h.shares, // 单位: 份; null=未持仓
        costPrice: h.costPrice, // 单位: 元/份; null=未持仓
        recommendation: h.signals?.rsi === '买入' ? 'RSI买入信号' : (h.signals?.rsi === '卖出' ? 'RSI卖出信号' : '持有'),
        // 全局操作策略 (可能为 null),作为分析该基金时的重要参考;可通过 manage_fund_strategy 修改
        operationStrategy: h.operationStrategy || null,
        recentTransactions: h.recentTransactions,
      }))

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            meta: buildMcpMeta({
              asOf: localDateStr(),
              asOfNote: 'meta.as_of 为数据生成日；持仓市值基于 T-1 已确认净值，当日涨跌基于盘中估算净值（新鲜度见 estimate_stale_count 与各持仓 estimate_updated_at）',
              staleness: {
                holdings_amount: 'T-1 (按上一交易日确认净值计算)',
                today_change: '盘中估算 (部分基金可能过期)',
                yesterday_profit: '已确认净值 (最新两条 navHistory,按当前份额回看)',
                cash: 'realtime',
              },
            }),
            data: {
              summary: {
                totalAssets: summary.totalAssets, // 单位: 元
                availableCash: summary.cash, // 单位: 元
                totalProfit: summary.totalProfitLoss, // 单位: 元, 今日有效收益额
                dayChangeRate: summary.totalPercentageChange, // 单位: %, 今日收益率
                yesterdayProfit: summary.yesterdayProfit, // 单位: 元, 昨日收益合计(已确认净值口径)
                yesterdayProfitRate: summary.yesterdayProfitRate, // 单位: %, 昨日收益率
                holding_count: summary.count, // 已持仓基金数
                estimate_stale_count: summary.staleCount, // 估值过期未计入今日收益的持仓数
              },
              holdings: simplifiedHoldings,
            },
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
