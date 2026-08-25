/* eslint-disable no-console */
import type { SectorCapitalItem, SectorCapitalResponse, SectorType } from '~/types/sector'
import { format } from 'date-fns'
import { sql } from 'drizzle-orm'
import { ofetch } from 'ofetch'
import { sectorCapitalHistory } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { parseYi } from '~~/shared/sectorCapital'

/**
 * 请求上游策略服务的 /sector/capital 全量板块资金接口。
 * 与 server/routes/api/sectors/capital/index.get.ts 的透传逻辑一致。
 */
export async function fetchSectorCapital(sectorType: SectorType): Promise<SectorCapitalResponse> {
  const config = useRuntimeConfig()
  const strategyApiBaseUrl = config.strategyApiUrl
  if (!strategyApiBaseUrl)
    throw new Error('策略分析服务地址未配置 (NUXT_STRATEGY_API_URL)。')

  return await ofetch<SectorCapitalResponse>('/sector/capital', {
    baseURL: strategyApiBaseUrl,
    params: { type: sectorType },
  })
}

/**
 * 校验东财板块代码是否存在于上游返回中。
 * @returns 命中的板块项（含 name），未命中返回 null
 */
export async function findSectorFromUpstream(
  sectorType: SectorType,
  sectorCode: string,
): Promise<SectorCapitalItem | null> {
  try {
    const resp = await fetchSectorCapital(sectorType)
    return resp.sectors.find(s => s.code === sectorCode) ?? null
  }
  catch {
    // 上游不可达时不阻断绑定（允许离线绑定，后续抓取时再校验）
    return null
  }
}

/**
 * 数值转字符串（drizzle numeric 列要求 string 类型），null 保持不变。
 */
function toNumericStr(val: number | null): string | null {
  return val === null ? null : String(val)
}

/**
 * 将单条上游板块资金数据转换为 sector_capital_daily 的插入记录。
 * numeric 列统一转为字符串以满足 drizzle 类型约束。
 */
function toDailyRecord(item: SectorCapitalItem, date: string, dictValue: string | null) {
  return {
    date,
    sectorCode: item.code,
    dictValue,
    sectorName: item.name,
    changePercent: toNumericStr(item.changePercent),
    amount: toNumericStr(parseYi(item.amount)),
    mainCapital: toNumericStr(parseYi(item.mainCapital)),
    retailCapital: toNumericStr(parseYi(item.retailCapital)),
    mainHidden: toNumericStr(parseYi(item.mainHidden)),
    mainStrength: toNumericStr(item.mainStrength),
    mainAction: item.mainAction,
  }
}

/**
 * 抓取并落库当日所有已绑定板块的主力资金快照。
 *
 * 逻辑：
 * 1. 查询所有 sector_bindings，按 sectorType 分组
 * 2. 对每个 sectorType 调用上游 /sector/capital 拿到全量数据
 * 3. 在结果中按 sectorCode 匹配绑定项，解析数值后 upsert 到 sector_capital_daily
 *
 * @param targetDate 指定快照日期（默认今天，便于回补）
 * @returns 抓取统计 { total, saved, skipped }
 */
export async function syncSectorCapitalSnapshot(targetDate?: string): Promise<{
  total: number
  saved: number
  skipped: number
}> {
  const db = useDb()
  const date = targetDate ?? format(new Date(), 'yyyy-MM-dd')

  // 1. 查询所有绑定关系
  const bindings = await db.query.sectorBindings.findMany()
  if (bindings.length === 0) {
    console.log('[sector:syncCapital] 没有板块绑定关系，跳过抓取。')
    return { total: 0, saved: 0, skipped: 0 }
  }

  // 2. 按 sectorType 分组
  const grouped = new Map<SectorType, typeof bindings>()
  for (const b of bindings) {
    const list = grouped.get(b.sectorType as SectorType) ?? []
    list.push(b)
    grouped.set(b.sectorType as SectorType, list)
  }

  let saved = 0
  let skipped = 0

  // 3. 逐组抓取上游并落库
  for (const [sectorType, groupBindings] of grouped) {
    let resp: SectorCapitalResponse
    try {
      resp = await fetchSectorCapital(sectorType)
    }
    catch (e) {
      console.error(`[sector:syncCapital] 获取 ${sectorType} 板块资金失败:`, e)
      skipped += groupBindings.length
      continue
    }

    // 构造 sectorCode -> binding 的映射，便于 O(1) 查找
    const bindingMap = new Map(groupBindings.map(b => [b.sectorCode, b]))

    // 匹配上游数据中属于本组的板块
    const records = resp.sectors
      .filter(s => bindingMap.has(s.code))
      .map(s => toDailyRecord(s, date, bindingMap.get(s.code)!.dictValue))

    if (records.length > 0) {
      // upsert：同 (date, sectorCode) 冲突时用待插入行(excluded)的值更新（盘中重跑会覆盖）
      // 使用 excluded 引用，确保批量插入时每条记录各自覆盖对应字段
      await db.insert(sectorCapitalHistory)
        .values(records)
        .onConflictDoUpdate({
          target: [sectorCapitalHistory.date, sectorCapitalHistory.sectorCode],
          set: {
            dictValue: sql`excluded.dict_value`,
            sectorName: sql`excluded.sector_name`,
            changePercent: sql`excluded.change_percent`,
            amount: sql`excluded.amount`,
            mainCapital: sql`excluded.main_capital`,
            retailCapital: sql`excluded.retail_capital`,
            mainHidden: sql`excluded.main_hidden`,
            mainStrength: sql`excluded.main_strength`,
            mainAction: sql`excluded.main_action`,
          },
        })
      saved += records.length
    }

    skipped += groupBindings.length - records.length
  }

  console.log(`[sector:syncCapital] 日期=${date} 绑定=${bindings.length} 已保存=${saved} 跳过=${skipped}`)
  return { total: bindings.length, saved, skipped }
}
