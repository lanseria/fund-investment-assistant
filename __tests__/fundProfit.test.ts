import type { SimulateTxRow } from '~~/server/utils/profitHistory'
import { describe, expect, it } from 'vitest'
import { summarizeFundProfit } from '~~/server/utils/profitHistory'

function tx(partial: Omit<SimulateTxRow, 'confirmedAmount' | 'confirmedShares'> & { confirmedAmount?: number, confirmedShares?: number }): SimulateTxRow {
  return {
    confirmedAmount: partial.confirmedAmount !== undefined ? String(partial.confirmedAmount) : null,
    confirmedShares: partial.confirmedShares !== undefined ? String(partial.confirmedShares) : null,
    ...partial,
  }
}

describe('summarizeFundProfit (单基金已落袋盈亏回测)', () => {
  it('买入后全部清仓:落袋盈亏 = 卖出金额 - 买入金额', () => {
    const result = summarizeFundProfit([
      tx({ fundCode: '000001', orderDate: '2026-01-05', type: 'buy', confirmedAmount: 1000, confirmedShares: 1000 }),
      tx({ fundCode: '000001', orderDate: '2026-02-10', type: 'sell', confirmedAmount: 1200, confirmedShares: 1000 }),
    ])
    const s = result.get('000001')!
    expect(s.realizedProfit).toBeCloseTo(200)
    expect(s.simulatedShares).toBe(0)
    expect(s.simulatedAvgCost).toBe(0)
    expect(s.firstTradeDate).toBe('2026-01-05')
    expect(s.lastTradeDate).toBe('2026-02-10')
  })

  it('部分卖出:剩余份额保持原成本价,落袋盈亏正确', () => {
    const result = summarizeFundProfit([
      tx({ fundCode: '000002', orderDate: '2026-01-06', type: 'buy', confirmedAmount: 1000, confirmedShares: 1000 }),
      tx({ fundCode: '000002', orderDate: '2026-03-02', type: 'sell', confirmedAmount: 600, confirmedShares: 500 }),
    ])
    const s = result.get('000002')!
    expect(s.realizedProfit).toBeCloseTo(100)
    expect(s.simulatedShares).toBe(500)
    expect(s.simulatedAvgCost).toBeCloseTo(1)
  })

  it('多次买入摊薄成本,卖出按摊薄成本计盈亏', () => {
    const result = summarizeFundProfit([
      tx({ fundCode: '000003', orderDate: '2026-01-07', type: 'buy', confirmedAmount: 1000, confirmedShares: 1000 }),
      tx({ fundCode: '000003', orderDate: '2026-01-20', type: 'buy', confirmedAmount: 600, confirmedShares: 500 }),
      tx({ fundCode: '000003', orderDate: '2026-02-20', type: 'sell', confirmedAmount: 650, confirmedShares: 500 }),
    ])
    const s = result.get('000003')!
    // 摊薄成本 = 1600 / 1500
    expect(s.simulatedAvgCost).toBeCloseTo(1600 / 1500, 6)
    // 卖出成本 = 500 × 1.0667 ≈ 533.33,落袋 ≈ 116.67
    expect(s.realizedProfit).toBeCloseTo(650 - 500 * (1600 / 1500), 4)
    expect(s.simulatedShares).toBe(1000)
  })

  it('卖出份额超过回测持仓(手工导入无买入记录):缺口按兜底成本价计', () => {
    const result = summarizeFundProfit(
      [
        tx({ fundCode: '008888', orderDate: '2026-04-01', type: 'sell', confirmedAmount: 1800, confirmedShares: 1000 }),
      ],
      { '008888': 1.5 },
    )
    const s = result.get('008888')!
    // 成本 = 缺口 1000 × 1.5 = 1500,落袋 = 300
    expect(s.realizedProfit).toBeCloseTo(300)
  })

  it('无兜底成本价时缺口按 0 成本计(不留错误持仓状态)', () => {
    const result = summarizeFundProfit([
      tx({ fundCode: '009999', orderDate: '2026-04-02', type: 'sell', confirmedAmount: 800, confirmedShares: 800 }),
    ])
    expect(result.get('009999')!.realizedProfit).toBeCloseTo(800)
  })

  it('基金转换按 转入=买入 / 转出=卖出 记账,多基金互不干扰', () => {
    const result = summarizeFundProfit([
      tx({ fundCode: '000010', orderDate: '2026-05-06', type: 'buy', confirmedAmount: 2000, confirmedShares: 2000 }),
      tx({ fundCode: '000010', orderDate: '2026-05-20', type: 'convert_out', confirmedAmount: 1100, confirmedShares: 1000 }),
      tx({ fundCode: '000011', orderDate: '2026-05-21', type: 'convert_in', confirmedAmount: 1100, confirmedShares: 1000 }),
    ])
    expect(result.get('000010')!.realizedProfit).toBeCloseTo(100)
    expect(result.get('000010')!.simulatedShares).toBe(1000)
    expect(result.get('000011')!.realizedProfit).toBe(0)
    expect(result.get('000011')!.simulatedShares).toBe(1000)
    expect(result.get('000011')!.firstTradeDate).toBe('2026-05-21')
  })

  it('空交易列表返回空 Map', () => {
    expect(summarizeFundProfit([]).size).toBe(0)
  })
})
