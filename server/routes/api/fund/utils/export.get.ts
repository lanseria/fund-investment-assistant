import { exportHoldingsData } from '~~/server/utils/holdings'

export default defineEventHandler(async (event) => {
  const data = await exportHoldingsData()
  setResponseHeaders(event, {
    'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="fund_holdings_export.json"',
  })
  return data
})
