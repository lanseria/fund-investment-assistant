// server/utils/aiTrader.ts
import dayjs from 'dayjs'
import { desc, gte } from 'drizzle-orm'
import OpenAI from 'openai'
import { z } from 'zod'
import { aiDailyAnalysis, newsItems } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { getCachedMarketData } from '~~/server/utils/market'
import type { AiModel } from '~~/shared/ai-models'
import { marketGroups } from '~~/shared/market'

// --- 1. 定义输出结构 Schema ---
const TradeDecisionSchema = z.object({
  fundCode: z.string(),
  fundName: z.string().optional(),
  action: z.enum(['buy', 'sell', 'convert_out', 'convert_in']),
  amount: z.number().optional().describe('买入金额，仅 action=buy 时有效'),
  shares: z.number().optional().describe('卖出份额，仅 action=sell 时有效'),
  reason: z.string().describe('详细的决策逻辑分析'),
})

const AiResponseSchema = z.object({
  decisions: z.array(TradeDecisionSchema),
})

export type TradeDecision = z.infer<typeof TradeDecisionSchema>

// --- 2. 辅助函数：构建上下文数据 ---
export async function buildAiContext(fullHoldingsData: any[]) {
  const db = useDb()

  // [新增] 获取最新的 AI 热点分析 (TrendRadar)
  // 获取日期最近的一条记录作为宏观参考
  const latestAnalysisRecord = await db.query.aiDailyAnalysis.findFirst({
    orderBy: [desc(aiDailyAnalysis.date)],
  })

  // A. 获取近一个月的新闻事件 (舆情时间线)
  const oneMonthAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD')

  const recentNewsItems = await db.query.newsItems.findMany({
    where: gte(newsItems.date, oneMonthAgo),
    orderBy: [desc(newsItems.date), desc(newsItems.id)],
    limit: 60,
    columns: {
      date: true,
      title: true,
      content: true,
      tag: true,
    },
  })

  const formattedNewsTimeline = recentNewsItems.map(item => ({
    date: item.date,
    tag: item.tag || 'General',
    title: item.title,
    summary: item.content,
  }))

  // B. 获取实时市场指数 (宏观)
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

  // C. 格式化持仓与关注列表
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
      sector: h.sector || '未分类',
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
    daily_analysis: latestAnalysisRecord
      ? {
          date: latestAnalysisRecord.date,
          content: latestAnalysisRecord.content,
        }
      : null,
    market_events: formattedNewsTimeline,
    market_indices: marketData,
    holdings: myHoldings,
    watchlist: myWatchlist,
  }
}

// --- 3. 核心调用函数 ---
interface UserAiConfig {
  availableCash: number
  aiSystemPrompt?: string | null
  model?: AiModel
}

// [修改] 返回类型增加日志信息
interface AiTradeResult {
  decisions: TradeDecision[]
  fullPrompt: string
  rawResponse: string
}

/**
 * [新增] 仅生成 Prompt 内容，不执行 AI 调用
 * 用于前端“复制 Prompt”功能
 */
export async function generateAiPrompt(fullHoldingsData: any[], userConfig: UserAiConfig) {
  if (!userConfig.aiSystemPrompt || !userConfig.aiSystemPrompt.trim()) {
    throw new Error('用户未配置 AI 策略提示词 (System Prompt)。')
  }

  const contextData = await buildAiContext(fullHoldingsData)

  const availableCash = userConfig.availableCash
  const currentInvested = fullHoldingsData.reduce((sum, h) => sum + (Number(h.holdingAmount) || 0), 0)
  const totalAssets = availableCash + currentInvested
  const availableCashStr = availableCash.toFixed(2)

  const currentTimestamp = new Date().toLocaleString()

  const fixedContext = `
#### 1. Context Information
- **当前时间**: ${currentTimestamp}
- **资金概况**:
  - 总资产: ${totalAssets.toFixed(4)} 元
  - 当前持仓市值: ${currentInvested.toFixed(4)} 元
  - **可用现金**: **${availableCashStr} 元** (CNY) —— 这是你本次决策的**硬性预算上限**。
- **输入数据**: 
  1. **daily_analysis (重点)**: 每日宏观热点深度分析，包含核心主线和微观领域动态。请以此定调今日整体策略（进攻/防御）。
  2. market_indices: 实时市场指数。
  3. market_events: 近30天新闻事件时间线。
  4. holdings: 当前持仓。
  5. watchlist: 关注列表。
`

  const fixedOutputRules = `
#### 4. Output Format & Strict Constraints

**必须严格返回如下 JSON 格式，不要包含 Markdown 标记。**

**核心结算规则（强制遵守）：**

1. **资金风控（最高优先级 - 绝对红线）：**
   - **禁止超支**：你输出的所有 \`buy\` 决策中，\`amount\` 之和 **严禁超过 ${availableCashStr} 元**。
   - **自我校验**：在输出 JSON 前，请务必在内心计算：Sum(buy.amount) <= ${availableCashStr}。如果超过，必须**削减**每个买入项的金额，或**删除**部分买入建议。
   - **若余额不足**：如果剩余资金少于 100 元，请不要执行任何买入操作。

2. **交易动作规范 (Action Rules)：**
你现在拥有更广泛的资金权限，请选择以下动作之一：

  1.  **buy (买入)**: 
      - 信号: 强烈的上涨趋势或超跌反弹。
      - 限制: 必须有足够的 availableCash。

  2.  **sell (卖出)**: 
      - 限制: 必须持有该标的 (Holdings > 0)。
      - **🔴 [CRITICAL] 7天惩罚性费率**: 
        - 请务必检查 input 中的 \`recentTransactions\` 日期。
        - 规则: 若最近一次买入(\`buy\`/\`convert_in\`)发生在 **7天以内**，卖出将强制扣除 **1.5%** 的惩罚性手续费。
        - **决策逻辑**: 除非预判未来短期跌幅 **> 2.0%** (即持有亏损将超过手续费)，否则对于不足7天的持仓 **严禁卖出**。建议输出 \`hold\` 等待期满。

  3.  **convert_in (转入/入金)**: 
      - 场景: 绝佳机会但 cash 不足 / 宏观牛市追加本金。

  4.  **convert_out (转出/出金)**: 
      - 场景: 止盈落袋 / 熊市避险。
      - ⚠️ **注意**: 此操作本质是卖出，同样受 **7天 1.5% 费率** 限制。请优先选择持仓时间 >7 天的标的进行转出。

3. **数据精度要求 (Precision Constraint)：**
   - **amount (金额)** 和 **shares (份额)** 字段必须 **严格保留 4 位小数**。
   - 即使是整数，也必须输出为 \`100.0000\` 的形式。

#### 4. Output Format (JSON Only)

请严格输出如下 JSON 格式 (必须包含在 "decisions" 字段中):

{
  "decisions": [
    {
      "fundCode": "001111",
      "action": "convert_out",
      "shares": 100.0000,
      "reason": "卖出源基金"
    },
    {
      "fundCode": "002222",
      "action": "convert_in",
      "relatedIndex": 0,  // 指向上面第 0 个操作
      "reason": "买入目标基金"
    },
    {
      "fundCode": "00111",
      "action": "buy",
      "amount": 5000.0000,
      "shares": 0.0000,
      "reason": "RSI超卖，回踩支撑位"
    }
  ]
}
`

  const finalSystemPrompt = `${fixedContext}\n\n#### 2. Strategy Logic (User Defined)\n${userConfig.aiSystemPrompt}\n\n${fixedOutputRules}`
  const userPrompt = `Input Data JSON:\n${JSON.stringify(contextData)}`

  return {
    systemPrompt: finalSystemPrompt,
    userPrompt,
    fullPromptLog: `--- SYSTEM PROMPT ---\n${finalSystemPrompt}\n\n--- USER PROMPT ---\n${userPrompt}`,
  }
}

export async function getAiTradeDecisions(fullHoldingsData: any[], userConfig: UserAiConfig): Promise<AiTradeResult> {
  const config = useRuntimeConfig()

  if (!config.openRouterApiKey) {
    throw new Error('系统未配置 OpenRouter API Key')
  }

  // [修改] 调用抽离的逻辑生成 Prompt
  const { systemPrompt, userPrompt, fullPromptLog } = await generateAiPrompt(fullHoldingsData, userConfig)

  // 5. 确定使用的模型
  const targetModel = userConfig.model || 'kimi-k2-thinking'

  try {
    const openai = new OpenAI({
      baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      apiKey: config.openRouterApiKey,
    })

    const completion = await openai.chat.completions.create({
      model: targetModel, // 使用系统统一配置的模型
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // 降低随机性
    })

    const rawContent = completion.choices[0]?.message?.content || '{}'

    // 清洗 Markdown 代码块标记
    const jsonString = rawContent
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    const parsed = JSON.parse(jsonString)
    const validated = AiResponseSchema.parse(parsed)

    // 过滤掉 hold 操作
    const actions = validated.decisions

    // [最后一道防线] 代码层面的资金硬性校验
    const budgetLimit = userConfig.availableCash
    let currentTotalBuy = 0

    // 过滤后的有效交易列表
    const validActions: TradeDecision[] = []

    for (const action of actions) {
      if (action.action === 'buy') {
        const amount = action.amount || 0
        if (currentTotalBuy + amount > budgetLimit) {
          console.warn(`[AI Trader] 触发资金风控拦截！`)
          const remaining = budgetLimit - currentTotalBuy
          if (remaining > 10) {
            action.amount = Math.floor(remaining)
            action.reason += ` [系统风控: 剩余预算不足，修正金额至 ${action.amount}]`
            currentTotalBuy += action.amount
            validActions.push(action)
          }
        }
        else {
          currentTotalBuy += amount
          validActions.push(action)
        }
      }
      else if (action.action === 'sell') {
        if (action.shares) {
          action.shares = Math.floor(action.shares * 10000) / 10000
        }
        validActions.push(action)
      }
      else {
        // transfer 等其他操作直接放行
        validActions.push(action)
      }
    }

    // [修改] 返回详细结果对象
    return {
      decisions: validActions,
      fullPrompt: fullPromptLog,
      rawResponse: rawContent,
    }
  }
  catch (error: any) {
    console.error(`AI 决策分析失败 (User Configured Strategy):`, error.message)
    throw error
  }
}
