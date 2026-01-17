import type { LeaderboardPeriod } from '~/types/leaderboard'
import { getLeaderboardData } from '~~/server/utils/leaderboard'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const period = (query.period as LeaderboardPeriod) || '1d'

  try {
    const leaderboardData = await getLeaderboardData(period)
    return leaderboardData
  }
  catch (error) {
    console.error(`获取排行榜数据(${period})时出错:`, error)
    throw createError({
      statusCode: 500,
      message: '获取排行榜数据失败。',
    })
  }
})
