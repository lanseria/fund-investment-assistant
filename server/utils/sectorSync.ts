import { Buffer } from 'node:buffer'
import dayjs from 'dayjs'
import { eq, sql } from 'drizzle-orm'
import iconv from 'iconv-lite'
import { ofetch } from 'ofetch'
import { dictionaryData, sectorDailyStats } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { SECTOR_PLATFORM_MAPPING } from '~~/shared/sector-mapping'

/**
 * 获取沪深两市当日总成交额 (单位: 元)
 * 来源: 腾讯财经 (上证指数 + 深证成指)
 * 注意：使用深证成指(399001)作为深市代表
 */
async function fetchTotalMarketTurnover(): Promise<number> {
  const url = `https://qt.gtimg.cn/q=sh000001,sz399001`
  try {
    const res = await ofetch<ArrayBuffer>(url)
    const text = iconv.decode(Buffer.from(res), 'GBK')

    // 解析结果，第37位是成交额(万)
    // 格式: v_sh000001="1~...~37_amount_10k~..."
    const lines = text.split(';').filter(l => l.trim().length > 0)
    let totalAmount10k = 0

    for (const line of lines) {
      const parts = line.split('~')
      if (parts.length > 37) {
        const amountStr = parts[37]
        totalAmount10k += Number(amountStr)
      }
    }

    // 转换为 元
    return totalAmount10k * 10000
  }
  catch (e: any) {
    console.error('获取市场总成交额失败:', e.message)
    return 0
  }
}

export async function syncSectorStats(dateStr?: string) {
  const config = useRuntimeConfig()
  const strategyApiBaseUrl = config.strategyApiUrl
  if (!strategyApiBaseUrl)
    throw new Error('未配置策略服务 API (NUXT_STRATEGY_API_URL)')

  const targetDate = dateStr || dayjs().format('YYYY-MM-DD')

  // 并发请求: 东方财富数据、同花顺数据、全市场总成交额
  const [emRes, thsRes, totalMarketTurnover] = await Promise.all([
    ofetch(`${strategyApiBaseUrl}/market/df_sectors`).catch((e) => { console.error('东方财富接口请求失败:', e.message); return null }),
    ofetch(`${strategyApiBaseUrl}/market/ths_sectors`).catch((e) => { console.error('同花顺接口请求失败:', e.message); return null }),
    fetchTotalMarketTurnover(),
  ])
  const emSectors: any[] = emRes?.sectors || []
  const thsSectors: any[] = thsRes?.sectors || []

  // 简单校验总成交额，避免除零错误
  if (totalMarketTurnover <= 0) {
    console.warn('获取到的市场总成交额为 0 或失败，成交额占比计算将可能不准确。')
  }
  else {
    // console.log(`[SectorSync] 当日全市场总成交额: ${(totalMarketTurnover / 100000000).toFixed(2)} 亿`)
  }

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

    // 1. 聚合东方财富数据 (作为主要数据源)
    let emTurnoverRateSum = 0
    let emMarketCapSum = 0
    let emChangePercentSum = 0
    let emAmountSum = 0 // 板块成交额汇总

    matchedEm.forEach((s) => {
      emTurnoverRateSum += (s.turnover_rate / 100) // 接口返回 827 代表 8.27%
      emMarketCapSum += s.market_cap
      emChangePercentSum += (s.change_percent / 100) // 接口返回 1336 代表 13.36%
      emAmountSum += (s.amount || 0) // 确保接口返回 amount
    })

    const emTurnoverRate = matchedEm.length > 0 ? emTurnoverRateSum / matchedEm.length : null
    const emChangePercent = matchedEm.length > 0 ? emChangePercentSum / matchedEm.length : null
    const emMarketCap = matchedEm.length > 0 ? emMarketCapSum : null

    // 计算成交额占比: (板块总成交额 / 全市场总成交额) * 100
    let calculatedVolumeRatio: number | null = null
    if (totalMarketTurnover > 0 && matchedEm.length > 0) {
      calculatedVolumeRatio = (emAmountSum / totalMarketTurnover) * 100
    }

    // 2. 聚合同花顺数据 (作为补充)
    let thsChangePercentSum = 0
    let thsNetInflowSum = 0
    let thsUpCountSum = 0
    let thsDownCountSum = 0
    // let thsTurnoverRatioSum = 0 // 不再使用同花顺的 turnover_ratio

    matchedThs.forEach((s) => {
      thsChangePercentSum += s.change_percent
      thsNetInflowSum += s.net_inflow
      thsUpCountSum += s.up_count
      thsDownCountSum += s.down_count
      // thsTurnoverRatioSum += s.turnover_ratio
    })

    const thsChangePercent = matchedThs.length > 0 ? thsChangePercentSum / matchedThs.length : null
    const thsNetInflow = matchedThs.length > 0 ? thsNetInflowSum : null

    // 3. 最终值决策逻辑
    const finalChangeRate = thsChangePercent !== null ? thsChangePercent : emChangePercent
    const finalTurnoverRate = emTurnoverRate
    // [修改] 优先使用基于东方财富数据计算的占比
    const finalVolumeRatio = calculatedVolumeRatio
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
