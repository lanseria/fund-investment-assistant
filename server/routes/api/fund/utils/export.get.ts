// server/routes/api/fund/utils/export.get.ts
import { getUserFromEvent } from '~~/server/utils/auth'
import { exportHoldingsData } from '~~/server/utils/holdings'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event) // [NEW] 获取用户
  // [REFACTOR] 调用新的导出函数，并传入 userId
  const data = await exportHoldingsData(user.id)
  setResponseHeaders(event, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="fund_holdings_export_${user.username}.json"`,
  })
  return data
})
