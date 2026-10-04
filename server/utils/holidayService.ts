// server/utils/holidayService.ts
// A 股法定节假日的数据库存取与内存缓存。
// 数据来源: 管理员通过 POST /api/holidays/import 整年导入 (格式见 HOLIDAY_IMPORT_PROMPT)。
// 定时任务高频调用 getHolidayRanges 判定交易日,故用进程内缓存 + 短 TTL,
// 导入/删除后立即失效,避免每次判定都查库。

import type { HolidayRanges } from '~~/shared/market'
import { asc, eq } from 'drizzle-orm'
import { marketHolidays } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

/** 缓存有效期 (ms)。DB 数据几乎只在每年导入时变化,TTL 只为兜底防止多实例不一致 */
const CACHE_TTL_MS = 5 * 60 * 1000

interface HolidayCache {
  ranges: HolidayRanges
  /** 按年分组的明细,供 API 返回 */
  byYear: Map<number, { id: number, name: string, startDate: string, endDate: string }[]>
  years: Set<number>
  loadedAt: number
}

let cache: HolidayCache | null = null

function invalidateCache() {
  cache = null
}

async function loadCache(): Promise<HolidayCache> {
  const db = useDb()
  const rows = await db.select().from(marketHolidays).orderBy(asc(marketHolidays.year), asc(marketHolidays.startDate))

  const byYear = new Map<number, { id: number, name: string, startDate: string, endDate: string }[]>()
  const ranges: HolidayRanges = []
  for (const row of rows) {
    const list = byYear.get(row.year) ?? []
    list.push({ id: row.id, name: row.name, startDate: row.startDate, endDate: row.endDate })
    byYear.set(row.year, list)
    ranges.push([row.startDate, row.endDate])
  }

  return {
    ranges,
    byYear,
    years: new Set(byYear.keys()),
    loadedAt: Date.now(),
  }
}

async function getCache(): Promise<HolidayCache> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS)
    return cache
  cache = await loadCache()
  return cache
}

/**
 * 获取全部节假日区间 (供 isTradingDay 第二参使用)。
 * 数据库是唯一数据源: 未导入任何数据时返回空列表,交易日判定退化为仅按周末。
 */
export async function getHolidayRanges(): Promise<HolidayRanges> {
  const c = await getCache()
  return c.ranges
}

/** 全部节假日明细 (按年分组,含 id),供管理页展示 */
export async function getAllHolidays() {
  const c = await getCache()
  return [...c.byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, holidays]) => ({ year, holidays }))
}

/** 某一年是否已导入节假日数据 */
export async function hasYearHolidays(year: number): Promise<boolean> {
  const c = await getCache()
  return c.years.has(year)
}

export interface HolidayStatus {
  /** 已导入的年份列表 (降序) */
  years: number[]
  currentYear: number
  nextYear: number
  /** 当年数据缺失 (任何时候都应导入) */
  missingCurrentYear: boolean
  /** 已到 12 月且次年数据未导入 (年内最后提醒窗口) */
  missingNextYear: boolean
}

/** 导航栏提醒状态: 当年缺数据,或 12 月仍缺次年数据时提示 */
export async function getHolidayStatus(): Promise<HolidayStatus> {
  const c = await getCache()
  const now = new Date()
  const currentYear = now.getFullYear()
  const nextYear = currentYear + 1
  return {
    years: [...c.years].sort((a, b) => b - a),
    currentYear,
    nextYear,
    missingCurrentYear: !c.years.has(currentYear),
    missingNextYear: now.getMonth() === 11 && !c.years.has(nextYear),
  }
}

export interface HolidayImportItem {
  name: string
  start: string
  end: string
}

export interface HolidayImportPayload {
  year: number
  holidays: HolidayImportItem[]
}

/**
 * 整年导入 (替换式): 删除该年现有数据后插入新数据,单事务原子提交。
 * @returns 导入的区间条数
 */
export async function importYearHolidays(payload: HolidayImportPayload): Promise<number> {
  const db = useDb()

  // 逐条校验日期格式与归属年份,start <= end 由 zod refine 在 API 层保证
  const rows = payload.holidays.map(h => ({
    year: payload.year,
    name: h.name.trim(),
    startDate: h.start,
    endDate: h.end,
  }))

  await db.transaction(async (trx) => {
    await trx.delete(marketHolidays).where(eq(marketHolidays.year, payload.year))
    if (rows.length > 0)
      await trx.insert(marketHolidays).values(rows)
  })

  invalidateCache()
  return rows.length
}

/** 删除某一年全部节假日数据 (管理员) */
export async function deleteYearHolidays(year: number): Promise<void> {
  const db = useDb()
  await db.delete(marketHolidays).where(eq(marketHolidays.year, year))
  invalidateCache()
}
