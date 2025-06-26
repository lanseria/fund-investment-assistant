// server/routes/api/fund/holdings/index.get.ts
import { getUserFromEvent } from '~~/server/utils/auth'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdings' // 导入新函数

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  // 直接调用重构后的函数并返回结果
  return await getUserHoldingsAndSummary(user.id)
})
