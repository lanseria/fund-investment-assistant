import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { FundNotFoundError, HoldingNotFoundError, updateHolding } from '~~/server/utils/holdings'

// [重大修改] 更新 Zod schema
const holdingUpdateSchema = z.object({
  shares: z.number().positive('份额必须为正数').nullable().optional(),
  costPrice: z.number().positive('成本价必须为正数').nullable().optional(),
}).refine(data => (data.shares && data.costPrice) || (!data.shares && !data.costPrice), {
  // [新增] 同样添加校验规则
  message: '持有份额和持仓成本价必须同时填写或同时不填。',
  path: ['shares'],
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: '需要提供基金代码。' })

  try {
    const body = await readBody(event)
    const data = await holdingUpdateSchema.parseAsync(body)
    const updated = await updateHolding(user.id, code, data)
    return updated
  }
  catch (error) {
    if (error instanceof HoldingNotFoundError || error instanceof FundNotFoundError)
      throw createError({ statusCode: 404, statusMessage: error.message })

    if (error instanceof z.ZodError)
      throw createError({ statusCode: 400, statusMessage: error.errors[0]?.message || '输入数据无效。' })

    console.error(`更新基金 ${code} 时出错:`, error)
    throw createError({ statusCode: 500, statusMessage: '服务器内部错误' })
  }
})
