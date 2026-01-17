// server/utils/aiTrader.ts
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { z } from 'zod'
import { dailyNews } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { getCachedMarketData } from '~~/server/utils/market'
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
async function buildAiContext(fullHoldingsData: any[]) {
  const db = useDb()

  // A. 获取今日新闻 (舆情)
  const todayStr = dayjs().format('YYYY-MM-DD')
  const newsRecord = await db.query.dailyNews.findFirst({
    where: eq(dailyNews.date, todayStr),
  })

  // B. 获取实时市场指数 (宏观) - 使用 Redis 缓存
  const marketData: Record<string, any[]> = {}
  try {
    const indicesMap = await getCachedMarketData()
    // 按板块分组
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
  // 辅助函数：保留4位小数并向下取整
  const floorShares = (num: number) => Math.floor(num * 10000) / 10000

  const simplify = (h: any) => {
    // 计算可用份额 (总份额 - 待确认的卖出/转出份额)
    let availableShares = 0
    if (h.shares !== null) {
      const pendingFrozen = h.pendingTransactions
        ?.filter((t: any) => t.type === 'sell' || t.type === 'convert_out')
        .reduce((sum: number, t: any) => sum + (Number(t.orderShares) || 0), 0) || 0

      const rawAvailable = Math.max(0, Number(h.shares) - pendingFrozen)
      // [关键] 在这里直接向下取整，确保传给 AI 的就是安全值
      availableShares = floorShares(rawAvailable)
    }

    return {
      code: h.code,
      name: h.name,
      sector: h.sector || '未分类',
      // 持仓特有字段
      ...(h.holdingAmount !== null
        ? {
            costPrice: h.costPrice,
            holdingAmount: h.holdingAmount,
            profitRate: h.holdingProfitRate ? `${h.holdingProfitRate.toFixed(2)}%` : '0%',
            totalShares: h.shares, // 总份额
            availableShares, // 传递可用份额给 AI，用于清仓决策
          }
        : {}),
      percentageChange: h.percentageChange ? `${h.percentageChange.toFixed(2)}%` : '0%',
      signals: h.signals, // 包含 RSI, MACD 等信号
      bias20: h.bias20,
      // 交易回溯
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
    market_news: newsRecord?.content || '今日暂无重大新闻',
    market_indices: marketData,
    holdings: myHoldings,
    watchlist: myWatchlist,
  }
}

// --- 3. 核心调用函数 ---
interface UserAiConfig {
  aiTotalAmount?: string | null
  aiSystemPrompt?: string | null
}

// [修改] 返回类型增加日志信息
interface AiTradeResult {
  decisions: TradeDecision[]
  fullPrompt: string
  rawResponse: string
}

export async function getAiTradeDecisions(fullHoldingsData: any[], userConfig: UserAiConfig): Promise<AiTradeResult> {
  const config = useRuntimeConfig()

  if (!config.openRouterApiKey) {
    throw new Error('系统未配置 OpenRouter API Key')
  }

  // 1. 强制校验：用户必须配置 System Prompt
  if (!userConfig.aiSystemPrompt || !userConfig.aiSystemPrompt.trim()) {
    throw new Error('用户未配置 AI 策略提示词 (System Prompt)，无法执行自动分析。')
  }

  // 2. 准备上下文数据 (JSON)
  const contextData = await buildAiContext(fullHoldingsData)

  // 3. 计算剩余可用资金 (资金风控核心)
  const totalBudget = Number(userConfig.aiTotalAmount) || 0
  const currentInvested = fullHoldingsData.reduce((sum, h) => sum + (Number(h.holdingAmount) || 0), 0)
  const availableCash = Math.max(0, totalBudget - currentInvested)
  const availableCashStr = availableCash.toFixed(2)

  // 4. 构建 System Prompt
  const currentTimestamp = new Date().toLocaleString()

  const fixedContext = `
#### 1. Context Information
- **当前时间**: ${currentTimestamp}
- **资金概况**:
  - 总资金设定: ${totalBudget} 元
  - 当前持仓市值: ${currentInvested.toFixed(4)} 元
  - **剩余可用买入资金**: **${availableCashStr} 元** (CNY) —— 这是你本次决策的**硬性预算上限**。
- **输入数据**: 包含市场指数(market_indices)、新闻(market_news)、持仓(holdings)和自选(watchlist)的 JSON 数据。
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

#### 4. Output Format (JSON Only)

请严格输出如下 JSON 格式 (必须包含在 "decisions" 字段中):

{
  "decisions": [
    {
      "fundCode": "001111",
      "action": "convert_out",
      "shares": 100,
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
      "amount": 5000,
      "shares": 0,
      "reason": "RSI超卖，回踩支撑位",
    },
  ]
}
`

  // 组合最终的 System Prompt
  const finalSystemPrompt = `${fixedContext}\n\n#### 2. Strategy Logic (User Defined)\n${userConfig.aiSystemPrompt}\n\n${fixedOutputRules}`

  // 5. 确定使用的模型
  // 使用系统默认模型，忽略用户配置
  const targetModel = (config.aiModel as string) || 'xiaomi/mimo-v2-flash:free'
  const userPrompt = `Input Data JSON:\n${JSON.stringify(contextData)}`

  // 组合完整的 Prompt 字符串用于记录
  const fullPromptLog = `--- SYSTEM PROMPT ---\n${finalSystemPrompt}\n\n--- USER PROMPT ---\n${userPrompt}`

  try {
    const openai = new OpenAI({
      baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      apiKey: config.openRouterApiKey,
    })

    const completion = await openai.chat.completions.create({
      model: targetModel, // 使用系统统一配置的模型
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // 降低随机性
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
    const budgetLimit = availableCash
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
