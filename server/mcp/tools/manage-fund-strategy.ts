import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { FundNotFoundError } from '~~/server/utils/errors'
import { setFundOperationStrategy } from '~~/server/utils/fundService'

export default defineMcpTool({
  name: 'manage_fund_strategy',
  description: '查看或修改基金的全局操作策略。策略为全局设置：所有用户查看同一只基金时共享同一份策略，作为 AI 分析与自动交易决策的参考。支持 get (查看策略)、set (设置/更新策略)、clear (清空策略)。',
  inputSchema: {
    action: z.enum(['get', 'set', 'clear']).describe('操作类型：get (查看策略) / set (设置或更新策略) / clear (清空策略)'),
    fundCode: z.string().length(6).describe('6位基金代码，例如 "161725"'),
    operationStrategy: z.string().max(2000).optional().describe('策略内容 (自由文本)。仅当 action="set" 时必填，例如："网格策略，每跌 3% 加仓一次；跌破年线清仓"。'),
  },
  handler: async ({ action, fundCode, operationStrategy }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Authentication required. Please provide a valid API key.',
        }],
      }
    }

    const db = useDb()

    // --- Action: Get (查看策略) ---
    if (action === 'get') {
      try {
        const fund = await db.query.funds.findFirst({
          where: eq(funds.code, fundCode),
          columns: { code: true, name: true, operationStrategy: true },
        })

        if (!fund) {
          return {
            isError: true,
            content: [{ type: 'text', text: `基金 ${fundCode} 不存在，请先通过 manage_watchlist (action=add) 添加关注。` }],
          }
        }

        return {
          content: [{
            type: 'text',
            text: `${fund.name} (${fund.code}) 的全局操作策略:\n${fund.operationStrategy || '(未设置)'}`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    // --- Action: Set (设置/更新策略) ---
    if (action === 'set') {
      if (!operationStrategy || !operationStrategy.trim()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'action="set" 时必须提供非空的 operationStrategy 内容。若想清空策略请使用 action="clear"。' }],
        }
      }

      try {
        const updated = await setFundOperationStrategy(fundCode, operationStrategy)
        return {
          content: [{
            type: 'text',
            text: `✅ 已更新基金 ${updated.name} (${updated.code}) 的全局操作策略:\n${updated.operationStrategy}\n注意: 该策略对所有用户共享, AI 分析与自动交易决策时会优先参考。`,
          }],
        }
      }
      catch (error: any) {
        if (error instanceof FundNotFoundError) {
          return {
            isError: true,
            content: [{ type: 'text', text: `基金 ${fundCode} 不存在，请先通过 manage_watchlist (action=add) 添加关注。` }],
          }
        }
        return { isError: true, content: [{ type: 'text', text: `设置失败: ${error.message}` }] }
      }
    }

    // --- Action: Clear (清空策略) ---
    if (action === 'clear') {
      try {
        const updated = await setFundOperationStrategy(fundCode, null)
        return {
          content: [{
            type: 'text',
            text: `✅ 已清空基金 ${updated.name} (${updated.code}) 的全局操作策略。`,
          }],
        }
      }
      catch (error: any) {
        if (error instanceof FundNotFoundError) {
          return {
            isError: true,
            content: [{ type: 'text', text: `基金 ${fundCode} 不存在，请先通过 manage_watchlist (action=add) 添加关注。` }],
          }
        }
        return { isError: true, content: [{ type: 'text', text: `清空失败: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
