import type { AiTradeResult, TradeDecision, UserAiConfig } from './schemas'
import OpenAI from 'openai'
import { withRetry } from '~~/server/utils/retry'
import { AI_CASH_RESERVE, AI_MIN_BUY_BUDGET, generateAiPrompt } from './prompt'
import { AiResponseSchema } from './schemas'
import { enforceConvertPairs } from './transactions'

export async function getAiTradeDecisions(fullHoldingsData: any[], userConfig: UserAiConfig): Promise<AiTradeResult> {
  const config = useRuntimeConfig()

  if (!config.openRouterApiKey) {
    throw new Error('系统未配置 OpenRouter API Key')
  }

  // 调用抽离的逻辑生成 Prompt
  const { systemPrompt, userPrompt, fullPromptLog } = await generateAiPrompt(fullHoldingsData, userConfig)

  // 5. 确定使用的模型
  const targetModel = userConfig.model || 'deepseek-v4-flash-0731'

  // SDK 内部 maxRetries=3(覆盖 429/5xx),外层 withRetry 再叠加指数退避
  // (覆盖网络抖动、偶发 JSON/Zod 错误等 SDK 不处理的场景)。
  // 整个"调用 + 清洗 + 解析"放在重试范围内,模型偶发输出异常也能重试。
  const openai = new OpenAI({
    baseURL: config.openRouterBaseUrl,
    apiKey: config.openRouterApiKey,
    maxRetries: 3,
  })

  const { rawContent, validated } = await withRetry(
    async () => {
      const completion = await openai.chat.completions.create({
        model: targetModel, // 使用系统统一配置的模型
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // 降低随机性
      })

      const content = completion.choices[0]?.message?.content || '{}'
      // 清洗 Markdown 代码块标记
      const jsonString = content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()

      const parsed = JSON.parse(jsonString)
      const validatedInner = AiResponseSchema.parse(parsed)
      return { rawContent: content, validated: validatedInner }
    },
    {
      maxRetries: 2,
      baseDelayMs: 2000,
      onRetry: (attempt, error, delay) => {
        console.warn(`[AI Trader] 第 ${attempt} 次决策失败,${delay.toFixed(0)}ms 后重试。错误: ${error?.message ?? error}`)
      },
    },
  ).catch((error: any) => {
    console.error(`AI 决策分析失败 (User Configured Strategy):`, error.message)
    throw error
  })

  // 过滤掉 hold 操作
  const actions = validated.decisions

  // [最后一道防线] 代码层面的资金硬性校验。
  // 预算口径必须与 generateAiPrompt 一致:max(0, 可用现金 - AI_CASH_RESERVE),
  // 否则 prompt 按扣减保底后的预算约束模型,而代码却允许花到全额现金,保底金会被击穿。
  const budgetLimit = Math.max(0, userConfig.availableCash - AI_CASH_RESERVE)
  let currentTotalBuy = 0

  // 过滤后的有效交易列表
  const validActions: TradeDecision[] = []

  for (const action of actions) {
    if (action.action === 'buy') {
      const amount = action.amount || 0
      if (currentTotalBuy + amount > budgetLimit) {
        console.warn(`[AI Trader] 触发资金风控拦截！`)
        const remaining = budgetLimit - currentTotalBuy
        if (remaining > AI_MIN_BUY_BUDGET) {
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
