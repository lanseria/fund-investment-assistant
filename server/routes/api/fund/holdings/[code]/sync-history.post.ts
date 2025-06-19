// File: server/routes/api/fund/holdings/[code]/sync-history.post.ts

import { HoldingNotFoundError, syncSingleFundHistory } from '~~/server/utils/holdings'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  try {
    const count = await syncSingleFundHistory(code)
    return {
      message: `同步完成！新增 ${count} 条历史记录。`,
      count,
    }
  }
  catch (error) {
    if (error instanceof HoldingNotFoundError)
      throw createError({ statusCode: 404, statusMessage: error.message })

    console.error(`手动同步基金 ${code} 历史数据时出错:`, error)
    throw createError({ statusCode: 500, statusMessage: '同步失败，请查看服务器日志。' })
  }
})
