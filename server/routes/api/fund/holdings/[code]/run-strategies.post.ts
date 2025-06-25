// server/routes/api/fund/holdings/[code]/run-strategies.post.ts
import { runStrategiesForFund } from '~~/server/utils/strategies'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  try {
    const result = await runStrategiesForFund(code)
    return {
      message: `基金 ${code} 的策略分析已执行完成。`,
      ...result,
    }
  }
  catch (error: any) {
    console.error(`为基金 ${code} 手动执行策略分析时出错:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: `执行失败: ${error.message}`,
    })
  }
})
