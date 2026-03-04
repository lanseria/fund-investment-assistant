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
    const curChangeRate = Number(curr.changeRate || 0) // 新增：读取当日涨跌幅

    // 计算与昨日的差值
    const diffVol = prev ? curVol - Number(prev.volumeRatio || 0) : 0
    const diffTurn = prev ? curTurn - Number(prev.turnoverRate || 0) : 0

    // --- 升级版多维交叉决策系统逻辑 ---
    let signal = '震荡/分歧'
    let signalCode = 'neutral' // 用于前端配色
    let action = '观望'

    // 规则 1: 量价配合判定（防飞刀，最高优先级）
    if (curChangeRate < -2.0 && diffTurn > 1.0) {
      signal = '放量大跌'
      signalCode = 'down'
      action = '坚决清仓'
    }
    // 规则 2: 拥挤度一票否决权（防崩盘）
    else if (curVol > 10) {
      if (curChangeRate > 0) {
        signal = '高位震荡'
        signalCode = 'top'
        action = '持有/停买'
      }
      else {
        signal = '极度拥挤'
        signalCode = 'top'
        action = '减仓/防守'
      }
    }
    // 规则 3: 冰点底部的确认（抓潜伏）
    else if (curTurn < 1.0) {
      signal = '冰点筑底'
      signalCode = 'bottom'
      action = '左侧建仓'
    }
    // 补充规则: 无量阴跌
    else if (curChangeRate < -2.0 && curTurn >= 1.0 && curTurn < 2.0) {
      signal = '无量阴跌'
      signalCode = 'down'
      action = '空仓观望'
    }
    // 规则 4: 真正的主升浪定义（找主线）
    else if (curChangeRate > 0 && curVol >= 3 && curVol <= 8 && curTurn > 2 && diffTurn > 0) {
      signal = '主升浪'
      signalCode = 'up'
      action = '持仓/加仓'
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
