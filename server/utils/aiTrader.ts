// server/utils/aiTrader.ts
import type { AiModel } from '~~/shared/ai-models'
import OpenAI from 'openai'
import { z } from 'zod'
import { getCachedMarketData } from '~~/server/utils/market'
import { marketGroups } from '~~/shared/market'

// --- 1. 定义输出结构 Schema ---
const TradeDecisionSchema = z.object({
  fundCode: z.string(),
  fundName: z.string().optional(),
  action: z.enum(['buy', 'sell', 'convert_out', 'convert_in']),
  amount: z.number().optional().describe('买入金额，仅 action=buy 时有效'),
  shares: z.number().optional().describe('卖出/转出份额，仅 action=sell/convert_out 时有效'),
  relatedIndex: z.number().int().min(0).nullable().optional().describe('基金转换配对索引：convert_in 必须通过此字段指向同数组中对应的 convert_out 索引；convert_out 应将此字段置为 null'),
  reason: z.string().describe('详细的决策逻辑分析'),
})

const AiResponseSchema = z.object({
  decisions: z.array(TradeDecisionSchema),
})

export type TradeDecision = z.infer<typeof TradeDecisionSchema>

// --- 2. 辅助函数：构建上下文数据 ---
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

// 返回类型增加日志信息
interface AiTradeResult {
  decisions: TradeDecision[]
  fullPrompt: string
  rawResponse: string
}

/**
 * 仅生成 Prompt 内容，不执行 AI 调用
 * 用于前端"复制 Prompt"功能
 */
export async function generateAiPrompt(fullHoldingsData: any[], userConfig: UserAiConfig) {
  if (!userConfig.aiSystemPrompt || !userConfig.aiSystemPrompt.trim()) {
    throw new Error('用户未配置 AI 策略提示词 (System Prompt)。')
  }

  const contextData = await buildAiContext(fullHoldingsData)

  const availableCash = userConfig.availableCash
  const currentInvested = fullHoldingsData.reduce((sum, h) => sum + (Number(h.holdingAmount) || 0), 0)
  const totalAssets = availableCash + currentInvested
  // 计算真实预算：可用现金减去10000，如果不满足10000则预算为0
  const availableCashStr = (availableCash - 10000).toFixed(2)

  const currentTimestamp = new Date().toLocaleString()

  const fixedContext = `
#### 1. Context Information
- **当前时间**: ${currentTimestamp}
- **资金概况**:
  - 总资产: ${totalAssets.toFixed(4)} 元
  - 当前持仓市值: ${currentInvested.toFixed(4)} 元
  - **可用现金**: **${availableCashStr} 元** (CNY) —— 这是你本次决策的**硬性预算上限**。
- **输入数据**:
  1. market_indices: 实时市场指数。
  2. holdings: 当前持仓 (包含量化决策bias20)。
  3. watchlist: 关注列表 (同样包含量化决策)。
`

  const fixedOutputRules = `
#### 4. Output Format & Strict Constraints

**必须严格返回如下 JSON 格式，不要包含 Markdown 标记。**

**核心结算规则（强制遵守）：**

1. **资金风控（最高优先级 - 绝对红线）：**
   - **禁止超支**：你输出的所有 \`buy\` 决策中， \`amount\` 之和 **严禁超过 ${availableCashStr} 元**。
   - **自我校验**：在输出 JSON 前,请务必在内心计算：Sum(buy.amount) <= ${availableCashStr}。如果超过,必须**削减**每个买入项的金额,或**删除**部分买入建议。
   - **若余额不足**：如果剩余资金少于 100 元，请不要执行任何买入操作，必须至少留有 100 元的现金。

2. **交易动作规范 (Action Rules)：**
请从以下动作中选择。**注意：sell 与 convert 的区别**——\`sell\` 是变现回现金，\`convert\` 是不经过现金环节、直接把持仓换成另一只基金。

  1.  **buy (现金买入)**:
      - 信号: 强烈的上涨趋势或超跌反弹。
      - 限制: 必须有足够的 availableCash；消耗现金预算。

  2.  **sell (变现卖出)**:
      - 限制: 必须持有该标的 (Holdings > 0)；变现回现金。
      - **🔴 [CRITICAL] 7天惩罚性费率**:
        - 请务必检查 input 中的 \`recentTransactions\` 日期。
        - 规则: 若最近一次买入(\`buy\`/\`convert_in\`)发生在 **7天以内**,卖出将强制扣除 **1.5%** 的惩罚性手续费。
        - **决策逻辑**: 除非预判未来短期跌幅 **> 2.0%** (即持有亏损将超过手续费),否则对于不足7天的持仓 **严禁卖出**。建议输出 \`hold\` 等待期满。

  3.  **基金转换 (convert_out + convert_in) —— 🔴 CRITICAL: 必须成对出现**:
      - **核心铁律**：\`convert_out\` 与 \`convert_in\` 描述的是同一次"换基"操作的两端,**严禁单独出现**。
        ✅ 允许：1 个 \`convert_out\` + 1 个 \`convert_in\`(或多对，每对都成对)。
        ❌ **禁止**：只有 \`convert_out\` 没有 \`convert_in\`。
        ❌ **禁止**：只有 \`convert_in\` 没有 \`convert_out\`(若想用现金开新仓,请用 \`buy\`)。
      - **顺序要求**：\`convert_out\` 必须排列在它对应的 \`convert_in\` **之前**(数组索引更小)。
      - **convert_out (转出端)**: 给出源基金 \`fundCode\` 与 \`shares\`; \`relatedIndex\` 留空(null)或省略。
      - **convert_in (转入端)**: 给出目标基金 \`fundCode\`;**必须**填 \`relatedIndex\` 指向同数组中对应的 \`convert_out\` 索引(从 0 开始计数)。
      - **场景**: 调仓换基——看空源基金、同时看好目标基金。**若只是想清仓落袋,请使用 \`sell\` 而非 \`convert_out\`**。
      - ⚠️ **费率**：转出端同样受 **7天 1.5% 费率** 限制。请优先选择持仓时间 >7 天的标的作为转出源。

3. **数据精度要求 (Precision Constraint)：**
   - **amount (金额)** 和 **shares (份额)** 字段必须 **严格保留 4 位小数**。
   - 即使是整数,也必须输出为 \`100.0000\` 的形式。

4. **输出前最终自检 (Final Self-Check before emit) —— 必须逐条核对：**
   - [ ] 所有 \`buy\` 的 amount 之和 ≤ ${availableCashStr} 元。
   - [ ] **\`convert_out\` 的数量 == \`convert_in\` 的数量**(逐对匹配)。
   - [ ] 每个 \`convert_in\` 都设置了 \`relatedIndex\`,且指向的位置 **确实是** 一个 \`convert_out\` 且其在数组中 **更靠前**。
   - [ ] 没有任何孤立的 \`convert_out\` 或 \`convert_in\`。
   - 若上述任一检查不通过,**必须就地修正**后再输出,切勿输出残缺的转换对。

#### 4. Output Format (JSON Only)

请严格输出如下 JSON 格式 (必须包含在 "decisions" 字段中):

{
  "decisions": [
    {
      "fundCode": "001111",
      "action": "convert_out",
      "shares": 100.0000,
      "relatedIndex": null,
      "reason": "调仓:源基金动能衰减,转出 100 份至 002222"
    },
    {
      "fundCode": "002222",
      "action": "convert_in",
      "relatedIndex": 0,
      "reason": "调仓:承接 001111 的转出资金,买入 002222"
    },
    {
      "fundCode": "00111",
      "action": "buy",
      "amount": 5000.0000,
      "shares": 0.0000,
      "reason": "RSI超卖,回踩支撑位"
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

/**
 * 基金转换配对兜底：确保每个 convert_out 都有对应的 convert_in，反之亦然。
 * - convert_out 必须出现在 convert_in 之前（relatedIndex 引用约束）。
 * - 孤立的 convert_in：直接剔除（现金开仓应使用 buy）。
 * - 孤立的 convert_out：直接剔除（避免下游因 relatedIndex 无效抛 400）。
 * - 缺失或无效的 relatedIndex：自动回填到最近一个尚未配对的 convert_out。
 */
export function enforceConvertPairs(actions: TradeDecision[]): TradeDecision[] {
  const result: TradeDecision[] = []
  // 记录 result 中尚未被 convert_in 引用的 convert_out 索引
  const unmatchedOuts: number[] = []

  for (const action of actions) {
    if (action.action === 'convert_out') {
      result.push({ ...action, relatedIndex: null })
      unmatchedOuts.push(result.length - 1)
    }
    else if (action.action === 'convert_in') {
      // 优先采用 AI 给出的 relatedIndex，否则回填最近一个未配对的 convert_out
      let targetIdx = action.relatedIndex ?? null
      if (targetIdx === null || targetIdx < 0 || targetIdx >= result.length
        || result[targetIdx]!.action !== 'convert_out') {
        targetIdx = unmatchedOuts.length > 0 ? unmatchedOuts.shift()! : null
      }
      else {
        // 从未配对列表中移除被引用的索引（保持其余项仍可回填）
        const pos = unmatchedOuts.indexOf(targetIdx)
        if (pos >= 0)
          unmatchedOuts.splice(pos, 1)
      }

      if (targetIdx === null) {
        console.warn(`[AI Trader] 剔除孤立的 convert_in: ${action.fundCode}（无对应 convert_out，应使用 buy）`)
        continue
      }
      result.push({ ...action, relatedIndex: targetIdx })
    }
    else {
      result.push(action)
    }
  }

  // 残留的未配对 convert_out：剔除（避免下游写入 400）
  if (unmatchedOuts.length > 0) {
    const dropSet = new Set(unmatchedOuts)
    console.warn(`[AI Trader] 剔除 ${unmatchedOuts.length} 个孤立 convert_out：缺少对应 convert_in`)
    return result.filter((_, idx) => !dropSet.has(idx))
  }

  return result
}

export async function getAiTradeDecisions(fullHoldingsData: any[], userConfig: UserAiConfig): Promise<AiTradeResult> {
  const config = useRuntimeConfig()

  if (!config.openRouterApiKey) {
    throw new Error('系统未配置 OpenRouter API Key')
  }

  // 调用抽离的逻辑生成 Prompt
  const { systemPrompt, userPrompt, fullPromptLog } = await generateAiPrompt(fullHoldingsData, userConfig)

  // 5. 确定使用的模型
  const targetModel = userConfig.model || 'glm-5.2'

  try {
    const openai = new OpenAI({
      baseURL: config.openRouterBaseUrl,
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
            action.reason += ` [系统风控: 剩余预算不足,修正金额至 ${action.amount}]`
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
      else if (action.action === 'convert_out' || action.action === 'convert_in') {
        if (action.shares) {
          action.shares = Math.floor(action.shares * 10000) / 10000
        }
        validActions.push(action)
      }
    }

    // [配对兜底] 基金转换必须 convert_out + convert_in 成对出现且 out 在 in 之前，
    // 否则下游写入会因 relatedIndex 失效而抛 400。这里剔除孤立项并补全 relatedIndex。
    const finalActions = enforceConvertPairs(validActions)

    // 返回详细结果对象
    return {
      decisions: finalActions,
      fullPrompt: fullPromptLog,
      rawResponse: rawContent,
    }
  }
  catch (error: any) {
    console.error(`AI 决策分析失败 (User Configured Strategy):`, error.message)
    throw error
  }
}
