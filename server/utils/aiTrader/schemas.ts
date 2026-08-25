import type { AiModel } from '~~/shared/ai-models'
import { z } from 'zod'

/** AI 交易决策的输入/输出契约与用户配置类型。 */

export const TradeDecisionSchema = z.object({
  fundCode: z.string(),
  fundName: z.string().optional(),
  action: z.enum(['buy', 'sell', 'convert_out', 'convert_in']),
  amount: z.number().optional().describe('买入金额，仅 action=buy 时有效'),
  shares: z.number().optional().describe('卖出/转出份额，仅 action=sell/convert_out 时有效'),
  relatedIndex: z.number().int().min(0).nullable().optional().describe('基金转换配对索引：convert_in 必须通过此字段指向同数组中对应的 convert_out 索引；convert_out 应将此字段置为 null'),
  reason: z.string().describe('详细的决策逻辑分析'),
})

export const AiResponseSchema = z.object({
  decisions: z.array(TradeDecisionSchema),
})

export type TradeDecision = z.infer<typeof TradeDecisionSchema>

export interface UserAiConfig {
  availableCash: number
  aiSystemPrompt?: string | null
  model?: AiModel
}

// 返回类型增加日志信息
export interface AiTradeResult {
  decisions: TradeDecision[]
  fullPrompt: string
  rawResponse: string
}
