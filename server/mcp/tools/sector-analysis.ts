import { desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { dictionaryData, sectorDailyStats } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineMcpTool({
  name: 'get_sector_analysis',
  description: '按日期查询当日的板块(行业)数据分析。返回包含板块名称、涨跌幅、换手率、成交额占比、总市值等。特别注意：返回数据中已经包含由系统量化模型计算出的决策信号 (signal) 和操作建议 (action)，AI 在分析板块和生成交易策略时，必须直接参考此数据进行量化决策。',
  inputSchema: {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '格式需为 YYYY-MM-DD').optional().describe('查询日期。如果不提供，则默认查询系统中最新有数据的一天。'),
  },
  handler: async ({ date }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Authentication required. Please provide a valid API key.' }],
      }
    }

    const db = useDb()

    // 2. 确定查询日期
    let targetDate = date
    if (!targetDate) {
      const latest = await db.query.sectorDailyStats.findFirst({
        orderBy: [desc(sectorDailyStats.date)],
        columns: { date: true },
      })
      if (!latest) {
        return { content: [{ type: 'text', text: '系统内暂无板块数据。' }] }
      }
      targetDate = latest.date
    }

    // 3. 获取当日数据
    const currentStats = await db.query.sectorDailyStats.findMany({
      where: eq(sectorDailyStats.date, targetDate),
    })

    if (currentStats.length === 0) {
      return { content: [{ type: 'text', text: `未找到 ${targetDate} 的板块分析数据。` }] }
    }

    // 4. 查找上一交易日的数据 (用于计算变动，从而生成量化决策)
    const prevRecord = await db.query.sectorDailyStats.findFirst({
      where: lt(sectorDailyStats.date, targetDate),
      orderBy: [desc(sectorDailyStats.date)],
      columns: { date: true },
    })

    const prevStatsMap = new Map()
    if (prevRecord) {
      const prevData = await db.query.sectorDailyStats.findMany({
        where: eq(sectorDailyStats.date, prevRecord.date),
      })
      prevData.forEach(p => prevStatsMap.set(p.sector, p))
    }

    // 5. 获取字典映射以显示中文名称
    const dictSectors = await db.query.dictionaryData.findMany({
      where: eq(dictionaryData.dictType, 'sectors'),
    })
    const dictMap = new Map(dictSectors.map(d => [d.value, d.label]))

    // 6. 计算并组合数据
    const results = currentStats.map((curr) => {
      const prev = prevStatsMap.get(curr.sector)

      const curVol = Number(curr.volumeRatio || 0)
      const curTurn = Number(curr.turnoverRate || 0)
      const curChangeRate = Number(curr.changeRate || 0)

      const diffTurn = prev ? curTurn - Number(prev.turnoverRate || 0) : 0

      // --- 核心量化决策系统逻辑 (与 /api/sectors/stats.get.ts 保持一致) ---
      let signal = '震荡分歧'
      let action = '底仓观望 (30%)'

      // 1. 极端风控 (最高优先级)
      if (curChangeRate <= -3.0 && diffTurn > 0.5) {
        signal = '放量暴跌'
        action = '风控清仓 (0%)'
      }
      else if (curChangeRate <= -2.0 && curVol > 10) {
        signal = '拥挤踩踏'
        action = '减仓避险 (0-20%)'
      }
      // 2. 高位预警 (拥挤度过高)
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
      // 3. 主升浪行情 (右侧趋势)
      else if (curChangeRate >= 1.5 && diffTurn > 0.5 && curVol >= 3 && curVol <= 10) {
        signal = '放量突破'
        action = '右侧追击 (80-100%)'
      }
      else if (curChangeRate >= 0.5 && curTurn > 2 && diffTurn >= -0.5) {
        signal = '温和推升'
        action = '趋势持仓 (60-80%)'
      }
      // 4. 底部特征 (左侧潜伏)
      else if (curTurn < 1.0 && curChangeRate >= -0.5 && curChangeRate <= 1.0) {
        signal = '冰点企稳'
        action = '试探建仓 (10-20%)'
      }
      else if (curTurn < 1.5 && curChangeRate > 1.0 && diffTurn > 0) {
        signal = '底部异动'
        action = '左侧加仓 (30-50%)'
      }
      // 5. 下跌中继
      else if (curChangeRate < -1.0 && diffTurn <= 0) {
        signal = '缩量阴跌'
        action = '阴跌观望 (0-10%)'
      }
      else if (curChangeRate < -1.0 && diffTurn > 0) {
        signal = '放量回调'
        action = '谨慎防守 (20%)'
      }
      // 6. 默认震荡
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

      return {
        sectorName: dictMap.get(curr.sector) || curr.sector,
        changeRate: `${curChangeRate > 0 ? '+' : ''}${curChangeRate.toFixed(2)}%`,
        turnoverRate: `${curTurn.toFixed(2)}%`,
        volumeRatio: `${curVol.toFixed(2)}%`,
        totalMarketCap: curr.totalMarketCap ? `${(Number(curr.totalMarketCap) / 100000000).toFixed(2)} 亿` : '未知',
        signal,
        action,
      }
    })

    // 按涨跌幅从高到低排序，便于 AI 快速掌握领涨和领跌板块
    results.sort((a, b) => Number.parseFloat(b.changeRate) - Number.parseFloat(a.changeRate))

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          date: targetDate,
          total_sectors: results.length,
          data: results,
        }, null, 2),
      }],
    }
  },
})
