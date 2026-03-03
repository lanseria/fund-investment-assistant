import dayjs from 'dayjs'
import { eq, sql } from 'drizzle-orm'
import { ofetch } from 'ofetch'
import { dictionaryData, sectorDailyStats } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { SECTOR_PLATFORM_MAPPING } from '~~/shared/sector-mapping'

export async function syncSectorStats(dateStr?: string) {
  const config = useRuntimeConfig()
  const strategyApiBaseUrl = config.strategyApiUrl
  if (!strategyApiBaseUrl)
    throw new Error('未配置策略服务 API (NUXT_STRATEGY_API_URL)')

  const targetDate = dateStr || dayjs().format('YYYY-MM-DD')

  // 并发请求两个接口
  const [emRes, thsRes] = await Promise.all([
    ofetch(`${strategyApiBaseUrl}/market/df_sectors`).catch((e) => { console.error('东方财富接口请求失败:', e.message); return null }),
    ofetch(`${strategyApiBaseUrl}/market/ths_sectors`).catch((e) => { console.error('同花顺接口请求失败:', e.message); return null }),
  ])

  const emSectors: any[] = emRes?.sectors || []
  const thsSectors: any[] = thsRes?.sectors || []

  const db = useDb()
  // 获取系统中所有用户可能使用到的板块字典
  const dictSectors = await db.query.dictionaryData.findMany({
    where: eq(dictionaryData.dictType, 'sectors'),
  })

  const rowsToUpsert = []

  for (const dict of dictSectors) {
    const sectorValue = dict.value
    const mapping = SECTOR_PLATFORM_MAPPING[sectorValue] || { eastMoney: [], tongHuaShun: [] }
    // 匹配平台数据
    const matchedEm = emSectors.filter(s => mapping.eastMoney.includes(s.name))
    const matchedThs = thsSectors.filter(s => mapping.tongHuaShun.includes(s.name))

    if (matchedEm.length === 0 && matchedThs.length === 0)
      continue

    // 1. 聚合东方财富数据 (换手率/涨跌幅需除以100)
    let emTurnoverRateSum = 0
    let emMarketCapSum = 0
    let emChangePercentSum = 0
    matchedEm.forEach((s) => {
      emTurnoverRateSum += (s.turnover_rate / 100)
      emMarketCapSum += s.market_cap
      emChangePercentSum += (s.change_percent / 100)
    })
    const emTurnoverRate = matchedEm.length > 0 ? emTurnoverRateSum / matchedEm.length : null
    const emChangePercent = matchedEm.length > 0 ? emChangePercentSum / matchedEm.length : null
    const emMarketCap = matchedEm.length > 0 ? emMarketCapSum : null

    // 2. 聚合同花顺数据
    let thsChangePercentSum = 0
    let thsNetInflowSum = 0
    let thsUpCountSum = 0
    let thsDownCountSum = 0
    let thsTurnoverRatioSum = 0
    matchedThs.forEach((s) => {
      thsChangePercentSum += s.change_percent
      thsNetInflowSum += s.net_inflow
      thsUpCountSum += s.up_count
      thsDownCountSum += s.down_count
      thsTurnoverRatioSum += s.turnover_ratio
    })
    const thsChangePercent = matchedThs.length > 0 ? thsChangePercentSum / matchedThs.length : null
    const thsTurnoverRatio = matchedThs.length > 0 ? thsTurnoverRatioSum / matchedThs.length : null
    const thsNetInflow = matchedThs.length > 0 ? thsNetInflowSum : null

    // 3. 最终值决策逻辑 (依据您的需求)
    const finalChangeRate = thsChangePercent !== null ? thsChangePercent : emChangePercent
    const finalTurnoverRate = emTurnoverRate
    const finalVolumeRatio = thsTurnoverRatio
    const finalMarketCap = emMarketCap
    const finalNetInflow = thsNetInflow
    const finalUpCount = matchedThs.length > 0 ? thsUpCountSum : null
    const finalDownCount = matchedThs.length > 0 ? thsDownCountSum : null

    rowsToUpsert.push({
      date: targetDate,
      sector: sectorValue,
      changeRate: finalChangeRate ? String(finalChangeRate) : null,
      turnoverRate: finalTurnoverRate ? String(finalTurnoverRate) : null,
      volumeRatio: finalVolumeRatio ? String(finalVolumeRatio) : null,
      totalMarketCap: finalMarketCap ? String(finalMarketCap) : null,
      netInflow: finalNetInflow ? String(finalNetInflow) : null,
      upCount: finalUpCount,
      downCount: finalDownCount,
    })
  }

  // 4. 执行批量 Upsert (有则更新，无则插入)
  if (rowsToUpsert.length > 0) {
    await db.insert(sectorDailyStats)
      .values(rowsToUpsert)
      .onConflictDoUpdate({
        target: [sectorDailyStats.date, sectorDailyStats.sector],
        set: {
          changeRate: sql`EXCLUDED.change_rate`,
          turnoverRate: sql`EXCLUDED.turnover_rate`,
          volumeRatio: sql`EXCLUDED.volume_ratio`,
          totalMarketCap: sql`EXCLUDED.total_market_cap`,
          netInflow: sql`EXCLUDED.net_inflow`,
          upCount: sql`EXCLUDED.up_count`,
          downCount: sql`EXCLUDED.down_count`,
          createdAt: new Date(),
        },
      })
  }
  return rowsToUpsert.length
}
