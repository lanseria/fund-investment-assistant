import type { UserAiConfig } from './schemas'
import { buildAiContext } from './context'

/**
 * AI 买入预算的保底现金:买入总额上限 = max(0, 可用现金 - 保底)。
 * Prompt 文案与代码层资金风控必须使用同一常量,否则会出现口径不一致。
 */
export const AI_CASH_RESERVE = 10000

/** 剩余预算不超过该值时直接丢弃 buy(避免产生零碎订单),与 prompt 约束保持一致 */
export const AI_MIN_BUY_BUDGET = 10

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
  // 计算真实预算:预留保底现金(AI_CASH_RESERVE),可用现金不足保底时预算为 0。
  // 代码层资金风控(getAiTradeDecisions)使用同一常量计算上限,保证口径一致。
  const budget = Math.max(0, availableCash - AI_CASH_RESERVE)
  const availableCashStr = budget.toFixed(2)

  const currentTimestamp = new Date().toLocaleString()

  const fixedContext = `
#### 1. Context Information
- **当前时间**: ${currentTimestamp}
- **资金概况**:
  - 总资产: ${totalAssets.toFixed(4)} 元
  - 当前持仓市值: ${currentInvested.toFixed(4)} 元
  - **可动用买入预算**: **${availableCashStr} 元** (CNY,= 可用现金 - ${AI_CASH_RESERVE} 元保底备用金,备用金不可动用) —— 这是你本次决策的**硬性预算上限**。
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
   - **禁止超支**：你输出的所有 \`buy\` 决策中， \`amount\` 之和 **严禁超过 ${availableCashStr} 元**(该预算已强制预留保底备用金,即使为 0 也不代表可用现金为 0)。
   - **自我校验**：在输出 JSON 前,请务必在内心计算：Sum(buy.amount) <= ${availableCashStr}。如果超过,必须**削减**每个买入项的金额,或**删除**部分买入建议。
   - **若预算不足**：如果可动用买入预算 ≤ ${AI_MIN_BUY_BUDGET} 元(无法支撑一笔有效买入),请**不要输出任何 buy 决策**。

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
