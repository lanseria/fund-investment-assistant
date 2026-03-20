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
    let signal = '震荡分歧'
    let signalCode = 'neutral' // 用于前端配色
    let action = '底仓观望 (30%)'

    // 1. 极端风控 (最高优先级)
    if (curChangeRate <= -3.0 && diffTurn > 0.5) {
      signal = '放量暴跌'
      signalCode = 'down'
      action = '风控清仓 (0%)'
    }
    else if (curChangeRate <= -2.0 && curVol > 10) {
      signal = '拥挤踩踏'
      signalCode = 'down'
      action = '减仓避险 (0-20%)'
    }
    // 2. 高位预警 (拥挤度过高)
    else if (curVol > 12) {
      if (curChangeRate > 0) {
        signal = '情绪过热'
        signalCode = 'top'
        action = '逢高止盈 (30%)'
      }
      else {
        signal = '高位派发'
        signalCode = 'top'
        action = '防守减仓 (20%)'
      }
    }
    // 3. 主升浪行情 (右侧趋势)
    else if (curChangeRate >= 1.5 && diffTurn > 0.5 && curVol >= 3 && curVol <= 10) {
      signal = '放量突破'
      signalCode = 'up'
      action = '右侧追击 (80-100%)'
    }
    else if (curChangeRate >= 0.5 && curTurn > 2 && diffTurn >= -0.5) {
      signal = '温和推升'
      signalCode = 'up'
      action = '趋势持仓 (60-80%)'
    }
    // 4. 底部特征 (左侧潜伏)
    else if (curTurn < 1.0 && curChangeRate >= -0.5 && curChangeRate <= 1.0) {
      signal = '冰点企稳'
      signalCode = 'bottom'
      action = '试探建仓 (10-20%)'
    }
    else if (curTurn < 1.5 && curChangeRate > 1.0 && diffTurn > 0) {
      signal = '底部异动'
      signalCode = 'bottom'
      action = '左侧加仓 (30-50%)'
    }
    // 5. 下跌中继
    else if (curChangeRate < -1.0 && diffTurn <= 0) {
      signal = '缩量阴跌'
      signalCode = 'down'
      action = '阴跌观望 (0-10%)'
    }
    else if (curChangeRate < -1.0 && diffTurn > 0) {
      signal = '放量回调'
      signalCode = 'down'
      action = '谨慎防守 (20%)'
    }
    // 6. 默认震荡
    else {
      if (curChangeRate > 0) {
        signal = '缩量震荡'
        signalCode = 'neutral'
        action = '底仓持有 (30-50%)'
      }
      else {
        signal = '弱势震荡'
        signalCode = 'neutral'
        action = '高抛低吸 (20-30%)'
      }
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
