// server/routes/api/fund/holdings/[code]/clear-position.post.ts

import { getUserFromEvent } from '~~/server/utils/auth'
import { clearHoldingPosition, HoldingNotFoundError } from '~~/server/utils/holdings'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: '需要提供基金代码。' })

  try {
    await clearHoldingPosition(user.id, code)
    return { message: `基金 ${code} 已成功清仓，转为仅关注状态。` }
  }
  catch (error) {
    if (error instanceof HoldingNotFoundError)
      throw createError({ statusCode: 404, statusMessage: error.message })

    console.error(`清仓基金 ${code} 时出错:`, error)
    throw createError({ statusCode: 500, statusMessage: '服务器内部错误' })
  }
})
