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
    if (curChangeRate < -2.0 && diffTurn > 1.0) {
      signal = '放量大跌'
      action = '坚决清仓'
    }
    else if (curVol > 10) {
      if (curChangeRate > 0) {
        signal = '高位震荡'
        action = '持有/停买'
      }
      else {
        signal = '极度拥挤'
        action = '减仓/防守'
      }
    }
    else if (curTurn < 1.0) {
      signal = '冰点筑底'
      action = '左侧建仓'
    }
    else if (curChangeRate < -2.0 && curTurn >= 1.0 && curTurn < 2.0) {
      signal = '无量阴跌'
      action = '空仓观望'
    }
    else if (curChangeRate > 0 && curVol >= 3 && curVol <= 8 && curTurn > 2 && diffTurn > 0) {
      signal = '主升浪'
      action = '持仓/加仓'
    }

    // 5. 仅保留产生买卖动作的指标信号
    const isBuy = action === '持仓/加仓' || action === '左侧建仓'
    const isSell = action === '坚决清仓' || action === '减仓/防守'

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
