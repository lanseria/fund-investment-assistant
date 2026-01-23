import { z } from 'zod'
import { fundTransactions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const transactionSchema = z.object({
  fundCode: z.string().min(1, '基金代码不能为空'),
  type: z.enum(['buy', 'sell']),
  // [修改] 添加 .nullable() 以允许前端传 null
  amount: z.number().positive().nullable().optional(),
  shares: z.number().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
}).refine((data) => {
  // 这里的检查逻辑不需要变，因为 !null 和 !undefined 都是 true
  if (data.type === 'buy' && !data.amount)
    return false
  if (data.type === 'sell' && !data.shares)
    return false
  return true
}, {
  error: '买入需提供金额，卖出需提供份额',
  path: ['amount'],
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const body = await readBody(event)

  try {
    const data = await transactionSchema.parseAsync(body)
    const db = useDb()

    const [record] = await db.insert(fundTransactions).values({
      userId: user.id,
      fundCode: data.fundCode,
      type: data.type,
      status: 'pending',
      // data.amount 为 null 或 undefined 时都会存储为 null，这是正确的
      orderAmount: data.amount ? String(data.amount) : null,
      orderShares: data.shares ? String(data.shares) : null,
      orderDate: data.date,
    }).returning()

    return { statusText: '交易请求已记录', record }
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({ status: 400, statusText: error.message || '输入无效' })
    }
    console.error('保存交易记录失败:', error)
    throw createError({ status: 500, statusText: '服务器内部错误' })
  }
})
