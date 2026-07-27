import { fetchFundRealtimeRaw } from '~~/server/utils/dataFetcher'

/**
 * 基金盘中实时估值展示接口(透传 powercloud 聚合接口的完整响应)。
 *
 * 与定时同步任务(server/utils/fundService.syncSingleFundEstimate)的区别:
 * - 本接口纯展示,不落库,返回包含 intraday 分时数据与 quoteSource/message 状态标识
 * - 同步任务用精简版 fetchFundRealtimeEstimate,只取涨跌幅写库
 *
 * 错误码:
 * - 400: 代码格式错误(非 6 位数字)——本路由先行校验,先于数据源调用(powercloud 对非 6 位代码可能误匹配)
 * - 404: 基金不存在(powercloud 返回 name==code 且 gsz 占位),或数据源不可用
 * - 5xx: 上游服务故障,透传状态码
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')

  // 代码格式校验:6 位数字(powercloud 对非 6 位代码(如 5 位)可能误匹配,故由路由层保证)
  if (!code || !/^\d{6}$/.test(code)) {
    throw createError({
      statusCode: 400,
      statusText: '基金代码格式错误,需为 6 位数字',
    })
  }

  // 上游错误(404/5xx)原样透传
  return await fetchFundRealtimeRaw(code)
})
