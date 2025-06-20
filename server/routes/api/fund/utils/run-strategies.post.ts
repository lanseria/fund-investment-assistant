// server/routes/api/fund/utils/run-strategies.post.ts
import { runStrategiesForAllHoldings } from '~~/server/utils/strategies'

export default defineEventHandler(async () => {
  try {
    const result = await runStrategiesForAllHoldings()
    return {
      message: '所有基金策略分析已执行完成。',
      ...result,
    }
  }
  catch (error: any) {
    console.error('手动执行策略分析时出错:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `执行失败: ${error.message}`,
    })
  }
})
