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
