import { describe, expect, it } from 'vitest'
import { anchorDayLabel, computeNextExecutionDate, frequencyLabel } from '~~/shared/dcaPlan'

// 2026 年节假日参考 (shared/market.ts HOLIDAYS_CONFIG):
// 中秋 09-25(五)~09-27(日), 国庆 10-01(四)~10-07(三) → 09-28(一)、10-08(四) 均为交易日
describe('computeNextExecutionDate (定投下次扣款日推算)', () => {
  it('weekly: 取严格晚于起算日的下一个锚点星期', () => {
    // 2026-09-22 为周二: 锚点周一 → 下周一 09-28 (恰逢中秋后首个交易日)
    expect(computeNextExecutionDate('2026-09-22', 'weekly', 1)).toBe('2026-09-28')
    // 起算日当天即锚点日时跳过本期,取下周
    expect(computeNextExecutionDate('2026-09-22', 'weekly', 2)).toBe('2026-09-29')
    // 2026-10-08 为周四 → 下一个周一 10-12
    expect(computeNextExecutionDate('2026-10-08', 'weekly', 1)).toBe('2026-10-12')
  })

  it('weekly: 锚点日撞上节假日顺延到下一交易日', () => {
    // 09-25(五) 起为中秋假期 → 顺延到 09-28(一)
    expect(computeNextExecutionDate('2026-09-23', 'weekly', 5)).toBe('2026-09-28')
  })

  it('monthly: 本月锚点日已过则取下月,顺延规则一致', () => {
    // 09-25(五) 为中秋 → 顺延 09-28(一)
    expect(computeNextExecutionDate('2026-09-22', 'monthly', 25)).toBe('2026-09-28')
    // 09-25 当天创建: 当期已过 → 10-25(日) 顺延 10-26(一)
    expect(computeNextExecutionDate('2026-09-25', 'monthly', 25)).toBe('2026-10-26')
    // 锚点 28 号、10-08(四) 起算: 10-28(三) 为交易日
    expect(computeNextExecutionDate('2026-10-08', 'monthly', 28)).toBe('2026-10-28')
  })

  it('biweekly: 起算日 +14 天,节假日顺延', () => {
    expect(computeNextExecutionDate('2026-09-01', 'biweekly')).toBe('2026-09-15')
    // 09-22 + 14 = 10-06 落在国庆假期 → 顺延 10-08(四)
    expect(computeNextExecutionDate('2026-09-22', 'biweekly')).toBe('2026-10-08')
  })

  it('daily: 起算日 +1 天,落在非交易日时顺延到下一交易日', () => {
    // 09-24(四) + 1 = 09-25(五) 为中秋假期起点 → 顺延 09-28(一)
    expect(computeNextExecutionDate('2026-09-24', 'daily')).toBe('2026-09-28')
    // 周五执行后 +1 天是周六 → 顺延下周一
    expect(computeNextExecutionDate('2026-10-09', 'daily')).toBe('2026-10-12')
    // 周四次日周五为交易日,直接命中
    expect(computeNextExecutionDate('2026-10-08', 'daily')).toBe('2026-10-09')
    // anchorDay 对 daily 无意义,传入也被忽略
    expect(computeNextExecutionDate('2026-10-08', 'daily', 25)).toBe('2026-10-09')
  })

  it('支持 Date 入参,anchorDay 越界时收敛到合法区间', () => {
    expect(computeNextExecutionDate(new Date('2026-09-22T12:00:00'), 'weekly', 3)).toBe('2026-09-23')
    // monthly 锚点 30 越界 → 收敛到 28
    expect(computeNextExecutionDate('2026-09-22', 'monthly', 30)).toBe('2026-09-28')
  })
})

describe('定投频率/锚点展示文案', () => {
  it('frequencyLabel', () => {
    expect(frequencyLabel('daily')).toBe('每天')
    expect(frequencyLabel('weekly')).toBe('每周')
    expect(frequencyLabel('biweekly')).toBe('每两周')
    expect(frequencyLabel('monthly')).toBe('每月')
  })

  it('anchorDayLabel', () => {
    expect(anchorDayLabel('daily', null)).toBe('')
    expect(anchorDayLabel('weekly', 3)).toBe('每周三')
    expect(anchorDayLabel('monthly', 25)).toBe('每月25日')
    expect(anchorDayLabel('biweekly', null)).toBe('')
    expect(anchorDayLabel('monthly', null)).toBe('')
  })
})
