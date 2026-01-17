// server/routes/api/leaderboard/[userId].get.ts

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({
      statusCode: 400,
      message: '需要提供用户 ID。',
    })
  }

  try {
    const { holdings } = await getUserHoldingsAndSummary(Number(userId))
    // 为了保护隐私，不返回汇总信息，只返回持仓列表
    return holdings
  }
  catch (error) {
    console.error(`获取用户 ${userId} 的持仓详情时出错:`, error)
    throw createError({
      statusCode: 500,
      message: '获取持仓详情失败。',
    })
  }
})
