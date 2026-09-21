// server/utils/__tests__/market.test.ts
import { describe, expect, it } from 'vitest'
import { isQuoteRefreshHours } from '~~/shared/market'

describe('isQuoteRefreshHours (自算估值得刷新时段 9:30-16:30)', () => {
  it('交易时段内返回 true', () => {
    expect(isQuoteRefreshHours('2026-09-21 09:30:00')).toBe(true)
    expect(isQuoteRefreshHours('2026-09-21 11:30:00')).toBe(true)
    expect(isQuoteRefreshHours('2026-09-21 14:59:59')).toBe(true)
  })

  it('a 股收盘后到 16:30 仍返回 true (港股交易至 16:00,收盘价陆续落地)', () => {
    expect(isQuoteRefreshHours('2026-09-21 15:00:01')).toBe(true)
    expect(isQuoteRefreshHours('2026-09-21 15:59:00')).toBe(true)
    expect(isQuoteRefreshHours('2026-09-21 16:30:00')).toBe(true)
  })

  it('16:30 后返回 false', () => {
    expect(isQuoteRefreshHours('2026-09-21 16:30:01')).toBe(false)
    expect(isQuoteRefreshHours('2026-09-21 23:00:00')).toBe(false)
  })

  it('9:30 前返回 false', () => {
    expect(isQuoteRefreshHours('2026-09-21 09:29:59')).toBe(false)
    expect(isQuoteRefreshHours('2026-09-21 08:00:00')).toBe(false)
  })
})
