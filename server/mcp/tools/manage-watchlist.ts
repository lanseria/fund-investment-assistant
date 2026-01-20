import { eq } from 'drizzle-orm' // [新增]
import { z } from 'zod'
import { funds } from '~~/server/database/schemas' // [新增]
import { useDb } from '~~/server/utils/db' // [新增]
import { HoldingExistsError, HoldingNotFoundError } from '~~/server/utils/errors'
import { addHolding, deleteHolding } from '~~/server/utils/holdingService'

export default defineMcpTool({
  name: 'manage_watchlist',
  description: '管理用户的基金关注列表（自选基金）。支持将新基金加入关注（以便系统开始追踪其净值和策略信号），或将已有的基金移除。',
  inputSchema: {
    action: z.enum(['add', 'remove']).describe('操作类型：add (添加关注) 或 remove (移除关注/删除持仓)'),
    fundCode: z.string().length(6).describe('6位基金代码，例如 "005918"'),
    fundType: z.enum(['open', 'qdii_lof']).optional().default('open').describe('基金类型：open (普通开放式/场外) 或 qdii_lof (场内/ETF/LOF)。仅当 action="add" 时有效。如果不确定，通常是 "open"。'),
  },
  handler: async ({ action, fundCode, fundType }) => {
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

    // --- Action: Add (添加关注) ---
    if (action === 'add') {
      try {
        // 调用 service 层逻辑，shares/costPrice 为 null 表示仅关注
        // 注意：addHolding 返回的是 holding 记录，不包含 fund 信息
        await addHolding({
          userId,
          code: fundCode,
          fundType: fundType || 'open',
          shares: null,
          costPrice: null,
        })

        // [修复] 单独查询基金名称以提供更好的反馈
        const db = useDb()
        const fundInfo = await db.query.funds.findFirst({
          where: eq(funds.code, fundCode),
          columns: { name: true },
        })

        const fundName = fundInfo?.name || fundCode

        return {
          content: [{
            type: 'text',
            text: `✅ 已成功关注基金：${fundName} (${fundCode})。\n系统将开始定时同步其净值并计算策略信号。`,
          }],
        }
      }
      catch (error: any) {
        if (error instanceof HoldingExistsError) {
          return {
            content: [{ type: 'text', text: `ℹ️ 该基金 (${fundCode}) 已经在您的列表（持仓或关注）中了，无需重复添加。` }],
          }
        }
        return {
          isError: true,
          content: [{ type: 'text', text: `添加失败: ${error.message}` }],
        }
      }
    }

    // --- Action: Remove (移除) ---
    if (action === 'remove') {
      try {
        // 调用 service 层逻辑
        await deleteHolding(userId, fundCode)

        return {
          content: [{
            type: 'text',
            text: `✅ 已移除基金 (${fundCode})。相关持仓记录及自定义设置已删除。`,
          }],
        }
      }
      catch (error: any) {
        if (error instanceof HoldingNotFoundError) {
          return {
            isError: true,
            content: [{ type: 'text', text: `移除失败：您并未持有或关注基金 ${fundCode}。` }],
          }
        }
        return {
          isError: true,
          content: [{ type: 'text', text: `移除失败: ${error.message}` }],
        }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
