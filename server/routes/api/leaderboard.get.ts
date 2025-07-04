// server/routes/api/leaderboard.get.ts
import { getLeaderboardData } from '~~/server/utils/leaderboard'

export default defineEventHandler(async () => {
  try {
    const leaderboardData = await getLeaderboardData()
    return leaderboardData
  }
  catch (error) {
    console.error('获取排行榜数据时出错:', error)
    throw createError({
      statusCode: 500,
      statusMessage: '获取排行榜数据失败。',
    })
  }
})
