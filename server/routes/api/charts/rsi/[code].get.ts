import type { RsiChartData } from '~/types/chart' // 虽然是自动导入，但显式写出更清晰
import { ofetch } from 'ofetch'

// 为 defineEventHandler 明确指定返回的 Promise 类型
export default defineEventHandler(async (event): Promise<RsiChartData> => {
  const code = getRouterParam(event, 'code')
  const query = getQuery(event)
  const config = useRuntimeConfig()

  const strategyApiBaseUrl = config.strategyApiUrl
  if (!strategyApiBaseUrl) {
    throw createError({
      status: 500,
      statusText: '策略分析服务地址未配置 (NUXT_STRATEGY_API_URL)。',
    })
  }

  try {
    // 使用泛型来告知 ofetch 期望返回的数据类型
    const data = await ofetch<RsiChartData>(`/charts/rsi/${code}`, {
      baseURL: strategyApiBaseUrl,
      params: query,
    })
    return data
  }
  catch (error: any) {
    console.error(`代理请求到 /charts/rsi/${code} 失败:`, error)

    // 保持现有的错误透传逻辑
    throw createError({
      status: error.response?.status || 500,
      statusText: error.data?.detail || '获取RSI图表数据时发生错误。',
    })
  }
})
