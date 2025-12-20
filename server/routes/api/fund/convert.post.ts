// server/routes/api/fund/convert.post.ts
import { z } from 'zod'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const convertSchema = z.object({
  fromCode: z.string().min(1),
  toCode: z.string().min(1),
  shares: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const body = await readBody(event)

  try {
    const data = await convertSchema.parseAsync(body)

    if (data.fromCode === data.toCode) {
      throw createError({ statusCode: 400, message: '转出和转入基金不能相同' })
    }

    const db = useDb()

    // 使用事务确保原子性：同时创建卖出和买入记录
    await db.transaction(async (tx) => {
      // 1. 创建卖出记录 (Source)
      const [sellRecord] = await tx.insert(fundTransactions).values({
        userId: user.id,
        fundCode: data.fromCode,
        type: 'sell',
        status: 'pending',
        orderShares: String(data.shares),
        orderDate: data.date,
        note: `转换卖出 -> ${data.toCode}`,
      }).returning()

      // 2. 创建买入记录 (Target)
      // orderAmount 暂时为空，等待卖出确认后由定时任务回填
      await tx.insert(fundTransactions).values({
        userId: user.id,
        fundCode: data.toCode,
        type: 'buy',
        status: 'pending',
        orderDate: data.date,
        relatedId: sellRecord!.id, // 关键：关联到卖出记录
        note: `转换买入 <- ${data.fromCode}`,
      })
    })

    return { message: '转换申请已提交' }
  }
  catch (error: any) {
    if (error instanceof z.ZodError) {
      throw createError({ statusCode: 400, message: '输入数据格式错误' })
    }
    console.error('转换失败:', error)
    throw createError({ statusCode: 500, message: error.message || '转换提交失败' })
  }
})
