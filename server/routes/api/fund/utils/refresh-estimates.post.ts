// server/routes/api/fund/utils/refresh-estimates.post.ts
import { getUserFromEvent } from '~~/server/utils/auth'
import { syncAllFundsEstimates, syncUserFundsEstimates } from '~~/server/utils/fundService'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const body = await readBody(event).catch(() => ({}))
  const scope = body?.scope || 'user' // 默认为 user 级别，更安全

  try {
    let result
    if (scope === 'all') {
      // 只有管理员可以触发全量刷新
      if (user.role !== 'admin') {
        throw createError({ status: 403, statusText: '权限不足：仅管理员可执行全量刷新。' })
      }
      result = await syncAllFundsEstimates()
    }
    else {
      // 默认刷新当前用户的基金
      result = await syncUserFundsEstimates(user.id)
    }

    return {
      message: scope === 'all' ? '全站基金估值刷新完成。' : '您的持仓基金估值刷新完成。',
      ...result,
    }
  }
  catch (error: any) {
    console.error('刷新所有基金估值时出错:', error)
    throw createError({
      status: 500,
      statusText: `刷新失败: ${error.message}`,
    })
  }
})
