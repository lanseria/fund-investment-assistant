// server/routes/api/leaderboard/[userId].get.ts

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({
      status: 400,
      statusText: '需要提供用户 ID。',
    })
  }

  try {
    const data = await getUserHoldingsAndSummary(Number(userId))
    return data
  }
  catch (error) {
    console.error(`获取用户 ${userId} 的持仓详情时出错:`, error)
    throw createError({
      status: 500,
      statusText: '获取持仓详情失败。',
    })
  }
})
