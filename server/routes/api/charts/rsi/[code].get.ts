// server/routes/api/charts/rsi/[code].get.ts
import { ofetch } from 'ofetch'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  const query = getQuery(event)
  const config = useRuntimeConfig() // 获取运行时配置

  // 从配置中获取策略 API 的基地址
  const strategyApiBaseUrl = config.strategyApiUrl
  if (!strategyApiBaseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: '策略分析服务地址未配置 (NUXT_STRATEGY_API_URL)。',
    })
  }

  try {
    // 完整地代理请求，包括路径参数和查询参数
    return await ofetch(`/charts/rsi/${code}`, {
      baseURL: strategyApiBaseUrl,
      params: query,
    })
  }
  catch (error: any) {
    console.error(`代理请求到 /charts/rsi/${code} 失败:`, error)
    // 将下游服务的错误信息和状态码透传给前端
    throw createError({
      statusCode: error.response?.status || 500,
      statusMessage: error.data?.detail || '获取RSI图表数据时发生错误。',
    })
  }
})
