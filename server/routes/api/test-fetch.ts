import { fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'

export default defineEventHandler(async (event) => {
  // 从 URL 查询参数中获取要测试的基金代码，例如 /api/test-fetch?code=161725
  const query = getQuery(event)
  const fundCode = query.code as string

  if (!fundCode) {
    return { error: 'Please provide a fund code via query parameter, e.g., ?code=161725' }
  }

  console.log(`\n--- [TEST ROUTE] Triggering fetch for code: ${fundCode} ---\n`)

  const result = await fetchFundRealtimeEstimate(fundCode)

  if (result) {
    return {
      message: `Successfully fetched data for ${fundCode}`,
      data: result,
    }
  }
  else {
    // 返回一个明确的错误信息给浏览器，同时终端里有更详细的日志
    return {
      error: `Failed to fetch data for ${fundCode}. Check the terminal for detailed logs.`,
    }
  }
})
