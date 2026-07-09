// shared/redemptionFee.ts
// 赎回费率解析的纯函数,前后端共享(Nuxt shared 目录)。
// 用于把抓取到的费率阶梯文本(如"大于等于7天，小于365天"/"1.50%")解析为可计算的数值。

/** 赎回费阶梯项(与 FundFees.redemptionFees 一致) */
export interface RedemptionFeeTier {
  holdingPeriod: string
  rate: string
}

/**
 * 从费率字符串中解析出数值。
 * @param rate 如 "1.50%" → 1.5、"0.00%" → 0
 * @returns 数值;无法解析时返回 null
 */
export function parseRateValue(rate: string): number | null {
  const m = rate.match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/**
 * 解析 holdingPeriod 字符串为数值区间 [lower, upper)。
 *
 * 支持的表达(来自基金费率抓取):
 * - "小于7天"        → [0, 7)      (开区间上限)
 * - "小于等于6天"     → [0, 7)      (闭区间上限,即 6+1)
 * - "大于等于7天"     → [7, +∞)
 * - "大于等于7天，小于365天" → [7, 365)
 * - "大于等于7天，小于等于29天" → [7, 30)
 *
 * @returns 区间对象;入参为空返回 null
 */
export function parsePeriodRange(period: string): { lower: number, upper: number } | null {
  if (!period)
    return null
  const lowerMatch = period.match(/大于等于\s*(\d+)\s*天/)
  const upperMatch = period.match(/小于(等于)?\s*(\d+)\s*天/)
  const lower = lowerMatch ? Number(lowerMatch[1]) : 0
  // "小于N天" 为开区间(上限 N),"小于等于N天" 为闭区间(上限 N+1)
  const upper = upperMatch ? Number(upperMatch[2]) + (upperMatch[1] ? 1 : 0) : Number.POSITIVE_INFINITY
  return { lower, upper }
}

/**
 * 按持有天数匹配赎回费率档位,返回该档费率数值。
 *
 * 遍历阶梯,找出持有天数落入的区间(即 [lower, upper)),
 * 返回该档费率数值。若无阶梯数据或未命中任何档位,返回 null(视为免赎回费)。
 *
 * @param tiers 赎回费阶梯(如 redemptionFees)
 * @param diffDays 实际持有天数
 * @returns 费率数值(如 1.5、0.5、0),或 null
 */
export function matchRateForHoldingDays(
  tiers: RedemptionFeeTier[] | null | undefined,
  diffDays: number,
): number | null {
  if (!tiers || tiers.length === 0)
    return null

  for (const t of tiers) {
    const range = parsePeriodRange(t.holdingPeriod)
    if (!range)
      continue
    if (diffDays >= range.lower && diffDays < range.upper)
      return parseRateValue(t.rate)
  }
  return null
}
