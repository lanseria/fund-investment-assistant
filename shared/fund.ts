// shared/fund.ts

/**
 * 黄金类基金识别:名称含「黄金/上海金」的场外基金(黄金 ETF 联接、
 * 上海金 ETF 联接等被动跟踪国内金价的品种)。
 *
 * 供自算估值(服务端)与详情页提示(前端)共用:此类基金季报无股票重仓,
 * 自算按国内金价(SGE Au99.99)涨跌幅套用昨净。注意黄金产业股票类基金
 * (名称也含「黄金」)有真实重仓持仓,会优先走重仓股加权路径,不会落到
 * 金价估算。
 */
export const GOLD_FUND_NAME_RE = /黄金|上海金/

export function isGoldPriceFund(name: string): boolean {
  return GOLD_FUND_NAME_RE.test(name)
}
