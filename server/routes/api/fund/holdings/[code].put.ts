// server/routes/api/fund/holdings/[code].put.ts
import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { FundNotFoundError, HoldingNotFoundError, updateHolding } from '~~/server/utils/holdings'

const holdingUpdateSchema = z.object({
  holdingAmount: z.number().positive(),
  holdingProfitRate: z.number().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event) // [NEW] 获取用户
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: '需要提供基金代码。' })

  try {
    const body = await readBody(event)
    const data = await holdingUpdateSchema.parseAsync(body)
    // [REFACTOR] 调用新的 updateHolding，并传入 userId
    const updated = await updateHolding(user.id, code, data)
    return updated
  }
  catch (error) {
    // [REFACTOR] 处理新的错误类型
    if (error instanceof HoldingNotFoundError || error instanceof FundNotFoundError)
      throw createError({ statusCode: 404, statusMessage: error.message })

    if (error instanceof z.ZodError)
      throw createError({ statusCode: 400, statusMessage: '输入数据无效。' })

    console.error(`更新基金 ${code} 时出错:`, error)
    throw createError({ statusCode: 500, statusMessage: '服务器内部错误' })
  }
})
