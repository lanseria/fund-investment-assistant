import { getUserFromEvent } from '~~/server/utils/auth'
import { syncAllFundFees } from '~~/server/utils/fundService'

/**
 * 批量补全所有缺失费率的基金(仅管理员)。
 * 一次性运维操作:为 fundFees 表中尚无记录的基金从 Python 接口拉取费率。
 */
export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const result = await syncAllFundFees()
  return {
    message: result.total === 0
      ? '所有基金费率数据均已存在,无需补全'
      : `补全完成:成功 ${result.success}/${result.total} 只`,
    ...result,
  }
})
