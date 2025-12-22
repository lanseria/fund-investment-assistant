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
      // 1. 创建转出记录 (Source) - [修改] 类型改为 convert_out
      const [outRecord] = await tx.insert(fundTransactions).values({
        userId: user.id,
        fundCode: data.fromCode,
        type: 'convert_out',
        status: 'pending',
        orderShares: String(data.shares),
        orderDate: data.date,
        note: `基金转换 -> ${data.toCode}`,
      }).returning()

      // 2. 创建转入记录 (Target) - [修改] 类型改为 convert_in
      // orderAmount 暂时为空，等待转出确认后由定时任务回填
      await tx.insert(fundTransactions).values({
        userId: user.id,
        fundCode: data.toCode,
        type: 'convert_in',
        status: 'pending',
        orderDate: data.date,
        relatedId: outRecord!.id, // 关键：关联到转出记录
        note: `基金转换 <- ${data.fromCode}`,
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
