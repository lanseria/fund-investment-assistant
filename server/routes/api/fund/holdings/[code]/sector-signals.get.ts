import { asc, eq } from 'drizzle-orm'
import { funds, navHistory, sectorDailyStats } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '需要提供基金代码' })

  const db = useDb()

  // 1. 获取基金信息并检查是否有绑定的板块
  const fund = await db.query.funds.findFirst({ where: eq(funds.code, code) })
  if (!fund || !fund.sector)
    return []

  // 2. 获取该板块的所有历史每日统计数据（按日期升序）
  const stats = await db.query.sectorDailyStats.findMany({
    where: eq(sectorDailyStats.sector, fund.sector),
    orderBy: [asc(sectorDailyStats.date)],
  })

  // 3. 获取该基金的所有历史净值（用于确定图表上的 Y 坐标点）
  const navs = await db.query.navHistory.findMany({
    where: eq(navHistory.code, code),
  })
  const navMap = new Map(navs.map(n => [n.navDate, n.nav]))

  const signals = []
  let prevTurn: number | null = null

  // 4. 遍历历史数据，重演量化决策逻辑
  for (const curr of stats) {
    const curVol = Number(curr.volumeRatio || 0)
    const curTurn = Number(curr.turnoverRate || 0)
    const curChangeRate = Number(curr.changeRate || 0)

    const diffTurn = prevTurn !== null ? curTurn - prevTurn : 0
    prevTurn = curTurn // 记录当日换手率供下一次循环使用

    let signal = '震荡/分歧'
    let action = '观望'

    // --- 核心多维交叉决策系统逻辑 ---
    if (curChangeRate <= -3.0 && diffTurn > 0.5) {
      signal = '放量暴跌'
      action = '风控清仓 (0%)'
    }
    else if (curChangeRate <= -2.0 && curVol > 10) {
      signal = '拥挤踩踏'
      action = '减仓避险 (0-20%)'
    }
    else if (curVol > 12) {
      if (curChangeRate > 0) {
        signal = '情绪过热'
        action = '逢高止盈 (30%)'
      }
      else {
        signal = '高位派发'
        action = '防守减仓 (20%)'
      }
    }
    else if (curChangeRate >= 1.5 && diffTurn > 0.5 && curVol >= 3 && curVol <= 10) {
      signal = '放量突破'
      action = '右侧追击 (80-100%)'
    }
    else if (curChangeRate >= 0.5 && curTurn > 2 && diffTurn >= -0.5) {
      signal = '温和推升'
      action = '趋势持仓 (60-80%)'
    }
    else if (curTurn < 1.0 && curChangeRate >= -0.5 && curChangeRate <= 1.0) {
      signal = '冰点企稳'
      action = '试探建仓 (10-20%)'
    }
    else if (curTurn < 1.5 && curChangeRate > 1.0 && diffTurn > 0) {
      signal = '底部异动'
      action = '左侧加仓 (30-50%)'
    }
    else if (curChangeRate < -1.0 && diffTurn <= 0) {
      signal = '缩量阴跌'
      action = '阴跌观望 (0-10%)'
    }
    else if (curChangeRate < -1.0 && diffTurn > 0) {
      signal = '放量回调'
      action = '谨慎防守 (20%)'
    }
    else {
      if (curChangeRate > 0) {
        signal = '缩量震荡'
        action = '底仓持有 (30-50%)'
      }
      else {
        signal = '弱势震荡'
        action = '高抛低吸 (20-30%)'
      }
    }

    // 5. 仅保留产生买卖动作的指标信号
    const isBuy = action.includes('建仓') || action.includes('加仓') || action.includes('追击') || action.includes('低吸')
    const isSell = action.includes('清仓') || action.includes('减仓') || action.includes('止盈') || action.includes('避险') || action.includes('防守') || action.includes('高抛')

    if (isBuy || isSell) {
      const closeNav = navMap.get(curr.date)
      if (closeNav) {
        // 构造前端图表需要的标准 Strategy 信号对象
        signals.push({
          id: curr.id,
          strategyName: 'sector_quant',
          signal: isBuy ? '买入' : '卖出', // 统一映射为 买入/卖出 图标渲染
          reason: `[板块决策: ${action}] 状态: ${signal}\n换手率: ${curTurn.toFixed(2)}% (日差: ${diffTurn > 0 ? '+' : ''}${diffTurn.toFixed(2)}%)\n成交额占比: ${curVol.toFixed(2)}%\n涨跌幅: ${curChangeRate.toFixed(2)}%`,
          latestDate: curr.date,
          latestClose: Number(closeNav),
          metrics: {
            turnoverRate: curTurn,
            volumeRatio: curVol,
            changeRate: curChangeRate,
            diffTurnoverRate: diffTurn,
          },
        })
      }
    }
  }

  return signals
})
