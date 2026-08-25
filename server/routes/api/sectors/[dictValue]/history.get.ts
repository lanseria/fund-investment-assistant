import { format, subDays } from 'date-fns'
import { and, desc, eq, gte } from 'drizzle-orm'
import { sectorBindings, sectorCapitalHistory } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

/**
 * 查询项目板块的主力资金历史数据，用于图表展示。
 * 路径参数 dictValue 为项目板块 value（对应 funds.sector）。
 * query: days - 查询最近 N 天（默认 90）
 */
export default defineEventHandler(async (event) => {
  // 需要登录
  getUserFromEvent(event)

  const dictValue = getRouterParam(event, 'dictValue')
  if (!dictValue)
    throw createError({ status: 400, statusText: 'dictValue 是必需的' })

  const query = getQuery(event)
  const days = Math.min(Math.max(Number(query.days) || 90, 1), 365)

  const db = useDb()

  // 1. 查绑定关系，确认该项目板块已绑定东财板块
  const binding = await db.query.sectorBindings.findFirst({
    where: eq(sectorBindings.dictValue, dictValue),
  })

  // 未绑定：返回空历史 + 明确状态，前端据此显示引导提示
  if (!binding) {
    return {
      dictValue,
      sectorCode: null,
      sectorName: null,
      sectorType: null,
      bound: false,
      latest: null,
      history: {
        dates: [],
        mainStrength: [],
        mainCapital: [],
        mainHidden: [],
        retailCapital: [],
        changePercent: [],
        actions: [],
      },
    }
  }

  // 2. 查最近 N 天的快照（按日期升序，便于图表绘制）
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd')
  const records = await db.query.sectorCapitalHistory.findMany({
    where: and(
      eq(sectorCapitalHistory.sectorCode, binding.sectorCode),
      gte(sectorCapitalHistory.date, startDate),
    ),
    orderBy: [desc(sectorCapitalHistory.date)],
    limit: days,
  })

  // 反转为升序（最早 → 最新）
  records.reverse()

  // 3. 组装图表数据
  const history = {
    dates: records.map(r => r.date),
    mainStrength: records.map(r => r.mainStrength !== null ? Number(r.mainStrength) : null),
    mainCapital: records.map(r => r.mainCapital !== null ? Number(r.mainCapital) : null),
    mainHidden: records.map(r => r.mainHidden !== null ? Number(r.mainHidden) : null),
    retailCapital: records.map(r => r.retailCapital !== null ? Number(r.retailCapital) : null),
    changePercent: records.map(r => r.changePercent !== null ? Number(r.changePercent) : null),
    actions: records.map(r => r.mainAction ?? ''),
  }

  // 最新一条摘要（records 升序，最后一条即最新）
  const latestRecord = records[records.length - 1]
  const latest = latestRecord
    ? {
        date: latestRecord.date,
        mainAction: latestRecord.mainAction,
        mainStrength: latestRecord.mainStrength !== null ? Number(latestRecord.mainStrength) : null,
        mainCapital: latestRecord.mainCapital !== null ? Number(latestRecord.mainCapital) : null,
        mainHidden: latestRecord.mainHidden !== null ? Number(latestRecord.mainHidden) : null,
        retailCapital: latestRecord.retailCapital !== null ? Number(latestRecord.retailCapital) : null,
        changePercent: latestRecord.changePercent !== null ? Number(latestRecord.changePercent) : null,
      }
    : null

  return {
    dictValue,
    sectorCode: binding.sectorCode,
    sectorName: binding.sectorName,
    sectorType: binding.sectorType,
    bound: true,
    latest,
    history,
  }
})
