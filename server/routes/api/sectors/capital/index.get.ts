import type { SectorCapitalResponse } from '~/types/sector'
import { ofetch } from 'ofetch'

/**
 * 代理请求到策略服务的 /sector/capital 全量板块资金接口。
 * 上游支持 type=industry|concept（兼容「行业」/「概念」/「2」/「3」别名），此处原样透传。
 */
export default defineEventHandler(async (event): Promise<SectorCapitalResponse> => {
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
    const data = await ofetch<SectorCapitalResponse>('/sector/capital', {
      baseURL: strategyApiBaseUrl,
      params: query,
    })
    return data
  }
  catch (error: any) {
    console.error('代理请求到 /sector/capital 失败:', error)

    throw createError({
      status: error.response?.status || 500,
      statusText: error.data?.detail || '获取板块主力资金数据时发生错误。',
    })
  }
})
