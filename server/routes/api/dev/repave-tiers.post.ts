import { env } from 'node:process'
import { repaveAllFundTiers } from '~~/server/utils/tierRepave'

/**
 * 手动触发每周档位重铺 (仅开发环境)。
 * query: ?dryRun=1 只返回将要发生的变更，不写库；?viaTask=1 通过注册的定时任务执行 (验证任务注册)。
 */
export default defineEventHandler(async (event) => {
  // [安全措施] 仅在开发环境中允许此操作
  if (env.NODE_ENV !== 'development') {
    throw createError({
      status: 403,
      statusText: 'Forbidden: This endpoint is only available in development mode.',
    })
  }

  const query = getQuery(event)
  // 通过 Nitro 任务名执行，验证 scheduledTasks 注册无误
  if (query.viaTask === '1')
    return { result: await runTask('tier:repaveTiers') }

  const dryRun = query.dryRun === '1' || query.dryRun === 'true'
  const result = await repaveAllFundTiers({ dryRun })
  return { result }
})
