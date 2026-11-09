/**
 * 当日盘中估值点：估值日期晚于历史净值最后日期时，
 * 由「基础走势」图以虚线从最后净值点延伸到该估值点
 */
export interface EstimatePoint {
  /** 估值日期 (yyyy-MM-dd) */
  date: string
  /** 估算单位净值 */
  nav: number
  /** 估算涨跌幅(%)，如 -1.85 表示 -1.85% */
  growthRate?: number | null
}

/**
 * RSI 策略图表接口返回的数据结构
 */
export interface RsiChartData {
  dates: string[]
  netValues: (number | null)[]
  rsiValues: (number | null)[]
  signals: {
    buy: { coord: [string, number], value: string }[]
    sell: { coord: [string, number], value: string }[]
  }
  config: {
    rsiPeriod: number
    rsiUpper: number
    rsiLower: number
  }
}
