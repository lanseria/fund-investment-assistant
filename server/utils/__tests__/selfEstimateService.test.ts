import type { StockRealtimeQuote } from '../dataFetcher'
import type { FundStockHoldingRow } from '../stockHoldingService'
import { describe, expect, it } from 'vitest'
import { isGoldPriceFund } from '../../../shared/fund'
import { calcGoldEstimate, calcSelfEstimate, GOLD_PRICE_CODE } from '../selfEstimateService'
import { enrichStocksWithQuotes, extractStockHoldings, parseHoldingPct } from '../stockHoldingService'

function holding(stockCode: string, pct: number): FundStockHoldingRow {
  return { stockCode, stockName: `股票${stockCode}`, pct, reportDate: '2026-06-30' }
}

function quote(code: string, changePct: number | null): [string, StockRealtimeQuote] {
  return [code, { code, name: `股票${code}`, price: 10, changePct, date: '2026-09-18', time: '15:00:00' }]
}

describe('parseHoldingPct (powercloud 占比字符串解析)', () => {
  it('解析带百分号的字符串', () => {
    expect(parseHoldingPct('17.28%')).toBe(17.28)
    expect(parseHoldingPct(' 9.5% ')).toBe(9.5)
  })

  it('解析纯数字', () => {
    expect(parseHoldingPct(17.28)).toBe(17.28)
    expect(parseHoldingPct('0.5')).toBe(0.5)
  })

  it('非法/非正值返回 null', () => {
    expect(parseHoldingPct(null)).toBeNull()
    expect(parseHoldingPct(undefined)).toBeNull()
    expect(parseHoldingPct('')).toBeNull()
    expect(parseHoldingPct('%')).toBeNull()
    expect(parseHoldingPct('abc')).toBeNull()
    expect(parseHoldingPct('-1.2%')).toBeNull()
    expect(parseHoldingPct('0%')).toBeNull()
  })
})

describe('extractStockHoldings (重仓股列表提取)', () => {
  it('过滤掉代码非法、名称为空、占比无效的条目,保留港股 5 位代码', () => {
    const rows = extractStockHoldings([
      { code: '600519', name: '贵州茅台', pct: '17.28%' },
      { code: '00700', name: '腾讯控股', pct: '9%' }, // 港股 5 位代码,保留
      { code: 'AAPL', name: '苹果', pct: '5%' }, // 美股字母代码,过滤
      { code: '000858', name: '', pct: '8%' }, // 无名称,过滤
      { code: '000858', name: '五粮液', pct: 'abc' }, // 占比非法,过滤
    ] as any)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ stockCode: '600519', stockName: '贵州茅台', pct: 17.28, reportDate: '' })
    expect(rows[1]).toEqual({ stockCode: '00700', stockName: '腾讯控股', pct: 9, reportDate: '' })
  })

  it('非数组输入返回空数组', () => {
    expect(extractStockHoldings(null)).toEqual([])
    expect(extractStockHoldings(undefined)).toEqual([])
  })
})

describe('calcSelfEstimate (重仓股加权自算估值)', () => {
  const holdings = [holding('600519', 50), holding('000858', 30), holding('300750', 20)]

  it('全部有行情:按占比加权归一化', () => {
    const quotes = Object.fromEntries([
      quote('600519', -1), // 50 × -1 = -50
      quote('000858', 2), // 30 × 2 = 60
      quote('300750', 0), // 20 × 0 = 0
    ])
    // 加权涨跌幅 = (-50 + 60 + 0) / 100 = 0.1%
    // 净值 = 1.5 × (1 + 0.1/100) = 1.5015
    const result = calcSelfEstimate('1.5', holdings, quotes)
    expect(result).not.toBeNull()
    expect(result!.changePct).toBeCloseTo(0.1, 6)
    expect(result!.nav).toBe(1.5015)
    expect(result!.coverage).toBe(100)
  })

  it('部分股票缺行情:剔除权重后重新归一化', () => {
    const quotes = Object.fromEntries([
      quote('600519', -1), // 50 × -1 = -50
      quote('000858', 2), // 30 × 2 = 60
      // 300750 缺行情
    ])
    // 加权涨跌幅 = (-50 + 60) / 80 = 0.125%
    const result = calcSelfEstimate('1.5', holdings, quotes)
    expect(result).not.toBeNull()
    expect(result!.changePct).toBeCloseTo(0.125, 6)
    // 净值保留 4 位小数: 1.5 × (1 + 0.125/100) = 1.501875 → 1.5019
    expect(result!.nav).toBe(1.5019)
    // 覆盖率仍按全部持仓统计
    expect(result!.coverage).toBe(100)
  })

  it('changePct 为 null (停牌) 视为缺行情', () => {
    const quotes = Object.fromEntries([
      quote('600519', null),
      quote('000858', 1), // 30 × 1 = 30
      quote('300750', 3), // 20 × 3 = 60
    ])
    // 加权涨跌幅 = (30 + 60) / 50 = 1.8%
    const result = calcSelfEstimate('2', holdings, quotes)
    expect(result).not.toBeNull()
    expect(result!.changePct).toBeCloseTo(1.8, 6)
  })

  it('全部股票无行情返回 null', () => {
    const quotes = Object.fromEntries([quote('600519', null), quote('000858', null)])
    expect(calcSelfEstimate('1.5', holdings, quotes)).toBeNull()
  })

  it('行情里完全没有这些股票返回 null', () => {
    expect(calcSelfEstimate('1.5', holdings, {})).toBeNull()
  })

  it('空持仓返回 null', () => {
    const quotes = Object.fromEntries([quote('600519', 1)])
    expect(calcSelfEstimate('1.5', [], quotes)).toBeNull()
  })

  it('昨净非法返回 null', () => {
    const quotes = Object.fromEntries([quote('600519', 1)])
    expect(calcSelfEstimate('0', holdings, quotes)).toBeNull()
    expect(calcSelfEstimate('-1', holdings, quotes)).toBeNull()
  })

  it('覆盖率按持仓行合计(而非行情命中数)', () => {
    const rows = [holding('600519', 8.5), holding('000858', 6.2)]
    const result = calcSelfEstimate('1', rows, Object.fromEntries([quote('600519', 1), quote('000858', 1)]))
    expect(result!.coverage).toBe(14.7)
  })

  it('a 股与港股 5 位代码混合加权(如港股通基金)', () => {
    const rows = [holding('600519', 60), holding('00700', 40)]
    const quotes = Object.fromEntries([
      quote('600519', 1), // 60 × 1 = 60
      quote('00700', 2), // 40 × 2 = 80
    ])
    // 加权涨跌幅 = (60 + 80) / 100 = 1.4%
    // 净值 = 2 × (1 + 1.4/100) = 2.028
    const result = calcSelfEstimate('2', rows, quotes)
    expect(result).not.toBeNull()
    expect(result!.changePct).toBeCloseTo(1.4, 6)
    expect(result!.nav).toBe(2.028)
    expect(result!.coverage).toBe(100)
  })
})

describe('isGoldPriceFund (黄金类基金识别)', () => {
  it('黄金/上海金 ETF 联接类基金命中', () => {
    expect(isGoldPriceFund('前海开源黄金ETF联接C')).toBe(true) // 021740
    expect(isGoldPriceFund('华安黄金易ETF联接A')).toBe(true)
    expect(isGoldPriceFund('天弘上海金ETF联接C')).toBe(true)
  })

  it('普通股票/混合/债券基金不命中', () => {
    expect(isGoldPriceFund('中欧医疗健康混合A')).toBe(false)
    expect(isGoldPriceFund('易方达蓝筹精选混合')).toBe(false)
    expect(isGoldPriceFund('招商中证白酒指数A')).toBe(false)
  })
})

describe('calcGoldEstimate (金价自算估值)', () => {
  it('按金价涨跌幅套用昨净,coverage 固定 100', () => {
    // 2.1527 × (1 + (-0.6705)/100) = 2.1527 × 0.993295 = 2.138278... → 2.1383
    const result = calcGoldEstimate('2.1527', { changePct: -0.6705 })
    expect(result).not.toBeNull()
    expect(result!.changePct).toBeCloseTo(-0.6705, 6)
    expect(result!.nav).toBe(2.1383)
    expect(result!.coverage).toBe(100)
  })

  it('金价无涨跌幅(未开盘)返回 null', () => {
    expect(calcGoldEstimate('2.1527', { changePct: null })).toBeNull()
  })

  it('昨净非法返回 null', () => {
    expect(calcGoldEstimate('0', { changePct: 1 })).toBeNull()
    expect(calcGoldEstimate('-1', { changePct: 1 })).toBeNull()
  })

  it('与 GOLD_PRICE_CODE (AU9999) 对应', () => {
    expect(GOLD_PRICE_CODE).toBe('AU9999')
  })
})

describe('enrichStocksWithQuotes (持仓行补全行情快照)', () => {
  const rows = [holding('600519', 17.28), holding('000858', 9.5)]

  it('按股票代码匹配行情并补全四个行情字段', () => {
    const quotes = [
      { code: '600519', name: '贵州茅台', price: 1257.12, changePct: -0.78, date: '2026-09-18', time: '15:00:00' },
      { code: '000858', name: '五粮液', price: 70, changePct: 1.26, date: '2026-09-18', time: '15:00:02' },
    ]
    const result = enrichStocksWithQuotes(rows, quotes)
    expect(result[0]).toEqual({
      stockCode: '600519',
      stockName: '股票600519',
      pct: 17.28,
      price: 1257.12,
      changePct: -0.78,
      quoteDate: '2026-09-18',
      quoteTime: '15:00:00',
    })
  })

  it('行情列表中缺失的股票行情字段为 null,持仓字段保留', () => {
    const quotes = [{ code: '600519', name: '贵州茅台', price: 1257.12, changePct: -0.78, date: '2026-09-18', time: '15:00:00' }]
    const result = enrichStocksWithQuotes(rows, quotes)
    expect(result[1]).toEqual({
      stockCode: '000858',
      stockName: '股票000858',
      pct: 9.5,
      price: null,
      changePct: null,
      quoteDate: null,
      quoteTime: null,
    })
  })

  it('行情接口不可用 (null/undefined) 时全部行情字段为 null', () => {
    for (const quotes of [null, undefined]) {
      const result = enrichStocksWithQuotes(rows, quotes)
      expect(result).toHaveLength(2)
      for (const row of result) {
        expect(row.price).toBeNull()
        expect(row.changePct).toBeNull()
        expect(row.quoteDate).toBeNull()
        expect(row.quoteTime).toBeNull()
      }
      expect(result[0]!.pct).toBe(17.28)
    }
  })
})
