// server/routes/api/fund/holdings/[code].delete.ts
import { getUserFromEvent } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event) // [NEW] 获取用户
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '需要提供基金代码。' })

  try {
    // [REFACTOR] 调用新的 deleteHolding，并传入 userId
    await deleteHolding(user.id, code)
    setResponseStatus(event, 204) // No Content
  }
  catch (error) {
    if (error instanceof HoldingNotFoundError)
      throw createError({ status: 404, statusText: error.message })

    console.error(`删除基金 ${code} 时出错:`, error)
    throw createError({ status: 500, statusText: '服务器内部错误' })
  }
})
