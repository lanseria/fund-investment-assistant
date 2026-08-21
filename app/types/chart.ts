/**
 * 布林带策略子图数据结构（仅买卖信号点，由每日策略信号记录筛选聚合而成）
 */
export interface BollingerSignalPoint {
  /** 信号日期 (yyyy-MM-dd) */
  date: string
  /** 信号当日净值（作为信号点的 y 坐标） */
  close: number
  /** 完整信号记录（用于点击查看信号详情） */
  signal: Record<string, any>
}

export interface BollingerSignalData {
  buy: BollingerSignalPoint[]
  sell: BollingerSignalPoint[]
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
