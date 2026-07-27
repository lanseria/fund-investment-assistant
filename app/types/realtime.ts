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
}
