import { getUserFromEvent } from '~~/server/utils/auth'
import { syncSectorStats } from '~~/server/utils/sectorSync'

export default defineEventHandler(async (event) => {
  getUserFromEvent(event) // 鉴权
  try {
    const count = await syncSectorStats()
    return { message: `同步成功，更新了 ${count} 个板块数据。` }
  }
  catch (e: any) {
    throw createError({ status: 500, statusText: e.message })
  }
})
