import { describe, expect, it } from 'vitest'
import {
  alignDailyToDates,
  alignToTradingDay,
  buildDailyPenetrationSeries,
  buildPenetrationSeries,
  computePearsonCorrelation,
  computeRatio,
  daysBetween,
  deriveFloatCap,
  formatQuarterLabel,
  isQuarterEndDate,
  parseCsindexPerfPayload,
  parseEastmoneyIndexQuote,
  parseEastmoneyKlinePayload,
  parseFundScalePayload,
  pickTopFunds,
} from '../shared/hs300Penetration'

/** 构造天天基金 F10 规模变动接口的原始 JS 脚本响应 */
function buildGmbdPayload(): string {
  return 'var gmbd_apidata={ content:"<table class=\'w782 comm gmbd\'><thead><tr><th>日期</th></tr></thead></table>",'
    + 'summary:"截至2024-09-30，期末净资产100.00亿元",'
    + '"data":[{ "_id" : "5103002024-09-30", "FSRQ" : "2024-09-30", "NETNAV" : 10000000000.0, "SHORTNAME" : "[测试]沪深300ETF华泰柏瑞" },'
    + '{ "_id" : "5103002024-09-30", "FSRQ" : "2024-09-30", "NETNAV" : 999.0 },'
    + '{ "_id" : "5103002024-06-30", "FSRQ" : "2024-06-30", "NETNAV" : "8000000000" },'
    + '{ "_id" : "5103002024-05-10", "FSRQ" : "2024-05-10", "NETNAV" : 1234.0 },'
    + '{ "_id" : "5103002023-12-31", "FSRQ" : "2023-12-31", "NETNAV" : "" },'
    + '{ "_id" : "5103002023-06-30", "FSRQ" : "2023-06-30", "NETNAV" : -1 }]};'
}

describe('isQuarterEndDate / formatQuarterLabel', () => {
  it('只把自然季末识别为报告期', () => {
    expect(isQuarterEndDate('2024-03-31')).toBe(true)
    expect(isQuarterEndDate('2024-06-30')).toBe(true)
    expect(isQuarterEndDate('2026-09-30')).toBe(true)
    expect(isQuarterEndDate('2025-12-31')).toBe(true)
    expect(isQuarterEndDate('2024-05-10')).toBe(false)
    expect(isQuarterEndDate('2024-06-29')).toBe(false)
    expect(isQuarterEndDate('bad')).toBe(false)
  })

  it('把报告期格式化为季度标签', () => {
    expect(formatQuarterLabel('2026-09-30')).toBe('2026Q3')
    expect(formatQuarterLabel('2025-12-31')).toBe('2025Q4')
    expect(formatQuarterLabel('2024-03-31')).toBe('2024Q1')
    expect(formatQuarterLabel('2024-06-30')).toBe('2024Q2')
    expect(formatQuarterLabel('n/a')).toBe('n/a')
  })
})

describe('parseFundScalePayload', () => {
  it('只保留季报净资产记录，过滤日度/空值/负值，并对同一季末去重', () => {
    const parsed = parseFundScalePayload(buildGmbdPayload())
    expect(parsed.name).toBe('[测试]沪深300ETF华泰柏瑞')
    expect(parsed.records).toEqual([
      { date: '2024-06-30', netAssets: 8000000000 },
      { date: '2024-09-30', netAssets: 10000000000 },
    ])
  })

  it('响应格式异常时返回空结果而不是抛错', () => {
    expect(parseFundScalePayload('not a script')).toEqual({ name: null, records: [] })
    expect(parseFundScalePayload('var gmbd_apidata={ "data":[{ broken ] }')).toEqual({ name: null, records: [] })
  })
})

describe('parseCsindexPerfPayload', () => {
  it('归一化日期并按升序返回，跳过非法行', () => {
    const days = parseCsindexPerfPayload({
      code: '200',
      data: [
        { tradeDate: '20240630', close: 3100 },
        { tradeDate: '2024-06-28', close: 3099.5 },
        { tradeDate: '20240330', close: 'abc' },
        { tradeDate: 'bad', close: 1 },
        null,
      ],
    })
    expect(days).toEqual([
      { date: '2024-06-28', close: 3099.5 },
      { date: '2024-06-30', close: 3100 },
    ])
  })

  it('非对象/缺 data 时返回空数组', () => {
    expect(parseCsindexPerfPayload(null)).toEqual([])
    expect(parseCsindexPerfPayload({ data: 'x' })).toEqual([])
  })
})

describe('parseEastmoneyIndexQuote', () => {
  it('按 f59 小数位还原点位，并取 f117 流通市值', () => {
    const quote = parseEastmoneyIndexQuote({
      data: { f43: 404955, f59: 2, f117: 48415042212523.04 },
    })
    expect(quote).not.toBeNull()
    expect(quote!.indexClose).toBeCloseTo(4049.55, 2)
    expect(quote!.floatCap).toBeCloseTo(48415042212523.04, 0)
  })

  it('点位或流通市值缺失时返回 null', () => {
    expect(parseEastmoneyIndexQuote(null)).toBeNull()
    expect(parseEastmoneyIndexQuote({
      data: { f43: 404955, f59: 2, f117: 0 },
    })).toBeNull()
    expect(parseEastmoneyIndexQuote({
      data: { f43: 0, f59: 2, f117: 1 },
    })).toBeNull()
  })
})

describe('pickTopFunds', () => {
  it('按最新规模降序取前 N，并过滤无规模候选', () => {
    const picked = pickTopFunds([
      { code: 'A', name: 'A', latestNetAssets: 100 },
      { code: 'B', name: 'B', latestNetAssets: 300 },
      { code: 'C', name: 'C', latestNetAssets: 0 },
      { code: 'D', name: 'D', latestNetAssets: 200 },
    ], 2)
    expect(picked.map(item => item.code)).toEqual(['B', 'D'])
  })
})

describe('alignToTradingDay / deriveFloatCap / computeRatio', () => {
  const tradingDays = [
    { date: '2024-03-29', close: 3000 },
    { date: '2024-06-28', close: 3100 },
    { date: '2024-09-30', close: 3200 },
    { date: '2024-12-31', close: 3300 },
  ]
  const anchor = { date: '2026-10-27', indexClose: 4000, floatCap: 4e13 }

  it('季末为非交易日时对齐到最近的前一个交易日', () => {
    expect(alignToTradingDay('2024-03-31', tradingDays)?.date).toBe('2024-03-29')
    expect(alignToTradingDay('2024-09-30', tradingDays)?.date).toBe('2024-09-30')
    expect(alignToTradingDay('2024-03-28', tradingDays)).toBeNull()
    expect(alignToTradingDay('2027-01-01', tradingDays)?.date).toBe('2024-12-31')
  })

  it('按锚点比例等比还原流通市值', () => {
    expect(deriveFloatCap(3000, anchor)).toBeCloseTo(3e13, 0)
    expect(deriveFloatCap(0, anchor)).toBe(0)
  })

  it('比例计算对非法分母做兜底', () => {
    expect(computeRatio(1e10, 4e13)).toBeCloseTo(0.025, 10)
    expect(computeRatio(1e10, 0)).toBe(0)
  })

  it('计算两个日期相差的自然日天数', () => {
    expect(daysBetween('2024-03-29', '2024-03-31')).toBe(2)
    expect(daysBetween('2024-03-31', '2024-06-30')).toBe(91)
    expect(daysBetween('bad', '2024-06-30')).toBeNaN()
  })
})

describe('buildPenetrationSeries', () => {
  const anchor = { date: '2026-10-27', indexClose: 4000, floatCap: 4e13 }
  const tradingDays = [
    { date: '2024-03-29', close: 3000 },
    { date: '2024-06-28', close: 3100 },
    { date: '2024-09-30', close: 3200 },
    { date: '2024-12-31', close: 3300 },
  ]
  const funds = [
    { code: '000001', name: '基金A', latestNetAssets: 1.2e10 },
    { code: '000002', name: '基金B', latestNetAssets: 6e9 },
  ]
  const fundScales = {
    '000001': [
      { date: '2024-03-31', netAssets: 1e10 },
      { date: '2024-09-30', netAssets: 1.2e10 },
    ],
    '000002': [
      { date: '2024-06-30', netAssets: 5e9 },
      { date: '2024-12-31', netAssets: 6e9 },
    ],
  }

  it('按季末组装合计规模、流通市值与占比', () => {
    const series = buildPenetrationSeries({
      funds,
      fundScales,
      tradingDays,
      anchor,
    })
    expect(series).toHaveLength(4)
    expect(series.map(point => point.date)).toEqual([
      '2024-03-31',
      '2024-06-30',
      '2024-09-30',
      '2024-12-31',
    ])

    // 2024-03-31 为周日，对齐到 03-29；基金B 尚未成立记 0
    expect(series[0]!.tradeDate).toBe('2024-03-29')
    expect(series[0]!.fundNetAssets).toEqual([1e10, 0])
    expect(series[0]!.totalNetAssets).toBe(1e10)
    expect(series[0]!.floatCap).toBeCloseTo(3e13, 0)
    expect(series[0]!.ratio).toBeCloseTo(0.0333333, 5)

    // 基金A 缺 06-30 一期，沿用上一期 100 亿
    expect(series[1]!.fundNetAssets).toEqual([1e10, 5e9])
    expect(series[1]!.ratio).toBeCloseTo(0.0483871, 5)

    expect(series[2]!.fundNetAssets).toEqual([1.2e10, 5e9])
    expect(series[2]!.ratio).toBeCloseTo(0.053125, 6)

    // 基金A 最新一期仍为 09-30，续用该值
    expect(series[3]!.fundNetAssets).toEqual([1.2e10, 6e9])
    expect(series[3]!.ratio).toBeCloseTo(0.0545455, 5)
  })

  it('行情不足以对齐任何报告期时返回空序列', () => {
    const series = buildPenetrationSeries({
      funds,
      fundScales,
      tradingDays: [
        { date: '2023-01-03', close: 2000 },
      ],
      anchor,
    })
    expect(series).toEqual([])
  })
})

describe('parseEastmoneyKlinePayload', () => {
  it('解析 "date,close" 行、去重并按日期升序，跳过非法行', () => {
    const prices = parseEastmoneyKlinePayload({
      data: {
        klines: [
          '2024-06-27,3.100',
          '2024-06-28,3.120',
          '2024-06-28,3.130',
          'bad,1.0',
          '2024-06-30,abc',
          '2024-07-01,0',
        ],
      },
    })
    expect(prices).toEqual([
      { date: '2024-06-27', close: 3.1 },
      { date: '2024-06-28', close: 3.13 },
    ])
  })

  it('缺 data/klines 时返回空数组', () => {
    expect(parseEastmoneyKlinePayload(null)).toEqual([])
    expect(parseEastmoneyKlinePayload({ data: {} })).toEqual([])
  })
})

describe('buildDailyPenetrationSeries', () => {
  const anchor = { date: '2026-10-27', indexClose: 4000, floatCap: 4e13 } // 每 100 点对应 1e10 元
  const funds = [
    { code: '000001', name: '基金A', latestNetAssets: 1e10 },
    { code: '000002', name: '基金B', latestNetAssets: 5e9 },
  ]
  const fundScales = {
    '000001': [
      { date: '2024-03-31', netAssets: 1e10 },
    ],
    '000002': [
      { date: '2024-06-30', netAssets: 5e9 },
    ],
  }
  const fundPrices = {
    '000001': [
      { date: '2024-03-28', close: 3 },
      { date: '2024-03-29', close: 3.1 },
      { date: '2024-06-28', close: 3.5 },
      { date: '2024-07-01', close: 3.6 },
    ],
    '000002': [
      { date: '2024-06-27', close: 1 },
      { date: '2024-06-28', close: 1.1 },
      { date: '2024-07-01', close: 1.2 },
    ],
  }
  const tradingDays = [
    { date: '2024-03-28', close: 3000 },
    { date: '2024-03-29', close: 3100 },
    { date: '2024-06-28', close: 3200 },
    { date: '2024-07-01', close: 3300 },
  ]

  it('份额取最近一期季报、规模随日收盘价折算，季报切换日产生台阶', () => {
    const daily = buildDailyPenetrationSeries({
      funds,
      fundScales,
      fundPrices,
      tradingDays,
      anchor,
    })

    // 03-28/03-29 时尚未有已披露季报（03-31 未到），全部跳过
    expect(daily.dates).toEqual(['2024-06-28', '2024-07-01'])

    // 06-28：只有基金A（03-31 季报，期初收盘 3.10），规模 = 100亿 × 3.50/3.10
    expect(daily.totalNetAssets[0]).toBe(Math.round(1e10 * 3.5 / 3.1))
    expect(daily.floatCap[0]).toBe(3.2e13)
    expect(daily.ratio[0]).toBeCloseTo((1e10 * 3.5 / 3.1) / 3.2e13 * 100, 6)

    // 07-01：基金A 100亿 × 3.6/3.1；基金B 季报（06-30）生效，50亿 × 1.2/1.1
    const total = 1e10 * 3.6 / 3.1 + 5e9 * 1.2 / 1.1
    expect(daily.totalNetAssets[1]).toBe(Math.round(total))
    expect(daily.indexClose[1]).toBe(3300)
    expect(daily.ratio[1]).toBeCloseTo(total / 3.3e13 * 100, 6)
  })

  it('某只基金缺日行情时只统计其余基金', () => {
    const daily = buildDailyPenetrationSeries({
      funds,
      fundScales,
      fundPrices: { '000001': fundPrices['000001'] },
      tradingDays,
      anchor,
    })
    expect(daily.dates).toEqual(['2024-06-28', '2024-07-01'])
    expect(daily.totalNetAssets[1]).toBe(Math.round(1e10 * 3.6 / 3.1))
  })

  it('所有基金都无行情时返回空序列', () => {
    const daily = buildDailyPenetrationSeries({
      funds,
      fundScales,
      fundPrices: {},
      tradingDays,
      anchor,
    })
    expect(daily.dates).toEqual([])
    expect(daily.ratio).toEqual([])
  })
})

describe('alignDailyToDates / computePearsonCorrelation', () => {
  const daily = {
    dates: ['2024-06-27', '2024-06-28', '2024-07-01'],
    totalNetAssets: [1e10, 2e10, 3e10],
    floatCap: [1e13, 2e13, 3e13],
    ratio: [0.1, 0.2, 0.3],
    indexClose: [3000, 3100, 3200],
  }

  it('把占比序列对齐到目标日期，取不晚于目标日的最近点', () => {
    const aligned = alignDailyToDates(
      [
        '2024-06-26',
        '2024-06-27',
        '2024-06-29',
        '2024-07-05',
      ],
      daily,
    )
    expect(aligned.map(point => point?.date ?? null)).toEqual([
      null,
      '2024-06-27',
      '2024-06-28',
      '2024-07-01',
    ])
    expect(aligned[1]!.ratio).toBe(0.1)
    expect(aligned[3]!.indexClose).toBe(3200)
  })

  it('计算皮尔逊相关系数并在数据不足/无波动时返回 null', () => {
    expect(computePearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10)
    expect(computePearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10)
    expect(computePearsonCorrelation([1, 2], [1, 2])).toBeNull()
    expect(computePearsonCorrelation([1, 1, 1], [1, 2, 3])).toBeNull()
  })
})
