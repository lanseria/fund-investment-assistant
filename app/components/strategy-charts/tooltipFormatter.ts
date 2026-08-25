import type { SectorAlignedData } from './panels'
import { formatCurrency } from '~/utils/format'
import { buildActionBadgeHtml } from '~/utils/sectorStyle'

/**
 * 多子图共享的 axis tooltip formatter。
 * 合并基金走势(净值/均线/交易金额柱)与板块主力行为(强度/资金/暗盘/散户)、RSI 的信息，
 * 按固定 seriesOrder 排序输出。
 */
export function buildTooltipFormatter(opts: {
  sectorByDate: Map<string, SectorAlignedData>
  rsiSeriesName: string | null
  textColor: string
}) {
  const { sectorByDate, rsiSeriesName, textColor } = opts

  return (params: any) => {
    const list = Array.isArray(params) ? params : [params]
    if (list.length === 0)
      return ''

    const date = list[0]?.axisValueLabel || list[0]?.axisValue || ''
    const lines = [`<b>${date}</b>`]

    const sectorInfo = sectorByDate.get(date)
    if (sectorInfo?.action)
      lines.push(buildActionBadgeHtml(sectorInfo.action))

    const seriesOrder = ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出', '主力强度', '主力资金', '主力暗盘', '散户资金', ...(rsiSeriesName ? [rsiSeriesName] : [])]

    list
      .filter((item: any) => item?.value !== null && item?.value !== undefined)
      .filter((item: any) => item.seriesName !== '布林带信号') // 布林带子图的透明承载序列不参与坐标轴 tooltip
      .sort((a: any, b: any) => seriesOrder.indexOf(a.seriesName) - seriesOrder.indexOf(b.seriesName))
      .forEach((item: any) => {
        if (item.seriesType === 'bar') {
          const amount = Number(item.value)
          if (Number.isNaN(amount) || amount === 0)
            return
          const absAmount = Math.abs(amount)
          const direction = amount < 0 ? '流出' : '流入'
          lines.push(`${item.marker}${item.seriesName}: ${formatCurrency(absAmount)} <span style="color:${textColor}">(${direction})</span>`)
          return
        }

        if (item.seriesName === '净值') {
          lines.push(`${item.marker}净值: ${Number(item.value).toFixed(4)}`)
          return
        }

        if (item.seriesName === '主力强度') {
          const v = Number(item.value)
          const sign = v > 0 ? '+' : ''
          lines.push(`${item.marker}主力强度: ${sign}${v.toFixed(2)}%`)
          return
        }

        if (item.seriesName === '主力资金' || item.seriesName === '主力暗盘' || item.seriesName === '散户资金') {
          const v = Number(item.value)
          const sign = v > 0 ? '+' : ''
          lines.push(`${item.marker}${item.seriesName}: ${sign}${v.toFixed(2)} 亿`)
          return
        }

        if (rsiSeriesName && item.seriesName === rsiSeriesName) {
          lines.push(`${item.marker}${item.seriesName}: ${Number(item.value).toFixed(1)}`)
          return
        }

        if (typeof item.value === 'number') {
          lines.push(`${item.marker}${item.seriesName}: ${Number(item.value).toFixed(3)}`)
        }
      })

    return lines.join('<br/>')
  }
}
