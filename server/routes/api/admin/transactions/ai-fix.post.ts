/* eslint-disable no-console */
import { and, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { aiExecutionLogs, fundTransactions, users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdingAnalysis'
import { getAiTradeDecisions } from '~~/server/utils/aiTrader'
import { useDb } from '~~/server/utils/db'
import { getAiFixStatus, setAiFixStatus } from '~~/server/utils/aiFixStatus'
import { AI_MODELS, type AiModel } from '~~/shared/ai-models'

const AiFixSchema = z.object({
  userId: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  model: z.enum(AI_MODELS as [AiModel, ...AiModel[]]),
})

export default defineEventHandler(async (event) => {
  const operator = getUserFromEvent(event)

  const body = await readBody(event)
  let parsedBody
  try {
    parsedBody = await AiFixSchema.parseAsync(body)
  }
  catch (e: any) {
    throw createError({ status: 400, statusText: `Invalid JSON format: ${e.message}` })
  }

  const { userId, date, model } = parsedBody

  if (operator.role !== 'admin' && operator.id !== userId) {
    throw createError({ status: 403, statusText: 'Forbidden: Admins only or self access' })
  }

  const db = useDb()
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      username: true,
      availableCash: true,
      aiSystemPrompt: true,
    },
  })

  if (!targetUser) {
    throw createError({ status: 404, statusText: 'Target user not found' })
  }

  if (!targetUser.aiSystemPrompt || !targetUser.aiSystemPrompt.trim()) {
    throw createError({ status: 400, statusText: 'Target user has no AI system prompt configured' })
  }

  const existingStatus = await getAiFixStatus(date, userId)
  if (existingStatus?.loading) {
    return { loading: true }
  }

  const startedAt = new Date().toISOString()
  await setAiFixStatus(date, userId, {
    loading: true,
    model,
    startedAt,
  })

  const runAiFix = async () => {
    let errorMessage: string | undefined
    try {
      const { holdings } = await getUserHoldingsAndSummary(userId)

      if (holdings.length === 0) {
        console.log(`[AI Fix] User ${userId} has no holdings. Skipped.`)
        return
      }

      const pendingBuyAmount = await db.select({
        total: sql<string>`SUM(order_amount)`,
      })
        .from(fundTransactions)
        .where(and(
          eq(fundTransactions.userId, userId),
          eq(fundTransactions.status, 'pending'),
          eq(fundTransactions.type, 'buy'),
          ne(fundTransactions.orderDate, date),
        ))

      const currentCash = Number(targetUser.availableCash || 0)
      const frozenCash = Number(pendingBuyAmount[0]?.total || 0)
      const realAvailableCash = Math.max(0, currentCash - frozenCash)

      const { decisions, fullPrompt, rawResponse } = await getAiTradeDecisions(holdings, {
        availableCash: realAvailableCash,
        aiSystemPrompt: targetUser.aiSystemPrompt,
        model,
      })

      const promptWithMeta = `--- MODEL ---\n${model}\n\n${fullPrompt}`

      await db.insert(aiExecutionLogs).values({
        userId,
        date,
        prompt: promptWithMeta,
        response: rawResponse,
      })

      await db.transaction(async (tx) => {
        await tx.delete(fundTransactions)
          .where(and(
            eq(fundTransactions.userId, userId),
            eq(fundTransactions.orderDate, date),
            eq(fundTransactions.status, 'pending'),
          ))

        if (decisions.length === 0)
          return

        const insertedIds = new Map<number, number>()

        for (const [index, d] of decisions.entries()) {
          let relatedId: number | null | undefined = null
          const relatedIndex = (d as any).relatedIndex

          if (relatedIndex !== undefined) {
            if (insertedIds.has(relatedIndex)) {
              relatedId = insertedIds.get(relatedIndex)
            }
            else {
              throw createError({
                status: 400,
                statusText: `Decision at index ${index} refers to relatedIndex ${relatedIndex} which has not been processed yet.`,
              })
            }
          }

          const [insertedTx] = await tx.insert(fundTransactions).values({
            userId,
            fundCode: d.fundCode,
            type: d.action,
            status: 'pending',
            orderAmount: d.amount ? String(d.amount) : null,
            orderShares: d.shares ? String(d.shares) : null,
            orderDate: date,
            note: `[AI修正] ${d.reason || ''}`,
            relatedId,
          }).returning({ id: fundTransactions.id })

          if (insertedTx) {
            insertedIds.set(index, insertedTx.id)
          }
        }
      })
    }
    catch (err: any) {
      errorMessage = err?.message || 'Unknown error'
      console.error(`[AI Fix] Failed for user ${userId}:`, err)
    }
    finally {
      await setAiFixStatus(date, userId, {
        loading: false,
        model,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: errorMessage,
      })
    }
  }

  void runAiFix()

  return { loading: true }
})
