/**
 * 基金盘中实时估值接口(`/api/fund/realtime/{code}`)的前端类型定义。
 *
 * 数据源:powercloud 聚合接口,已封装「东财实时估算 + 历史净值回退 + QDII 处理」。
 * 占位符(`-` / `---` / 空)在服务端已统一转为 null。
 */

/** 盘中分时数据点 */
export interface IntradayPoint {
  /** 时间(通常为 HH:mm) */
  time: string
  /** 当时刻估算净值 */
  value: number
  /** 数据源可能附带的其他字段 */
  [key: string]: unknown
}

/** 数据来源标识 */
export type QuoteSource = 'realtime' | 'history_fallback' | null

/**
 * 重仓股持仓明细(来自基金定期报告,价格行情为最新交易日快照)。
 */
export interface FundHoldingStock {
  /** 股票代码(如 600519) */
  code: string
  /** 股票名称 */
  name: string
  /** 占基金净值比例(带 % 的字符串,如 "17.28%") */
  pct: string
  /** 最新价 */
  price: string | null
  /** 当日涨跌幅(%数值字符串,如 "-4.23") */
  change_pct: string | null
  /** 行情日期(yyyy-mm-dd,停牌股可能落后于其他股票) */
  quote_date: string | null
  /** 行情时间(HH:mm:ss,与 quote_date 组合即行情更新时间) */
  quote_time: string | null
  /** 数据源可能附带的其他字段 */
  [key: string]: unknown
}

/** 基金实时估值完整响应 */
export interface FundRealtimeDetail {
  /** 基金代码 */
  code: string
  /** 基金名称 */
  name: string
  /** 估算单位净值(4 位小数字符串,来自 gs原值) */
  estimateNav: string | null
  /** 估算涨跌幅(%),如 -1.85 表示 -1.85% */
  estimateGrowthRate: number | null
  /** 估值日期(yyyy-mm-dd) */
  estimateDate: string
  /** 已确认官方净值(盘前/QDII 为 null) */
  publishedNav: string | null
  /** 已确认官方涨跌幅(%) */
  publishedGrowthRate: number | null
  /** 上一交易日单位净值(来自 dwjz) */
  yesterdayNav: string | null
  /** 上一交易日日期 */
  yesterdayDate: string
  /** 数据来源标识:realtime=盘中实时估算,history_fallback=非交易时段/QDII 回退到最近净值 */
  quoteSource: QuoteSource
  /** 状态说明(如「QDII暂无盘中估值,展示最近净值」) */
  message: string
  /** 盘中分时数据,非交易时段为空数组 */
  intraday: IntradayPoint[]
  /** 重仓股持仓报告期(yyyy-mm-dd,如 2026-06-30) */
  holdingsDate: string | null
  /** 重仓股持仓明细(按占净值比降序);无股票仓位的基金(债券/货币等)为 null 或空数组 */
  holdings: FundHoldingStock[] | null
}
