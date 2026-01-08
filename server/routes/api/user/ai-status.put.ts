import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 允许更新部分或全部字段
const updateAiConfigSchema = z.object({
  isAiAgent: z.boolean().optional(),
  aiModel: z.string().optional(),
  aiTotalAmount: z.number().optional(),
  aiSystemPrompt: z.string().optional().nullable(), // 允许清空自定义Prompt
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const body = await readBody(event)
  const data = await updateAiConfigSchema.parseAsync(body)

  const db = useDb()

  // 构建更新对象，过滤掉 undefined
  const updateData: Record<string, any> = {}
  if (data.isAiAgent !== undefined)
    updateData.isAiAgent = data.isAiAgent
  if (data.aiModel !== undefined)
    updateData.aiModel = data.aiModel
  if (data.aiTotalAmount !== undefined)
    updateData.aiTotalAmount = String(data.aiTotalAmount)
  if (data.aiSystemPrompt !== undefined)
    updateData.aiSystemPrompt = data.aiSystemPrompt

  await db.update(users)
    .set(updateData)
    .where(eq(users.id, user.id))

  // 返回合并后的新配置以便前端更新 Store
  return { message: 'AI 配置已更新', config: updateData }
})
