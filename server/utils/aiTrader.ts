// server/utils/aiTrader.ts
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { z } from 'zod'
import { dailyNews } from '~~/server/database/schemas'
import { fetchMarketIndexes } from '~~/server/utils/dataFetcher'
import { useDb } from '~~/server/utils/db'
import { ALL_INDEX_CODES, marketGroups } from '~~/shared/market'

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
// 这一步是为了复刻前端的 simplifyHolding 和 clipboardData 结构
async function buildAiContext(fullHoldingsData: any[]) {
  const db = useDb()

  // A. 获取今日新闻 (舆情)
  const todayStr = dayjs().format('YYYY-MM-DD')
  const newsRecord = await db.query.dailyNews.findFirst({
    where: eq(dailyNews.date, todayStr),
  })

  // B. 获取实时市场指数 (宏观)
  const marketData: Record<string, any[]> = {}
  try {
    const indicesRaw = await fetchMarketIndexes(ALL_INDEX_CODES)
    // 按板块分组
    for (const [_, groupInfo] of Object.entries(marketGroups)) {
      const groupList = []
      for (const code of groupInfo.codes) {
        const idx = indicesRaw.find(i => i.code === code)
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
  // 后端 getUserHoldingsAndSummary 返回的数据结构已经包含 pendingTransactions 和 recentTransactions
  const simplify = (h: any) => ({
    code: h.code,
    name: h.name,
    sector: h.sector || '未分类',
    // 只有持仓才有的字段
    ...(h.holdingAmount !== null
      ? {
          costPrice: h.costPrice,
          holdingAmount: h.holdingAmount,
          profitRate: h.holdingProfitRate ? `${h.holdingProfitRate.toFixed(2)}%` : '0%',
        }
      : {}),
    percentageChange: h.percentageChange ? `${h.percentageChange.toFixed(2)}%` : '0%',
    signals: h.signals, // 包含 RSI, MACD 等信号
    bias20: h.bias20,
    // 关键：用于回溯逻辑的交易记录
    recentTransactions: h.recentTransactions?.slice(0, 3).map((t: any) => ({
      type: t.type,
      date: t.date,
      nav: t.nav, // 成交净值
      amount: t.amount,
      shares: t.shares,
    })) || [],
  })

  const myHoldings = fullHoldingsData.filter(h => h.holdingAmount !== null).map(simplify)
  const myWatchlist = fullHoldingsData.filter(h => h.holdingAmount === null).map(simplify)

  return {
    timestamp: new Date().toLocaleString(),
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
    throw new Error('未配置 OpenRouter API Key')
  }

  // 1. 准备上下文数据
  const contextData = await buildAiContext(fullHoldingsData)

  // 2. 确定 Prompt 模板
  // 如果用户有自定义 Prompt，则使用用户的；否则使用默认模板
  let promptTemplate = userConfig.aiSystemPrompt

  if (!promptTemplate || !promptTemplate.trim()) {
    promptTemplate = `#### 1. Role & Profile
你是一位拥有15年实战经验的**资深量化策略分析师**，擅长多因子模型、网格交易及交易行为分析。你的核心职责是充当用户的“交易执行官”。
**核心指令**：结合 **JSON数据**（实时行情、持仓、自选、舆情、**近期交易记录**），对列表中的**每一个**标的（包括 holdings 和 watchlist）给出明确的交易决策。

#### 2. Constraints & Context
- **当前时间**: {{timestamp}}
- **资金体量**: 总资金 {{total_amount}} 元。
- **决策优先级**: 
  1. 宏观风险 > 2. **交易回溯逻辑 (Recent Transaction Check)** > 3. 技术面量化信号 > 4. 舆情。

#### 3. Workflow & Logic Process (全流程扫描)

**Step 1: 宏观定调 (Market Sentiment)**
- 分析 input 中的 \`market_indices\` 和 \`market_news\`，设定当日基础仓位策略（进攻/防御/撤退）。

**Step 2: 持仓全量诊断 (Holdings Audit) - 核心逻辑增强**
- **前置检查：交易回溯 (Recent Transaction Analysis)**
  - 读取 \`recentTransactions\` 数组中最近一次操作 \`LastOp\`。
  - **场景 A：刚卖出 (\`LastOp.type == 'sell'\`)**
    - 若 \`percentageChange\` (今日涨跌) 显示大跌 (>2%): **接回判断** —— 视为“做T成功”，建议**buy**接回筹码（金额 = \`LastOp.amount\` 或 50%）。
    - 若 \`percentageChange\` 显示上涨: **踏空判断** —— 除非出现强力买入信号，否则**严禁追高**，建议**hold**。
  - **场景 B：刚买入 (\`LastOp.type == 'buy'\`)**
    - 若今日仅微跌: **过热保护** —— 拒绝频繁补仓，建议**hold**。
    - 若今日大涨 (>3%): **网格止盈** —— 建议**sell**获利部分。

- **常规量化逻辑 (若无近期敏感操作)**
  - **强力减仓**: \`profitRate\` > 15% 且 signals 中含 '卖出'。
  - **防御减仓**: \`profitRate\` > 5% 且 出现死叉信号。
  - **左侧定投**: \`profitRate\` < -5% 且 signals 中含 '买入' (RSI低位)。
  - **止损清仓**: 逻辑崩坏或亏损 > 20%。

**Step 3: 自选股全量扫描 (Watchlist Audit)**
- **建仓**: signals 中含 '买入' 且宏观配合 -> **buy**。
- **观望**: 价格过高或下跌中继 -> **hold**。

#### 4. Output Format (Strict JSON)
必须严格返回如下 JSON 格式，不要包含 Markdown 标记：
{
  "decisions": [
    { 
      "fundCode": "000001", 
      "fundName": "某某基金",
      "action": "buy" | "sell" | "hold", 
      "amount": 1000, // 仅 buy 时需要
      "shares": 100,  // 仅 sell 时需要
      "reason": "策略分析：最近一次于3天前卖出，今日跌幅2.5%，触发做T接回逻辑..." 
    }
  ]
}`
  }

  // 3. 动态替换 Prompt 变量
  const totalAmountStr = userConfig.aiTotalAmount ? `${userConfig.aiTotalAmount}` : '300000'
  const systemPrompt = promptTemplate
    .replace(/\{\{timestamp\}\}/g, contextData.timestamp)
    .replace(/\{\{total_amount\}\}/g, totalAmountStr)

  // 4. 确定使用的模型
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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // 降低随机性，严格遵循逻辑
    })

    const rawContent = completion.choices[0]?.message?.content || '{}'

    // 清洗 Markdown 代码块标记，防止模型输出 ```json
    const jsonString = rawContent
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    const parsed = JSON.parse(jsonString)
    const validated = AiResponseSchema.parse(parsed)

    // 过滤掉 hold 操作，只返回需要执行的交易
    return validated.decisions.filter(d => d.action !== 'hold')
  }
  catch (error) {
    console.error('AI 决策分析失败:', error)
    // 出错时不执行任何操作
    return []
  }
}
