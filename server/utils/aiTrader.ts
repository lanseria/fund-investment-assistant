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
  action: z.enum(['buy', 'sell', 'hold']),
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
  // [新增] 辅助函数：保留4位小数并向下取整
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
  aiModel?: string | null
  aiTotalAmount?: string | null
  aiSystemPrompt?: string | null
}

export async function getAiTradeDecisions(fullHoldingsData: any[], userConfig: UserAiConfig): Promise<TradeDecision[]> {
  const config = useRuntimeConfig()

  if (!config.openRouterApiKey) {
    throw new Error('系统未配置 OpenRouter API Key')
  }

  // 1. 强制校验：用户必须配置 System Prompt，不再提供默认值
  if (!userConfig.aiSystemPrompt || !userConfig.aiSystemPrompt.trim()) {
    throw new Error('用户未配置 AI 策略提示词 (System Prompt)，无法执行自动分析。')
  }

  // 2. 准备上下文数据 (JSON)
  const contextData = await buildAiContext(fullHoldingsData)

  // 3. 计算剩余可用资金 (资金风控核心)
  // 逻辑：总预算 - 当前所有持仓的市值 = 剩余可用现金
  // 注意：这里使用 holdingAmount (市值) 还是 costPrice * shares (成本) 取决于你的定义。
  // 通常“资产配置”看市值，“投入本金”看成本。为了防止回撤导致误判有钱，这里建议使用“已占用本金”或“当前市值”。
  // 这里采用保守策略：减去当前市值。如果亏损了，市值变小，剩余资金会变多（允许补仓）；如果盈利了，市值变大，剩余资金变少（防止过度加仓）。
  // *更稳健的做法是：减去已投入成本*，但 holdings 数据里 holdingAmount 更现成。我们暂用 holdingAmount 求和。

  const totalBudget = Number(userConfig.aiTotalAmount) || 0
  const currentInvested = fullHoldingsData.reduce((sum, h) => sum + (Number(h.holdingAmount) || 0), 0)

  // 剩余可用买入资金 (不能小于 0)
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

2. **交易动作规范：**
   - **买入(buy)**：必须填写 \`amount\`（单位：元），\`shares\` 设为 0。
   - **卖出(sell)**：必须填写 \`shares\`（单位：份）。
     - **若为清仓/全额卖出**：必须从 holdings 数据中提取该标的的 \`availableShares\`。**重要：**份额必须**保留4位小数并向下取整(Math.floor)**，严禁四舍五入导致超出持仓上限。此时 \`amount\` 设为 0。
   - **保持(hold)**：\`amount\` 和 \`shares\` 均设为 0。

必须严格返回如下 JSON 格式，不要包含 Markdown 标记：
{
  "decisions": [
    { 
      "fundCode": "000001", 
      "fundName": "某某基金",
      "action": "buy" | "sell" | "hold", 
      "amount": 1000, // 仅 buy 时需要，严格受限
      "shares": 100,  // 仅 sell 时需要
      "reason": "策略分析：..." 
    }
  ]
}`

  // 组合最终的 Prompt
  const finalSystemPrompt = `${fixedContext}\n\n#### 2. Strategy Logic (User Defined)\n${userConfig.aiSystemPrompt}\n\n${fixedOutputRules}`

  // 5. 确定使用的模型
  const targetModel = userConfig.aiModel || config.aiModel || 'xiaomi/mimo-v2-flash:free'
  const userPrompt = `Input Data JSON:\n${JSON.stringify(contextData)}`

  try {
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.openRouterApiKey,
    })

    const completion = await openai.chat.completions.create({
      model: targetModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // 降低随机性，严格遵循格式
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
    const actions = validated.decisions.filter(d => d.action !== 'hold')

    // [最后一道防线] 代码层面的资金硬性校验
    // 这里不再使用 maxBudget (总额)，而是使用 availableCash (剩余额度) 进行校验
    const budgetLimit = availableCash
    let currentTotalBuy = 0

    // 过滤后的有效交易列表
    const validActions: TradeDecision[] = []

    for (const action of actions) {
      if (action.action === 'buy') {
        const amount = action.amount || 0
        // 如果加上这一笔会超支
        if (currentTotalBuy + amount > budgetLimit) {
          console.warn(`[AI Trader] 触发资金风控拦截！`)
          console.warn(`  -> 计划买入 ${action.fundCode} 金额 ${amount}`)
          console.warn(`  -> 当前累计 ${currentTotalBuy} + ${amount} > 剩余预算 ${budgetLimit}`)

          // 策略: 尝试缩减金额到剩余预算
          const remaining = budgetLimit - currentTotalBuy
          if (remaining > 10) { // 如果剩余资金还够买点碎股 (>10元)
            action.amount = Math.floor(remaining) // 向下取整
            action.reason += ` [系统风控: 剩余预算不足，已修正金额至 ${action.amount}]`
            currentTotalBuy += action.amount
            validActions.push(action)
          }
          else {
            console.warn(`  -> 剩余预算不足 (<10元)，跳过此笔买入。`)
          }
        }
        else {
          currentTotalBuy += amount
          validActions.push(action)
        }
      }
      else if (action.action === 'sell') {
        // 卖出风控：强制保留4位小数并向下取整，防止浮点数溢出
        if (action.shares) {
          action.shares = Math.floor(action.shares * 10000) / 10000
        }
        // 卖出操作不受资金限制，直接放行
        validActions.push(action)
      }
    }

    return validActions
  }
  catch (error: any) {
    console.error(`AI 决策分析失败 (User Configured Strategy):`, error.message)
    throw error
  }
}
