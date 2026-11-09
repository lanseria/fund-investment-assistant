import { describe, expect, it } from 'vitest'
import { parseIndexKlinePayload } from '../server/utils/fundEstimateSource'
import { MIN_COVERAGE_PCT, parseF10HoldingsPayload, resolveIndexSecid } from '../shared/fundEstimate'

/**
 * 构造 F10 重仓股接口的原始 JS 脚本响应(取自真实上游响应的结构):
 * `var apidata={ content:"<div class='box'><div class='boxitem w790'>…",arryear:[…],curyear:2026};`
 */
function buildF10Payload(blocks: string[]): string {
  return `var apidata={ content:"<div class='box'>${blocks.join('')}</div>",arryear:[2026,2025],curyear:2026};`
}

/** A 股块:表头含「最新价/涨跌幅」两列,行内占比为第 3 个 tor 单元格 */
function buildAshareBlock(reportDate: string, title: string, rows: [string, string, string][]): string {
  const body = rows.map(([code, name, pct], i) => {
    return `<tr><td>${i + 1}</td><td><a href='//quote.eastmoney.com/unify/r/1.${code}'>${code}</a></td>`
      + `<td class='tol'><a href='//quote.eastmoney.com/unify/r/1.${code}'>${name}</a></td>`
      + `<td class='tor'><span data-id='dq${code}'></span></td>`
      + `<td class='tor'><span data-id='zd${code}'></span></td>`
      + `<td class='xglj'><a href='ccbdxq_012544_${code}.html' class='red'>变动详情</a></td>`
      + `<td class='tor'>${pct}%</td><td class='tor'>30.25</td><td class='tor'>2,520.34</td></tr>`
  }).join('')
  return `<div class='boxitem w790'><h4 class='t'><label class='left'><a title='${title}'>${title}</a></label>`
    + `<label class='right lab2 xq505'>&nbsp;&nbsp;&nbsp;&nbsp;来源：天天基金&nbsp;&nbsp;&nbsp;&nbsp;截止至：<font class='px12'>${reportDate}</font></label></h4>`
    + `<table class='w782 comm tzxq'><thead><tr><th class='first'>序号</th><th>股票代码</th><th>股票名称</th>`
    + `<th>最新价</th><th>涨跌幅</th><th class='xglj'>相关资讯</th><th>占净值<br />比例</th></tr></thead>`
    + `<tbody>${body}</tbody></table></div>`
}

/** 港股块:表头无「最新价/涨跌幅」,代码为 5 位 */
function buildHkShareBlock(reportDate: string, title: string, rows: [string, string, string][]): string {
  const body = rows.map(([code, name, pct], i) => {
    return `<tr><td>${i + 1}</td><td><a href='//quote.eastmoney.com/unify/r/116.${code}'>${code}</a></td>`
      + `<td class='tol'><a href='//quote.eastmoney.com/unify/r/116.${code}'>${name}</a></td>`
      + `<td class='xglj'><a href='ccbdxq_011452_${code}.html' class='red'>变动详情</a></td>`
      + `<td class='tor'>${pct}%</td><td class='tor'>859.55</td><td class='tor'>124,033.11</td></tr>`
  }).join('')
  return `<div class='boxitem w790'><h4 class='t'><label class='left'><a title='${title}'>${title}</a></label>`
    + `<label class='right lab2 xq505'>&nbsp;&nbsp;&nbsp;&nbsp;来源：天天基金&nbsp;&nbsp;&nbsp;&nbsp;截止至：<font class='px12'>${reportDate}</font></label></h4>`
    + `<table class='w782 comm tzxq'><thead><tr><th class='first'>序号</th><th>股票代码</th><th>股票名称</th>`
    + `<th class='xglj'>相关资讯</th><th>占净值<br />比例</th></tr></thead><tbody>${body}</tbody></table></div>`
}

describe('parseF10HoldingsPayload', () => {
  it('解析 A 股重仓股,取最新报告期', () => {
    const raw = buildF10Payload([
      buildAshareBlock('2026-09-30', '嘉实中证新能源汽车指数C', [
        ['002594', '比亚迪', '10.84'],
        ['300750', '宁德时代', '8.79'],
      ]),
      buildAshareBlock('2026-06-30', '嘉实中证新能源汽车指数C', [
        ['300750', '宁德时代', '9.02'],
      ]),
    ])

    const parsed = parseF10HoldingsPayload(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.reportDate).toBe('2026-09-30')
    expect(parsed!.holdings).toEqual([
      { stockCode: '002594', stockName: '比亚迪', pct: 10.84 },
      { stockCode: '300750', stockName: '宁德时代', pct: 8.79 },
    ])
  })

  it('解析港股 5 位代码(表头列数与 A 股不同)', () => {
    const raw = buildF10Payload([
      buildHkShareBlock('2026-09-30', '华泰柏瑞质量成长C', [
        ['06869', '长飞光纤光缆', '8.56'],
      ]),
    ])

    const parsed = parseF10HoldingsPayload(raw)!
    expect(parsed.reportDate).toBe('2026-09-30')
    expect(parsed.holdings).toEqual([
      { stockCode: '06869', stockName: '长飞光纤光缆', pct: 8.56 },
    ])
  })

  it('多期数据乱序时仍取报告期最新的一块', () => {
    const raw = buildF10Payload([
      buildAshareBlock('2026-03-31', 'X', [
        ['002594', '比亚迪', '10.04'],
      ]),
      buildAshareBlock('2026-09-30', 'X', [
        ['300750', '宁德时代', '8.79'],
      ]),
      buildAshareBlock('2026-06-30', 'X', [
        ['300124', '汇川技术', '6.04'],
      ]),
    ])

    expect(parseF10HoldingsPayload(raw)!.reportDate).toBe('2026-09-30')
  })

  it('过滤非法代码、非正占比与重复代码', () => {
    const raw = buildF10Payload([
      buildAshareBlock('2026-09-30', 'X', [
        ['002594', '比亚迪', '10.84'],
        ['002594', '比亚迪', '10.84'], // 重复
        ['AAPL', '苹果', '5.00'], // 美股字母代码
        ['300750', '宁德时代', '0.00'], // 占比为 0
      ]),
    ])

    expect(parseF10HoldingsPayload(raw)!.holdings).toEqual([
      { stockCode: '002594', stockName: '比亚迪', pct: 10.84 },
    ])
  })

  it('content 为空(纯债/联接基金无股票持仓)时返回空列表而非 null', () => {
    const raw = 'var apidata={ content:"",arryear:[],curyear:2026};'
    expect(parseF10HoldingsPayload(raw)).toEqual({ reportDate: null, holdings: [] })
  })

  it('响应不是 apidata 脚本(上游限流返回 HTML/空串)时返回 null', () => {
    expect(parseF10HoldingsPayload('')).toBeNull()
    expect(parseF10HoldingsPayload('<!DOCTYPE html><html><body>404</body></html>')).toBeNull()
  })
})

describe('resolveIndexSecid', () => {
  it('按交易所前缀映射 secid', () => {
    expect(resolveIndexSecid('399976')).toBe('0.399976') // 深市:中证新能车(深交所行情代码)
    expect(resolveIndexSecid('000685')).toBe('1.000685') // 上证:科创芯片
    expect(resolveIndexSecid('931719')).toBe('2.931719') // 中证:电池主题
    expect(resolveIndexSecid('950125')).toBe('2.950125') // 中证:科创半导体材料设备
  })

  it('无法识别的代码返回 null(黄金/港股简称等)', () => {
    expect(resolveIndexSecid('AU9999')).toBeNull()
    expect(resolveIndexSecid('HSTECH')).toBeNull()
    expect(resolveIndexSecid('')).toBeNull()
    expect(resolveIndexSecid('--')).toBeNull()
  })
})

describe('parseIndexKlinePayload (指数日K涨跌幅解析)', () => {
  /** 真实 push2his 响应结构:fields2=f51,f53,f59 → 日期,收盘点位,涨跌幅% */
  const payload = {
    rc: 0,
    data: {
      code: '931719',
      name: 'CS电池',
      klines: ['2026-11-06,3030.23,-2.78', '2026-11-09,2972.51,-1.90'],
    },
  }

  it('取最后一行的涨跌幅(第 3 列),而不是指数点位(第 2 列)', () => {
    const quote = parseIndexKlinePayload(payload)!
    expect(quote.code).toBe('931719')
    expect(quote.name).toBe('CS电池')
    // 回归:曾把 2972.51 当成涨跌幅写入库,导致估算涨跌 2973%
    expect(quote.changePct).toBe(-1.9)
  })

  it('缺涨跌幅列(第 3 列)时拒绝,不会把点位当涨跌幅', () => {
    const misaligned = {
      data: {
        code: '931719',
        name: 'CS电池',
        klines: ['2026-11-09,2972.51'],
      },
    }
    expect(parseIndexKlinePayload(misaligned)).toBeNull()
  })

  it('涨跌幅超出 ±20% 视为脏数据拒绝采信', () => {
    const absurd = {
      data: {
        code: '931719',
        name: 'CS电池',
        klines: ['2026-11-09,2972.51,2973.11'],
      },
    }
    expect(parseIndexKlinePayload(absurd)).toBeNull()
  })

  it('无 klines / 无 data 时返回 null', () => {
    expect(parseIndexKlinePayload(null)).toBeNull()
    expect(parseIndexKlinePayload({ data: null })).toBeNull()
    expect(parseIndexKlinePayload({
      data: { code: '931719', klines: [] },
    })).toBeNull()
    expect(parseIndexKlinePayload({
      data: {
        klines: ['2026-11-09,1,1'],
      },
    })).toBeNull()
  })
})

describe('mIN_COVERAGE_PCT', () => {
  it('门槛足以排除联接基金的残余个股(实测 0.00%~1.87%)', () => {
    for (const residual of [0, 0.43, 1.87])
      expect(residual).toBeLessThan(MIN_COVERAGE_PCT)
  })

  it('门槛不误杀正常主动基金的头部持仓(实测 48.94%~77.44%)', () => {
    for (const coverage of [48.94, 62.27, 65.82, 76.69, 77.44])
      expect(coverage).toBeGreaterThanOrEqual(MIN_COVERAGE_PCT)
  })
})
