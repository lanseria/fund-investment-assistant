import { format, getDay, isAfter, isBefore, isEqual, parseISO, setHours, setMinutes, setSeconds, startOfDay } from 'date-fns'

export const marketGroups = {
  A: {
    label: 'A 股',
    codes: ['sh000001', 'sh000300', 'sh000016', 'sh000003', 'sh000688'],
  },
  B: {
    label: '深市',
    codes: ['sz399001', 'sz399006', 'sz399106', 'sz399003'],
  },
  HK: {
    label: '港股',
    codes: [
      'hkHSI', // 恒生指数
      'hk02837', // 恒生科技
      'hk01810', // 小米
      'hk00981', // 中芯国际
      'hk09988', // 阿里巴巴
      'hk00700', // 腾讯
    ],
  },
  US: {
    label: '美股',
    codes: [
      'usDJI', // 道琼斯
      'usIXIC', // 纳斯达克
      'usTSLA', // 特斯拉
      'usAAPL', // 苹果
      'usNVDA', // 英伟达
    ],
  },
  JP: {
    label: '日本',
    codes: [
      'fuNIY', // 日经225
    ],
  },
  Futures: {
    label: '期货',
    codes: [
      'fuGC', // COMEX黄金
      'usPAAS', // 泛美白银
      'usSLV', // 白银ETF-iShares
      'fuCL', // NYMEX原油
    ],
  },
}

/**
 * 从 marketGroups 动态生成所有需要轮询的代码列表。
 * 这样后端轮询列表总是与前端展示保持同步。
 */
export const ALL_INDEX_CODES = Object.values(marketGroups).flatMap(group => group.codes)

// 节假日配置 (Single Source of Truth)
// 未来可以从数据库或API动态获取
export const HOLIDAYS_CONFIG: [string, string][] = [
  // 2026 年休市日期区间 (包含起止日期)
  ['2026-01-01', '2026-01-03'], // 元旦
  ['2026-02-15', '2026-02-23'], // 春节
  ['2026-04-04', '2026-04-06'], // 清明节
  ['2026-05-01', '2026-05-05'], // 劳动节
  ['2026-06-19', '2026-06-21'], // 端午节
  ['2026-09-25', '2026-09-27'], // 中秋节
  ['2026-10-01', '2026-10-07'], // 国庆节
]

/** 把入参归一化为本地 Date；dayjs 字符串/Date/空值都可接受 */
function toDate(date?: Date | string): Date {
  if (!date)
    return new Date()
  return typeof date === 'string' ? parseISO(date) : date
}

/**
 * 检查指定日期是否为A股交易日
 * 规则:
 * 1. 非周末 (周一至周五)
 * 2. 不在法定节假日区间内
 */
export function isTradingDay(date?: Date | string): { isTrading: boolean, reason?: string } {
  const targetDate = startOfDay(toDate(date)) // 归一化到当天 00:00（与 dayjs isBetween 'day' 语义一致）
  const dayOfWeek = getDay(targetDate)

  // 检查是否为周末
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isTrading: false, reason: '周末休市' }
  }

  // 检查节假日（按天比较，包含起止当天）。节假日串 'YYYY-MM-DD' 直接按字典序比较，
  // 与先归一化为本地 00:00 再比较 Date 的效果一致，且不受时区影响。
  const targetStr = format(targetDate, 'yyyy-MM-dd')
  for (const [start, end] of HOLIDAYS_CONFIG) {
    if (targetStr >= start && targetStr <= end) {
      return { isTrading: false, reason: `节假日休市 (${start} ~ ${end})` }
    }
  }

  return { isTrading: true }
}

/**
 * 检查当前时间是否在A股交易时间内
 * 规则: 9:30 - 11:30 或 13:00 - 15:00
 * @param date - 要检查的时间 (默认为当前时间)
 * @returns boolean
 */
export function isTradingHours(date?: Date | string): boolean {
  const targetTime = toDate(date)
  const morningStart = setSeconds(setMinutes(setHours(targetTime, 9), 30), 0)
  const morningEnd = setSeconds(setMinutes(setHours(targetTime, 11), 30), 0)
  const afternoonStart = setSeconds(setMinutes(setHours(targetTime, 13), 0), 0)
  const afternoonEnd = setSeconds(setMinutes(setHours(targetTime, 15), 0), 0)

  // 闭区间 [start, end]
  const inRange = (t: Date, s: Date, e: Date) =>
    (isAfter(t, s) || isEqual(t, s)) && (isBefore(t, e) || isEqual(t, e))

  return inRange(targetTime, morningStart, morningEnd) || inRange(targetTime, afternoonStart, afternoonEnd)
}
