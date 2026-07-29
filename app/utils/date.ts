import { subMonths, subYears } from 'date-fns'

/**
 * 按「月 / 年」单位回退日期，兼容旧的 dayjs 复数 unit 字符串。
 * 仅支持图表筛选场景用到的 month/months/year/years。
 */
export function subtractByUnit(date: Date, amount: number, unit: string): Date {
  if (unit === 'year' || unit === 'years')
    return subYears(date, amount)
  // 默认按月处理（含 'month' / 'months'）
  return subMonths(date, amount)
}
