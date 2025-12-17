import { env } from 'node:process'

export default defineEventHandler(async () => {
  // 仅限开发环境
  if (env.NODE_ENV !== 'development') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const result = await runTask('fund:processTransactions')
  return result
})
