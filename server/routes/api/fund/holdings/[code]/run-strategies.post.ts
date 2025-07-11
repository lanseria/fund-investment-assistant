// server/routes/api/fund/holdings/[code]/run-strategies.post.ts
import { getUserFromEvent } from '~~/server/utils/auth' // [新增] 导入认证工具
import { runStrategiesForFund } from '~~/server/utils/strategies'

export default defineEventHandler(async (event) => {
  // [新增] 从事件中获取当前登录的用户信息
  const user = getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  try {
    // [修改] 调用 runStrategiesForFund 时，传入用户ID
    const result = await runStrategiesForFund(code, user.id)
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
