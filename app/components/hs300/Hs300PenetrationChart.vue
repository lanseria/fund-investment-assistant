<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { Hs300PenetrationFund, Hs300PenetrationPoint } from '~~/shared/hs300Penetration'
import { formatQuarterLabel } from '~~/shared/hs300Penetration'

const props = withDefaults(defineProps<{
  /** 头部基金（顺序与 point.fundNetAssets 下标一致） */
  funds: Hs300PenetrationFund[]
  /** 季度序列（按报告期升序） */
  series: Hs300PenetrationPoint[]
  /** 指数名称，用于 tooltip / 轴标题文案 */
  indexName: string
  /** dataZoom 初始起点（百分比，默认 0） */
  zoomStart?: number
  /** dataZoom 初始终点（百分比，默认 100） */
  zoomEnd?: number
  /** 图表标题（可选，页面通常用卡片标题，不传） */
  title?: string
}>(), {
  zoomStart: 0,
  zoomEnd: 100,
})

/** 基金堆叠柱色板（按 funds 顺序循环取色） */
const FUND_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]
/** 占比折线颜色 */
const RATIO_COLOR = '#0ea5e9'
/** 占比折线在图例/tooltip 中的名称 */
const RATIO_SERIES_NAME = '占流通市值比例'

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark'
  ? 'dark'
  : 'default'))

const isEmpty = computed(() => props.series.length === 0)

const quarterLabels = computed(() => props.series.map(point => formatQuarterLabel(point.date)))

function fundColor(index: number): string {
  return FUND_COLORS[index % FUND_COLORS.length]!
}

/** 秒 → 元：统一保留 2 位小数（亿元单位） */
function toYi(value: number): string {
  return Number.isFinite(value)
    ? (value / 1e8).toFixed(2)
    : '-'
}

/** 万元/亿元口径的万亿展示：元 → 万亿元，保留 2 位小数 */
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
 * 自定义 axis tooltip：按 dataIndex 回查原始季度数据点，
 * 逐只基金列出规模，再给出合计、占比、流通市值与指数收盘。
 */
function buildTooltipHtml(params: unknown): string {
  if (!Array.isArray(params) || params.length === 0)
    return ''
  const first = params[0] as { dataIndex?: number } | undefined
  const dataIndex = Number(first?.dataIndex)
  if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= props.series.length)
    return ''
  const point = props.series[dataIndex]
  if (!point)
    return ''

  const lines: string[] = []
  lines.push(`<div style="font-weight:600;margin-bottom:4px">${formatQuarterLabel(point.date)}（${point.date}）</div>`)
  props.funds.forEach((fund, index) => {
    const value = point.fundNetAssets[index] ?? 0
    lines.push(`<div>${markerDot(fundColor(index))}${fund.name}：<b>${toYi(value)}</b> 亿</div>`)
  })
  lines.push(`<div style="margin-top:4px">合计：<b>${toYi(point.totalNetAssets)}</b> 亿</div>`)
  lines.push(`<div>占${props.indexName}流通市值：<b>${point.ratio.toFixed(3)}%</b></div>`)
  lines.push(`<div>流通市值：${toWanYi(point.floatCap)} 万亿</div>`)
  lines.push(`<div>指数收盘：${point.indexClose.toFixed(2)}</div>`)
  return lines.join('')
}

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const gridColor = isDark ? '#374151' : '#f3f4f6'
  const axisLineColor = isDark ? '#4b5563' : '#e5e7eb'
  const tooltipBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb'

  const labels = quarterLabels.value
  const pointCount = labels.length
  // 数据点过少时强制展示全部，避免外部传入的 dataZoom 百分比把仅有的点挤出窗口
  const safeZoom = pointCount <= 2
    ? { start: 0, end: 100 }
    : { start: props.zoomStart, end: props.zoomEnd }

  // x 轴标签较密时按间隔抽稀，配合 45° 旋转避免互相重叠
  const labelInterval = pointCount > 24
    ? 2
    : pointCount > 16
      ? 1
      : 0

  const fundSeries = props.funds.map((fund, index) => ({
    name: fund.name,
    type: 'bar' as const,
    stack: 'scale',
    yAxisIndex: 0,
    barMaxWidth: 24,
    itemStyle: {
      color: fundColor(index),
    },
    data: props.series.map(point => Number(((point.fundNetAssets[index] ?? 0) / 1e8).toFixed(2))),
  }))

  const ratioSeries = {
    name: RATIO_SERIES_NAME,
    type: 'line' as const,
    yAxisIndex: 1,
    smooth: true,
    showSymbol: false,
    z: 10,
    lineStyle: { width: 2, color: RATIO_COLOR },
    itemStyle: { color: RATIO_COLOR },
    data: props.series.map(point => Number(point.ratio.toFixed(3))),
  }

  const hasTitle = Boolean(props.title)

  return {
    ...(hasTitle
      ? {
          title: {
            text: props.title,
            left: 'center',
            textStyle: { color: textColor, fontSize: 14 },
          },
        }
      : {}),
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
      top: hasTitle ? 28 : 0,
      textStyle: { color: textColor, fontSize: 11 },
      data: [
        ...props.funds.map(fund => fund.name),
        RATIO_SERIES_NAME,
      ],
    },
    grid: {
      top: hasTitle ? 68 : 40,
      right: 20,
      bottom: 64,
      left: 10,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLine: {
        lineStyle: { color: axisLineColor },
      },
      axisLabel: {
        color: textColor,
        fontSize: 10,
        rotate: 45,
        interval: labelInterval,
      },
    },
    yAxis: [
      {
        // 左轴：头部基金规模（亿元）
        type: 'value',
        name: '规模（亿元）',
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
    series: [...fundSeries, ratioSeries],
  } as EChartsOption
})
</script>

<template>
  <div v-if="isEmpty" class="text-sm text-gray-400 flex h-120 w-full items-center justify-center">
    暂无数据
  </div>
  <VChartFull v-else class="h-120 w-full" :option="chartOption" autoresize />
</template>
