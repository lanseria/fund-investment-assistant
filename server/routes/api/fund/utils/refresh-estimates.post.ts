import { syncAllHoldingsEstimates } from '~~/server/utils/holdings'

export default defineEventHandler(async () => {
  try {
    const result = await syncAllHoldingsEstimates()
    return {
      message: '所有基金估值刷新完成。',
      ...result,
    }
  }
  catch (error: any) {
    console.error('刷新所有基金估值时出错:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `刷新失败: ${error.message}`,
    })
  }
})
