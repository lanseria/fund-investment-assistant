// server/routes/api/ai/prompt-preview.get.ts
import { and, eq, sql } from 'drizzle-orm'
import { fundTransactions, users } from '~~/server/database/schemas'
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

  // 2. 计算实时可用资金 (扣除今日 Pending 买入)
  // 获取今日日期的字符串
  const todayStr = new Date().toISOString().split('T')[0]
  const pendingBuyAmount = await db.select({
    total: sql<string>`SUM(order_amount)`,
  })
    .from(fundTransactions)
    .where(and(
      eq(fundTransactions.userId, targetUser.id),
      eq(fundTransactions.status, 'pending'),
      eq(fundTransactions.type, 'buy'),
      eq(fundTransactions.orderDate, todayStr), // 仅限当日
    ))

  const currentCash = Number(targetUser.availableCash || 0)
  const frozenCash = Number(pendingBuyAmount[0]?.total || 0)
  const realAvailableCash = Math.max(0, currentCash - frozenCash)

  // 3. 生成 Prompt
  try {
    const { fullPromptLog } = await generateAiPrompt(holdings, {
      availableCash: realAvailableCash,
      aiSystemPrompt: targetUser.aiSystemPrompt,
    })

    return { prompt: fullPromptLog }
  }
  catch (e: any) {
    throw createError({ statusCode: 500, message: e.message })
  }
})
