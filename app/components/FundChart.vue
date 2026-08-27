<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { SectorAlignedData, SubPanel } from './strategy-charts/panels'
import type { BollingerSignalData, EstimatePoint, RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import type { SectorCapitalHistoryResponse } from '~/types/sector'
import { formatCurrency } from '~/utils/format'
import { STRENGTH_COLOR_NEG, STRENGTH_COLOR_POS } from '~/utils/sectorStyle'
import { buildChartLayout, chartHeightClass as resolveChartHeightClass } from './strategy-charts/layout'
import { buildTransactionBarSeries, mapSignalsToMarkPoints, mapTransactionsToMarkPoints } from './strategy-charts/marks'
import { buildBollingerPanel, buildRsiPanel, buildSectorPanels } from './strategy-charts/panels'
import { buildTooltipFormatter } from './strategy-charts/tooltipFormatter'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  transactions?: any[]
  title: string
  dataZoomStart: number
  dataZoomEnd: number
  /** 板块主力行为历史（可选）。传入后将以子图形式叠加在走势图下方，与净值共享同一条时间轴 */
  sectorHistory?: SectorCapitalHistoryResponse['history']
  /** RSI 策略数据（可选）。传入后将以子图形式叠加在走势图下方，与净值共享同一条时间轴 */
  rsiData?: RsiChartData
  /** 布林带策略买卖信号（可选）。传入后将作为子图叠加在 RSI 子图下方，只标注买入/卖出信号点 */
  bollingerData?: BollingerSignalData
  /** 当日盘中估值点（可选）。估值日期晚于历史最后净值日期时，以虚线延伸到该估值点 */
  estimate?: EstimatePoint
}>()

const emit = defineEmits(['signal-click', 'transaction-click'])

const hasSector = computed(() => {
  const h = props.sectorHistory
  return !!h && h.dates.length > 0
})

const hasRsi = computed(() => {
  const r = props.rsiData
  return !!r && r.dates.length > 0
})

const hasBollinger = computed(() => {
  const b = props.bollingerData
  return !!b && (b.buy.length > 0 || b.sell.length > 0)
})

// 图表总高度随子图组合自适应
const chartHeightClass = computed(() =>
  resolveChartHeightClass(hasRsi.value, hasBollinger.value, hasSector.value),
)

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const gridColor = isDark ? '#4b5563' : '#e5e7eb'

  // --- 基金走势：按日期建索引 ---
  const fundByDate = new Map<string, HoldingHistoryPoint>()
  props.history.forEach(p => fundByDate.set(p.date, p))

  // --- 当日估值延伸点：仅当估值日期晚于历史最后净值日期（官方净值未出）时展示 ---
  const lastHistoryDate = props.history.length > 0 ? props.history[props.history.length - 1]!.date : ''
  // 估值日期统一为 yyyy-MM-dd：上游实测带 "HH:mm:ss" 后缀(如 "2026-08-27 16:04:00")，
  // 与净值/板块日期字符串不一致时 Set 去重失效，时间轴会重复出现同一天
  const rawEstimateDate = props.estimate?.date ?? ''
  const estimateDate = /^\d{4}-\d{2}-\d{2}/.test(rawEstimateDate) ? rawEstimateDate.slice(0, 10) : rawEstimateDate
  const estimatePoint = props.estimate && lastHistoryDate && estimateDate > lastHistoryDate
    ? { ...props.estimate, date: estimateDate }
    : null

  // --- 统一时间轴：基金日期 ∪ 板块日期 ∪ RSI 日期 ∪ 布林带信号日期 ∪ 估值日期（yyyy-MM-dd 字符串排序即等价于时间排序） ---
  const fundDates = props.history.map(p => p.date)
  const sectorDates = hasSector.value ? props.sectorHistory!.dates : []
  const rsiDates = hasRsi.value ? props.rsiData!.dates : []
  const bollingerDates = hasBollinger.value
    ? [...props.bollingerData!.buy, ...props.bollingerData!.sell].map(p => p.date)
    : []
  const estimateDates = estimatePoint ? [estimatePoint.date] : []
  const allDates = (hasSector.value || hasRsi.value || hasBollinger.value || estimatePoint)
    ? Array.from(new Set([...fundDates, ...sectorDates, ...rsiDates, ...bollingerDates, ...estimateDates])).sort()
    : fundDates

  // 基金序列对齐到 allDates（板块独有日期补 null）
  const pointAt = (d: string) => fundByDate.get(d)
  const navData = allDates.map(d => pointAt(d)?.nav ?? null)
  const ma5Data = allDates.map(d => pointAt(d)?.ma5 ?? null)
  const ma10Data = allDates.map(d => pointAt(d)?.ma10 ?? null)
  const ma20Data = allDates.map(d => pointAt(d)?.ma20 ?? null)
  const ma120Data = allDates.map(d => pointAt(d)?.ma120 ?? null)

  const transactionBarSeries = buildTransactionBarSeries(props.transactions, allDates)

  // --- 板块主力行为数据（可选）：按日期建索引并对齐到 allDates ---
  const sectorByDate = new Map<string, SectorAlignedData>()
  if (hasSector.value) {
    const h = props.sectorHistory!
    h.dates.forEach((d, i) => {
      sectorByDate.set(d, {
        strength: h.mainStrength[i] ?? null,
        capital: h.mainCapital[i] ?? null,
        hidden: h.mainHidden[i] ?? null,
        retail: h.retailCapital[i] ?? null,
        action: h.actions[i] ?? '',
      })
    })
  }

  // --- RSI 策略数据（可选）：按日期建索引并对齐到 allDates ---
  const rsiByDate = new Map<string, number | null>()
  if (hasRsi.value) {
    props.rsiData!.dates.forEach((d, i) => {
      rsiByDate.set(d, props.rsiData!.rsiValues[i] ?? null)
    })
  }
  const rsiLineData = allDates.map(d => rsiByDate.get(d) ?? null)
  const rsiSeriesName = hasRsi.value ? `RSI(${props.rsiData!.config.rsiPeriod})` : null

  // 统一的 tooltip：合并基金走势与板块主力行为信息
  const tooltipFormatter = buildTooltipFormatter({ sectorByDate, rsiSeriesName, estimate: estimatePoint, textColor })

  // --- 基金走势序列（净值 + 均线 + 交易量柱），统一绑定到第 0 个网格 ---
  const fundSeries: any[] = [
    {
      name: '净值',
      type: 'line',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: navData,
      showSymbol: false,
      z: 3,
      // 净值线末端的当日估值延伸段：虚线、继承净值线配色，末端标注估值数字
      ...(estimatePoint
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed', width: 2 },
              label: {
                show: true,
                position: 'end',
                formatter: () => estimatePoint.nav.toFixed(4),
                fontSize: 11,
              },
              data: [[
                { coord: [lastHistoryDate, fundByDate.get(lastHistoryDate)?.nav] },
                { coord: [estimatePoint.date, estimatePoint.nav] },
              ]],
            },
          }
        : {}),
      markPoint: {
        symbolKeepAspect: true,
        data: [
          ...mapSignalsToMarkPoints(props.signals, '买入', isDark),
          ...mapSignalsToMarkPoints(props.signals, '卖出', isDark),
          ...mapTransactionsToMarkPoints(props.transactions, props.history),
        ],
        tooltip: {
          formatter: (params: any) => {
            if (params.data && params.data.fullData) {
              const data = params.data.fullData
              return `<b>${data.signal}信号 (ID: ${data.id})</b><br/>日期: ${data.latestDate}<br/>净值: ${Number(data.latestClose).toFixed(4)}<br/>原因: ${data.reason}`
            }
            return params.name
          },
        },
        zlevel: 10,
      },
    },
    { name: 'MA5', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma5Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    { name: 'MA10', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma10Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    { name: 'MA20', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma20Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    { name: 'MA120', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma120Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    ...transactionBarSeries,
  ]

  // --- 无板块、无 RSI 且无布林带数据：保持原有单图布局，行为与之前一致 ---
  if (!hasSector.value && !hasRsi.value && !hasBollinger.value) {
    return {
      title: { text: props.title, left: 'center', textStyle: { color: textColor } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, formatter: tooltipFormatter },
      // 默认 plain 图例在宽度不足时自动换行，避免滚动条挤压
      legend: {
        data: ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出'],
        top: 40,
        textStyle: { color: textColor },
      },
      grid: { top: 96, left: '10%', right: '12%', bottom: '18%' },
      xAxis: { type: 'category', data: allDates, axisLabel: { color: textColor }, axisLine: { lineStyle: { color: gridColor } } },
      yAxis: [
        {
          type: 'value',
          scale: true,
          axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          scale: true,
          position: 'right',
          axisLabel: { color: textColor, formatter: (val: number) => formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
          splitLine: { show: false },
          axisLine: { lineStyle: { color: gridColor } },
        },
      ],
      dataZoom: [
        { type: 'inside', start: props.dataZoomStart, end: props.dataZoomEnd, zoomOnMouseWheel: false },
        { type: 'slider', start: props.dataZoomStart, end: props.dataZoomEnd, top: 'auto', bottom: 10, height: 25 },
      ],
      series: fundSeries,
    } as EChartsOption
  }

  // --- 多子图布局：主图(净值)下方依次叠加 RSI / 布林带信号 / 板块主力强度 / 主力资金子图，共享时间轴 ---
  const subPanels: SubPanel[] = []
  if (hasRsi.value) {
    subPanels.push(buildRsiPanel({
      rsiData: props.rsiData!,
      rsiByDate,
      rsiLineData,
      gridColor,
      textColor,
    }))
  }
  if (hasBollinger.value) {
    subPanels.push(buildBollingerPanel({
      bollingerData: props.bollingerData!,
      navData,
      gridColor,
      textColor,
    }))
  }
  if (hasSector.value) {
    subPanels.push(...buildSectorPanels({
      history: props.sectorHistory!,
      sectorByDate,
      allDates,
      gridColor,
      textColor,
    }))
  }

  const { grids, xAxes, yAxes, multiSeries, zoomXAxisIndexes, panelSeriesStart } = buildChartLayout({
    allDates,
    subPanels,
    fundSeries,
    gridColor,
    textColor,
  })

  // 主力强度按正负染色：visualMap 仅作用于主力强度序列。
  // 使用 continuous + 以数据绝对值最大值为对称区间，使 0 落在颜色区间正中，实现正红/负绿。
  const strengthSeriesIndex = panelSeriesStart.get('strength') ?? -1
  const strengthMaxAbs = (props.sectorHistory?.mainStrength ?? [])
    .filter((v): v is number => v !== null && v !== undefined)
    .reduce((max, v) => Math.max(max, Math.abs(v)), 0) || 1

  const legendData = ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出']
  if (rsiSeriesName)
    legendData.push(rsiSeriesName)
  if (hasSector.value)
    legendData.push('主力强度', '主力资金', '主力暗盘', '散户资金')

  return {
    title: { text: props.title, left: 'center', textStyle: { color: textColor } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, formatter: tooltipFormatter },
    // 默认 plain 图例在宽度不足时自动换行，避免滚动条挤压
    legend: {
      data: legendData,
      top: 40,
      textStyle: { color: textColor },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    ...(strengthSeriesIndex !== -1
      ? {
          visualMap: {
            show: false,
            type: 'continuous',
            seriesIndex: strengthSeriesIndex,
            min: -strengthMaxAbs,
            max: strengthMaxAbs,
            calculable: false,
            inRange: { color: [STRENGTH_COLOR_NEG, STRENGTH_COLOR_POS] },
          },
        }
      : {}),
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    dataZoom: [
      { type: 'inside', xAxisIndex: zoomXAxisIndexes, start: props.dataZoomStart, end: props.dataZoomEnd, zoomOnMouseWheel: false },
      { type: 'slider', xAxisIndex: zoomXAxisIndexes, start: props.dataZoomStart, end: props.dataZoomEnd, bottom: 8, height: 22 },
    ],
    series: multiSeries,
  } as EChartsOption
})

function handleChartClick(params: any) {
  if (params.componentType === 'markPoint' && params.data) {
    if (params.data.fullData) {
      emit('signal-click', params.data.fullData)
    }
    // 检查 transactionList
    else if (params.data.transactionList) {
      emit('transaction-click', params.data.transactionList)
    }
  }
}
</script>

<template>
  <VChartFull class="w-full" :class="chartHeightClass" :option="chartOption" autoresize @click="handleChartClick" />
</template>
