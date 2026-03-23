import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineMcpTool({
  name: 'manage_ai_settings',
  description: '管理您的 AI 智能代理设置。支持查看(view)当前配置，或修改(update) AI 自动操作模式(aiMode)及自定义策略提示词(aiSystemPrompt)。',
  inputSchema: {
    action: z.enum(['view', 'update']).describe('操作类型：view (查看配置) 或 update (修改配置)'),
    aiMode: z.enum(['auto', 'draft', 'off']).optional().describe('AI 自动操作模式。auto(全自动), draft(预操作), off(关闭)。仅在 update 时有效。'),
    aiSystemPrompt: z.string().optional().describe('自定义 AI System Prompt (策略提示词)。仅在 update 时有效。如果不提供，则保持原样；如果传空字符串，则会清空并使用系统默认提示词。'),
  },
  handler: async ({ action, aiMode, aiSystemPrompt }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Authentication required. Please provide a valid API key.' }],
      }
    }

    const db = useDb()

    // --- Action: View (查看) ---
    if (action === 'view') {
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { aiMode: true, aiSystemPrompt: true },
        })

        if (!user) {
          return { isError: true, content: [{ type: 'text', text: '未找到当前用户信息，请重新登录获取新 Token。' }] }
        }

        return {
          content: [{
            type: 'text',
            text: `您的当前 AI 配置如下:\n\n- AI 操作模式 (aiMode): ${user.aiMode}\n- 策略提示词 (aiSystemPrompt):\n${user.aiSystemPrompt ? user.aiSystemPrompt : '(当前未设置自定义提示词，系统将使用默认内置模板)'}`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    // --- Action: Update (修改) ---
    if (action === 'update') {
      const updateData: Record<string, any> = {}
      const logs: string[] = []

      // 动态构建需要更新的字段
      if (aiMode !== undefined) {
        updateData.aiMode = aiMode
        logs.push(`- AI模式已更改为: ${aiMode}`)
      }

      if (aiSystemPrompt !== undefined) {
        // 如果传入了空字符串，我们视作清空(null)以使用系统默认
        updateData.aiSystemPrompt = aiSystemPrompt.trim() === '' ? null : aiSystemPrompt
        logs.push(updateData.aiSystemPrompt ? `- 策略提示词已成功更新` : `- 策略提示词已被清空 (恢复系统默认)`)
      }

      if (Object.keys(updateData).length === 0) {
        return { content: [{ type: 'text', text: '没有提供需要修改的参数。请指定 aiMode 或 aiSystemPrompt。' }] }
      }

      try {
        await db.update(users)
          .set(updateData)
          .where(eq(users.id, userId))

        return {
          content: [{
            type: 'text',
            text: `✅ AI 设置更新成功!\n\n${logs.join('\n')}`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `更新失败: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
