import { desc, eq, lt } from 'drizzle-orm'
import { sectorDailyStats } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  getUserFromEvent(event) // 鉴权

  const query = getQuery(event)
  const dateStr = query.date as string

  if (!dateStr) {
    throw createError({ status: 400, statusText: '需要提供查询日期 (date)' })
  }

  const db = useDb()

  // 1. 获取当日数据
  const currentStats = await db.query.sectorDailyStats.findMany({
    where: eq(sectorDailyStats.date, dateStr),
  })

  // 2. 查找最近的一个历史日期 (上一交易日)
  const prevRecord = await db.query.sectorDailyStats.findFirst({
    where: lt(sectorDailyStats.date, dateStr),
    orderBy: [desc(sectorDailyStats.date)],
    columns: { date: true },
  })

  // 3. 如果存在历史日期，获取该日所有数据并建立映射
  const prevStatsMap = new Map()
  if (prevRecord) {
    const prevData = await db.query.sectorDailyStats.findMany({
      where: eq(sectorDailyStats.date, prevRecord.date),
    })
    prevData.forEach(p => prevStatsMap.set(p.sector, p))
  }

  // 4. 组合数据并计算信号
  return currentStats.map((curr) => {
    const prev = prevStatsMap.get(curr.sector)

    // 转换为数字，处理 null
    const curVol = Number(curr.volumeRatio || 0)
    const curTurn = Number(curr.turnoverRate || 0)

    // 计算与昨日的差值
    const diffVol = prev ? curVol - Number(prev.volumeRatio || 0) : 0
    const diffTurn = prev ? curTurn - Number(prev.turnoverRate || 0) : 0

    // --- 四象限决策系统逻辑 ---
    let signal = '震荡/分歧'
    let signalCode = 'neutral' // 用于前端配色
    let action = '观望'

    // 优先级 1: 极端值判断 (象限二 & 象限四)
    if (curVol > 10 && curTurn > 5) {
      signal = '见顶/高潮'
      signalCode = 'top' // 极热
      action = '清仓'
    }
    else if (curVol < 3 && curTurn < 1) {
      signal = '冰点/筑底'
      signalCode = 'bottom' // 极冷
      action = '建仓'
    }
    // 优先级 2: 趋势判断 (象限一 & 象限三)
    else if (diffVol > 0 && diffTurn > 0) {
      signal = '主升浪'
      signalCode = 'up' // 上升
      action = '满仓'
    }
    else if (diffVol < 0 && diffTurn < 0) {
      signal = '阴跌/退潮'
      signalCode = 'down' // 下降
      action = '空仓'
    }

    return {
      ...curr,
      diffVolumeRatio: diffVol,
      diffTurnoverRate: diffTurn,
      signal,
      signalCode,
      action,
    }
  })
})
