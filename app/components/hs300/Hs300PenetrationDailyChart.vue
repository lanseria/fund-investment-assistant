<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { Hs300PenetrationDailySeries } from '~~/shared/hs300Penetration'

const props = withDefaults(defineProps<{
  /** 日频估算序列（按日期升序，各数组等长） */
  daily: Hs300PenetrationDailySeries
  /** 指数名称，用于轴标题 / tooltip 文案 */
  indexName: string
  /** dataZoom 初始起点（百分比，默认 0） */
  zoomStart?: number
  /** dataZoom 初始终点（百分比，默认 100） */
  zoomEnd?: number
}>(), {
  zoomStart: 0,
  zoomEnd: 100,
})

/** 合计规模折线（左轴）颜色 */
const SCALE_COLOR = '#3b82f6'
/** 占比折线（右轴）颜色 */
const RATIO_COLOR = '#0ea5e9'

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark'
  ? 'dark'
  : 'default'))

const pointCount = computed(() => props.daily.dates.length)
const isEmpty = computed(() => pointCount.value === 0)

/** 元 → 亿元，保留 2 位小数 */
function toYi(value: number): string {
  return Number.isFinite(value)
    ? (value / 1e8).toFixed(2)
    : '-'
}

/** 元 → 万亿元，保留 2 位小数 */
function toWanYi(value: number): string {
  return Number.isFinite(value)
    ? (value / 1e12).toFixed(2)
    : '-'
}

/** tooltip 中的小圆点 marker（与图表系列同色） */
function markerDot(color: string): string {
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color};margin-right:4px;vertical-align:middle"></span>`
}

/**
 * 自定义 axis tooltip：日频各数组等长，直接用 dataIndex 回查数值。
 */
function buildTooltipHtml(params: unknown): string {
  if (!Array.isArray(params) || params.length === 0)
    return ''
  const first = params[0] as { dataIndex?: number } | undefined
  const dataIndex = Number(first?.dataIndex)
  if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= pointCount.value)
    return ''
  const date = props.daily.dates[dataIndex] ?? ''
  const totalNetAssets = props.daily.totalNetAssets[dataIndex] ?? 0
  const ratio = props.daily.ratio[dataIndex] ?? 0
  const floatCap = props.daily.floatCap[dataIndex] ?? 0
  const indexClose = props.daily.indexClose[dataIndex] ?? 0

  const lines: string[] = []
  lines.push(`<div style="font-weight:600;margin-bottom:4px">${date}</div>`)
  lines.push(`<div>${markerDot(SCALE_COLOR)}合计规模：<b>${toYi(totalNetAssets)}</b> 亿</div>`)
  lines.push(`<div>${markerDot(RATIO_COLOR)}占${props.indexName}流通市值：<b>${ratio.toFixed(3)}%</b></div>`)
  lines.push(`<div>流通市值：${toWanYi(floatCap)} 万亿</div>`)
  lines.push(`<div>指数收盘：${Number.isFinite(indexClose)
    ? indexClose.toFixed(2)
    : '-'}</div>`)
  return lines.join('')
}

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark
    ? '#d1d5db'
    : '#374151'
  const gridColor = isDark
    ? '#374151'
    : '#f3f4f6'
  const axisLineColor = isDark
    ? '#4b5563'
    : '#e5e7eb'
  const tooltipBg = isDark
    ? '#1f2937'
    : '#ffffff'
  const tooltipBorder = isDark
    ? '#374151'
    : '#e5e7eb'

  const dates = props.daily.dates
  // 数据点过少时强制展示全部，避免外部传入的 dataZoom 百分比把仅有的点挤出窗口
  const safeZoom = dates.length <= 2
    ? { start: 0, end: 100 }
    : { start: props.zoomStart, end: props.zoomEnd }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: textColor, fontSize: 12 },
      formatter: buildTooltipHtml,
    },
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: { color: textColor, fontSize: 11 },
      data: ['合计规模（亿元）', '占比（%）'],
    },
    grid: {
      top: 40,
      right: 20,
      bottom: 64,
      left: 10,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisTick: { show: false },
      axisLine: {
        lineStyle: { color: axisLineColor },
      },
      axisLabel: {
        color: textColor,
        fontSize: 10,
        rotate: 45,
        interval: 'auto',
        hideOverlap: true,
      },
    },
    yAxis: [
      {
        // 左轴：头部基金合计规模（亿元）
        type: 'value',
        name: '合计规模（亿元）',
        nameTextStyle: { color: textColor, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: {
          lineStyle: { color: gridColor },
        },
      },
      {
        // 右轴：占流通市值比例（%）
        type: 'value',
        name: '占比（%）',
        nameTextStyle: { color: textColor, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 10, formatter: '{value}%' },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: safeZoom.start,
        end: safeZoom.end,
        zoomOnMouseWheel: false,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 8,
        height: 20,
        start: safeZoom.start,
        end: safeZoom.end,
        textStyle: { color: textColor, fontSize: 10 },
        borderColor: axisLineColor,
      },
    ],
    series: [
      {
        name: '合计规模（亿元）',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: SCALE_COLOR },
        itemStyle: { color: SCALE_COLOR },
        areaStyle: { opacity: 0.12, color: SCALE_COLOR },
        data: props.daily.totalNetAssets.map(value => Number((value / 1e8).toFixed(2))),
      },
      {
        name: '占比（%）',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        z: 10,
        lineStyle: { width: 2, color: RATIO_COLOR },
        itemStyle: { color: RATIO_COLOR },
        data: props.daily.ratio.map(value => Number(value.toFixed(3))),
      },
    ],
  } as EChartsOption
})
</script>

<template>
  <div v-if="isEmpty" class="text-sm text-gray-400 flex h-120 w-full items-center justify-center">
    暂无日频数据
  </div>
  <VChartFull v-else class="h-120 w-full" :option="chartOption" autoresize />
</template>
