import { env } from 'node:process'

export default defineEventHandler(async () => {
  // [安全措施] 仅在开发环境中允许此操作
  if (env.NODE_ENV !== 'development') {
    throw createError({
      status: 403,
      statusText: 'Forbidden: This endpoint is only available in development mode.',
    })
  }

  const result = await runTask('ai:runAutoTrade')
  return { result }
})
