// server/routes/api/admin/transactions/batch-replace.post.ts
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 定义输入的 JSON 结构
const TradeDecisionSchema = z.object({
  fundCode: z.string(),
  action: z.enum(['buy', 'sell', 'convert_out', 'convert_in']),
  amount: z.number().nullable().optional(),
  shares: z.number().nullable().optional(),
  reason: z.string().optional(),
  // [新增] 关联索引：用于 convert_in 指向对应的 convert_out 在 decisions 数组中的下标
  relatedIndex: z.number().int().min(0).optional(),
})

const BatchReplaceSchema = z.object({
  userId: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decisions: z.array(TradeDecisionSchema),
})

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })
  }

  const body = await readBody(event)
  let parsedBody
  try {
    parsedBody = await BatchReplaceSchema.parseAsync(body)
  }
  catch (e: any) {
    throw createError({ status: 400, statusText: `Invalid JSON format: ${e.message}` })
  }

  const { userId, date, decisions } = parsedBody
  const db = useDb()

  await db.transaction(async (tx) => {
    // 1. 删除该用户在该日期下所有待处理 (pending) 的交易
    await tx.delete(fundTransactions)
      .where(and(
        eq(fundTransactions.userId, userId),
        eq(fundTransactions.orderDate, date),
        eq(fundTransactions.status, 'pending'),
      ))

    // 2. 插入新的交易记录
    if (decisions.length > 0) {
      // 用于存储已插入记录的 ID，key 为 decisions 数组的索引
      const insertedIds = new Map<number, number>()

      for (const [index, d] of decisions.entries()) {
        let relatedId: number | null | undefined = null

        // 处理关联逻辑
        if (d.relatedIndex !== undefined) {
          if (insertedIds.has(d.relatedIndex)) {
            relatedId = insertedIds.get(d.relatedIndex)
          }
          else {
            // 如果指向的索引还未插入（比如指向后面的），则无法关联，抛出错误或忽略
            // 这里我们要求源交易（convert_out）必须在目标交易（convert_in）之前
            throw createError({
              status: 400,
              statusText: `Decision at index ${index} refers to relatedIndex ${d.relatedIndex} which has not been processed yet. Please order 'convert_out' before 'convert_in'.`,
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
          note: `[人工修正] ${d.reason || ''}`,
          relatedId, // 写入关联 ID
        }).returning({ id: fundTransactions.id })

        if (insertedTx) {
          insertedIds.set(index, insertedTx.id)
        }
      }
    }
  })

  return { message: `Successfully replaced transactions for user ${userId} on ${date}` }
})
