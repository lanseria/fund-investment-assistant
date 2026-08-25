import type { SubPanel } from './panels'
import { formatCurrency } from '~/utils/format'

/**
 * 多子图布局装配：把主图 series + 各 SubPanel 组装为
 * grid / xAxis / yAxis / series 与 dataZoom 轴索引映射。
 */

/** 图表总高度随子图组合自适应 */
export function chartHeightClass(hasRsi: boolean, hasBollinger: boolean, hasSector: boolean): string {
  // 必须使用字面量 class：UnoCSS 依静态源码扫描生成样式，
  // 模板字符串拼接的 h-* 不会被提取，会导致图表高度样式缺失。
  if (hasRsi && hasBollinger && hasSector)
    return 'h-265' // 全部子图 1060px：主图约 254px / RSI 138px / 布林带信号 95px / 主力双图 190px
  if (hasRsi && hasSector)
    return 'h-215' // 860px
  if (hasBollinger && hasSector)
    return 'h-200' // 800px
  if (hasSector)
    return 'h-165' // 660px
  if (hasRsi && hasBollinger)
    return 'h-185' // 740px
  if (hasRsi)
    return 'h-150' // 600px
  if (hasBollinger)
    return 'h-140' // 560px
  return 'h-100' // 单图 400px
}

export interface ChartLayout {
  grids: Record<string, any>[]
  xAxes: Record<string, any>[]
  yAxes: Record<string, any>[]
  /** 主图 + 各子图 series 的合集（子图 series 已写入对应 gridIndex/yAxisIndex） */
  multiSeries: Record<string, any>[]
  /** dataZoom 作用的 xAxis 下标（主图 + 所有子图） */
  zoomXAxisIndexes: number[]
  /** 各子图首序列在 multiSeries 中的下标，供 visualMap 定位主力强度序列 */
  panelSeriesStart: Map<string, number>
}

/**
 * 装配多子图布局。
 * 网格纵向分布：标题/图例区（预留图例换行空间） → 主图 → 各子图 → 缩放条。
 */
export function buildChartLayout(opts: {
  allDates: string[]
  subPanels: SubPanel[]
  fundSeries: Record<string, any>[]
  gridColor: string
  textColor: string
}): ChartLayout {
  const { allDates, subPanels, fundSeries, gridColor, textColor } = opts

  const TOP_AREA = 13
  const BOTTOM_AREA = 8
  const GRID_GAP = 3
  const subHeightTotal = subPanels.reduce((sum, p) => sum + p.height, 0)
  const mainHeight = 100 - TOP_AREA - BOTTOM_AREA - subHeightTotal - GRID_GAP * (subPanels.length + 1)

  const grids: Record<string, any>[] = [{ top: `${TOP_AREA}%`, left: '8%', right: '9%', height: `${mainHeight}%` }]
  const xAxes: Record<string, any>[] = [
    { type: 'category', gridIndex: 0, data: allDates, axisLabel: { show: false }, axisLine: { lineStyle: { color: gridColor } } },
  ]
  const yAxes: Record<string, any>[] = [
    {
      type: 'value',
      gridIndex: 0,
      scale: true,
      axisLine: { show: true, lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) },
      splitLine: { lineStyle: { color: gridColor } },
    },
    {
      type: 'value',
      gridIndex: 0,
      scale: true,
      position: 'right',
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, formatter: (val: number) => formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
      splitLine: { show: false },
    },
  ]
  const multiSeries: Record<string, any>[] = [...fundSeries]
  const zoomXAxisIndexes = [0]
  const panelSeriesStart = new Map<string, number>()

  let cursorTop = TOP_AREA + mainHeight + GRID_GAP
  subPanels.forEach((panel, i) => {
    const gridIndex = i + 1
    const yAxisIndex = yAxes.length
    grids.push({ top: `${cursorTop}%`, left: '8%', right: '9%', height: `${panel.height}%` })
    xAxes.push({
      type: 'category',
      gridIndex,
      data: allDates,
      axisLine: { lineStyle: { color: gridColor } },
      // 仅最后一个子图显示 x 轴日期标签，其余与主图共享视觉对齐
      axisLabel: i === subPanels.length - 1 ? { color: textColor } : { show: false },
    })
    yAxes.push({ gridIndex, ...panel.yAxis })
    panelSeriesStart.set(panel.key, multiSeries.length)
    panel.series.forEach(s => multiSeries.push({ ...s, xAxisIndex: gridIndex, yAxisIndex }))
    zoomXAxisIndexes.push(gridIndex)
    cursorTop += panel.height + GRID_GAP
  })

  return { grids, xAxes, yAxes, multiSeries, zoomXAxisIndexes, panelSeriesStart }
}
