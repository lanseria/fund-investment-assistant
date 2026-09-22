// shared/dcaPlan.ts
// 基金定投计划的纯计算逻辑,前后端共享(Nuxt shared 目录)。
// 服务端定时任务/CRUD API 用它推算下次扣款日,前端表单用它做下次扣款日预览。

import { addDays, addMonths, format, getDay, parseISO, startOfDay } from 'date-fns'
import { isTradingDay } from './market'

/** 定投频率: 每周 / 每两周 / 每月 (与 dca_frequency 枚举一致) */
export type DcaFrequency = 'weekly' | 'biweekly' | 'monthly'

/** weekday 下标 → 中文名 (与 date-fns getDay 一致: 0=周日) */
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/**
 * 计算下一次计划扣款日 (YYYY-MM-DD)。
 * 规则: 取严格晚于 fromDate 的第一个锚点日;若落在周末/法定节假日,
 * 顺延到下一个交易日 (与主流平台「非交易日顺延」一致)。
 *
 * @param fromDate 起算日期 (计划创建日或本期实际执行日),Date 或 'YYYY-MM-DD'
 * @param frequency 定投频率
 * @param anchorDay 扣款日锚点: weekly 1-5 (周一~周五), monthly 1-28; biweekly 忽略
 */
export function computeNextExecutionDate(
  fromDate: Date | string,
  frequency: DcaFrequency,
  anchorDay?: number | null,
): string {
  const from = startOfDay(typeof fromDate === 'string' ? parseISO(fromDate) : fromDate)
  let next = nextScheduledDate(from, frequency, anchorDay)
  // 非交易日顺延到下一交易日 (周末 + HOLIDAYS_CONFIG 法定节假日)
  while (!isTradingDay(next).isTrading)
    next = addDays(next, 1)
  return format(next, 'yyyy-MM-dd')
}

/** 定投频率展示文案 */
export function frequencyLabel(frequency: DcaFrequency): string {
  const labels: Record<DcaFrequency, string> = { weekly: '每周', biweekly: '每两周', monthly: '每月' }
  return labels[frequency]
}

/** 扣款日锚点展示文案,如 "每周三" / "每月25日"; biweekly 无锚点返回空串 */
export function anchorDayLabel(frequency: DcaFrequency, anchorDay?: number | null): string {
  if (frequency === 'biweekly' || !anchorDay)
    return ''
  if (frequency === 'weekly')
    return WEEKDAY_LABELS[anchorDay] ? `每${WEEKDAY_LABELS[anchorDay]}` : ''
  return `每月${anchorDay}日`
}

/** 严格晚于 from 的下一个锚点日 (不做交易日校验) */
function nextScheduledDate(from: Date, frequency: DcaFrequency, anchorDay?: number | null): Date {
  if (frequency === 'biweekly')
    return addDays(from, 14)

  if (frequency === 'monthly') {
    const day = clampAnchorDay(anchorDay, 1, 28)
    const candidate = new Date(from.getFullYear(), from.getMonth(), day)
    return candidate > from ? candidate : addMonths(candidate, 1)
  }

  const day = clampAnchorDay(anchorDay, 1, 5)
  const diff = ((day - getDay(from)) % 7 + 7) % 7
  return addDays(from, diff === 0 ? 7 : diff)
}

/** 锚点越界时收敛到合法区间,避免脏数据导致推算出无效日期 */
function clampAnchorDay(anchorDay: number | null | undefined, min: number, max: number): number {
  const day = Number(anchorDay) || min
  return Math.min(Math.max(Math.round(day), min), max)
}
