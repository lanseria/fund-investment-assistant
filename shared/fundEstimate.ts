// shared/fundEstimate.ts

/**
 * 盘中估值的纯函数工具(重仓股覆盖率门槛、天天基金 F10 重仓股解析、跟踪指数代码解析)。
 *
 * 单独放在 shared 下便于 vitest 直接覆盖:不依赖 Nuxt 运行时、不发起网络请求。
 * 网络层在 server/utils/eastmoneyF10.ts,业务编排在 server/utils/selfEstimateService.ts。
 */

/**
 * 重仓股自算的最低覆盖率(%):前十大合计占净值比例低于该值时不采信加权结果。
 *
 * 联接基金(投资 ETF 而非直接持股)的季报里常只剩几只打新残留,占比 0~2%,
 * 归一化后会把残余个股的涨跌幅放大成整只基金的涨跌幅(噪声)。此类基金改用
 * 跟踪指数涨跌幅估算(见 calcIndexEstimate),故这里直接判定自算不成立。
 */
export const MIN_COVERAGE_PCT = 30

/** 重仓股单条(与 fund_stock_holdings 表口径一致) */
export interface TopHoldingRow {
  /** 股票代码:A 股 6 位;港股 5 位(如 00700) */
  stockCode: string
  stockName: string
  /** 占净值比例 (%) */
  pct: number
}

/** F10 重仓股解析结果 */
export interface F10HoldingsParsed {
  /** 报告期 (yyyy-mm-dd);解析不出时为 null */
  reportDate: string | null
  /** 重仓股列表(已过滤非法代码/非正占比) */
  holdings: TopHoldingRow[]
}

/** 股票代码格式:A 股 6 位数字;港股 5 位数字 */
const STOCK_CODE_RE = /^\d{5,6}$/
/** 报告期格式 (yyyy-mm-dd) */
const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 解析 F10 重仓股接口(`FundArchivesDatas.aspx?type=jjcc`)的原始 JS 响应。
 *
 * 上游返回的是 JS 对象字面量而非 JSON:`var apidata={ content:"<div class='box'>…",arryear:[…]};`,
 * 一次带出多期(当年前几个季度),每期一个 `boxitem` 块。这里取报告期最新的一块。
 *
 * @returns 不是 apidata 脚本(限流返回 HTML/空响应)时为 null,调用方据此判定为抓取失败;
 *          是合法脚本但 content 为空时返回 `{ reportDate: null, holdings: [] }`,
 *          表示该基金确无股票持仓(纯债/货基/联接基金)
 */
export function parseF10HoldingsPayload(raw: string): F10HoldingsParsed | null {
  const marker = 'var apidata='
  const start = raw.indexOf(marker)
  if (start < 0)
    return null

  const blocks = raw.slice(start).split('boxitem').slice(1)
  if (blocks.length === 0)
    return { reportDate: null, holdings: [] }

  // 多期数据取报告期最新的一块;无合法报告期的块直接丢弃
  let picked: F10HoldingsParsed | null = null
  for (const block of blocks) {
    const reportDate = (block.match(/截止至：<font class='px12'>(\d{4}-\d{2}-\d{2})<\/font>/) ?? [])[1] ?? null
    if (!reportDate || !REPORT_DATE_RE.test(reportDate))
      continue
    if (picked && picked.reportDate! >= reportDate)
      continue
    picked = {
      reportDate,
      holdings: parseHoldingRows(block),
    }
  }

  return picked ?? { reportDate: null, holdings: [] }
}

/** 从单个报告期的表格 HTML 中提取重仓股行 */
function parseHoldingRows(block: string): TopHoldingRow[] {
  const rows: TopHoldingRow[] = []
  const seen = new Set<string>()
  // 按行切分,逐行匹配代码/名称/占比,避免依赖列顺序(A 股表头比港股多「最新价/涨跌幅」两列)
  for (const tr of block.split('<tr>').slice(1)) {
    const stockCode = (tr.match(/<td><a [^>]*>(\d{5,6})<\/a><\/td>/) ?? [])[1]
    const stockName = (tr.match(/<td class='tol'><a [^>]*>([^<]+)<\/a>/) ?? [])[1]?.trim()
    const pctRaw = (tr.match(/<td class='tor'>([\d.]+)%<\/td>/) ?? [])[1]
    const pct = pctRaw != null
      ? Number.parseFloat(pctRaw)
      : Number.NaN

    // A 股表头含「最新价/涨跌幅」,港股表头没有,代码单元格的锚点可能是 //quote.eastmoney.com 或空
    const code = stockCode ?? (tr.match(/<td>\s*<a href='[^']*'>(\d{5,6})<\/a>\s*<\/td>/) ?? [])[1]
    if (!code || !STOCK_CODE_RE.test(code) || !stockName || !Number.isFinite(pct) || pct <= 0)
      continue
    if (seen.has(code))
      continue
    seen.add(code)
    rows.push({ stockCode: code, stockName, pct })
  }
  return rows
}

/**
 * 把基金跟踪的指数代码转换为东方财富行情接口的 secid。
 *
 * 前缀按交易所/编制方区分(实测):399 开头为深市指数(0.)、000 开头为上证系列(1.)、
 * 931/950 开头的中证指数与 H 开头的港/中证指数为 2.
 *
 * @returns 无法识别的代码(如黄金 AU9999、港股 HSTECH 简写)返回 null,
 *          调用方回退到重仓股/金价路径
 */
export function resolveIndexSecid(indexCode: string): string | null {
  const code = indexCode.trim().toUpperCase()
  if (code.startsWith('399') && /^\d{6}$/.test(code))
    return `0.${code}`
  if (code.startsWith('000') && /^\d{6}$/.test(code))
    return `1.${code}`
  if (/^\d{6}$/.test(code) && (code.startsWith('9') || code.startsWith('93') || code.startsWith('95')))
    return `2.${code}`
  if (/^H\d{6}$/.test(code))
    return `2.${code}`
  return null
}
