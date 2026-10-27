// server/routes/api/market/hs300-penetration.get.ts

import type { Hs300PenetrationResponse } from '~~/shared/hs300Penetration'
import { getHs300Penetration } from '~~/server/utils/hs300Penetration'

/** query 参数取值宽松处理：refresh 为真值时强制绕过服务端缓存 */
function isTruthyRefresh(value: unknown): boolean {
  return value === true || value === '1' || value === 'true'
}

/**
 * GET /api/market/hs300-penetration?refresh=1
 *
 * 返回头部沪深300指数基金季报净资产合计 ÷ 沪深300流通市值的季度序列。
 * 鉴权由 server/middleware/auth.ts 全局中间件处理，这里不再重复校验。
 */
export default defineEventHandler(async (event): Promise<Hs300PenetrationResponse> => {
  const { refresh } = getQuery(event) as { refresh?: unknown }

  try {
    return await getHs300Penetration({
      refresh: isTruthyRefresh(refresh),
    })
  }
  catch (error) {
    // 先留原始错误（含上游 URL / 状态码），再对外抛统一文案，避免泄露内部细节
    console.error('[hs300-penetration] 获取沪深300基金占比数据失败:', error)
    throw createError({
      statusCode: 502,
      statusMessage: '获取沪深300基金占比数据失败',
    })
  }
})
