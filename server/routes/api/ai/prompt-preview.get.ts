// server/routes/api/ai/prompt-preview.get.ts
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schemas'
import { generateAiPrompt } from '~~/server/utils/aiTrader'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdingAnalysis'

export default defineEventHandler(async (event) => {
  const currentUser = getUserFromEvent(event)
  const query = getQuery(event)
  const targetUserId = Number(query.userId)

  if (!targetUserId) {
    throw createError({ statusCode: 400, message: 'Missing userId' })
  }

  // 权限校验：Admin 可以查看任何人，普通用户只能查看自己
  if (currentUser.role !== 'admin' && currentUser.id !== targetUserId) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const db = useDb()
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  })

  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // 1. 获取持仓数据
  const { holdings } = await getUserHoldingsAndSummary(targetUser.id)

  const currentCash = Number(targetUser.availableCash || 0)

  // 3. 生成 Prompt
  try {
    const { fullPromptLog } = await generateAiPrompt(holdings, {
      availableCash: currentCash,
      aiSystemPrompt: targetUser.aiSystemPrompt,
    })

    return { prompt: fullPromptLog }
  }
  catch (e: any) {
    throw createError({ statusCode: 500, message: e.message })
  }
})
