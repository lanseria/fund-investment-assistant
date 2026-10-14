<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type {
  PullbackLevels,
  PullbackParams,
  PullbackSeries,
  PullbackSignal,
  PullbackZone,
} from '~~/shared/pullbackStrategy'

/**
 * 「强势基金回调买入法（场外日线分批版）」可视化图（跟随明暗主题）：
 * - 主图：单位净值 + EMA9/EMA21/EMA50 + 支撑区色带 + 回踩买点/跌破卖点 +
 *   进场参考 / 止损 / 3R·5R 分批止盈标注线
 * - 副图：滚动区间波动幅度（%），用于观察"上下波动越来越小"
 *
 * 场外口径：无成交量（不做 AVWAP）、无开高低价（不做跳空缺口）、无分钟子图，
 * 相关限制由面板文案显式说明。
 */
const props = defineProps<{
  series: PullbackSeries
  zones: PullbackZone[]
  primaryZone: PullbackZone | null
  levels: PullbackLevels | null
  signals: { buy: PullbackSignal[], sell: PullbackSignal[] }
  params: PullbackParams
  title?: string
}>()

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

/** 明暗两套调色板：与 FundChart / TierStrategyChart 保持同一套约定 */
function palette() {
  const isDark = colorMode.value === 'dark'
  return {
    text: isDark ? '#d1d5db' : '#374151',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    axisLine: isDark ? '#4b5563' : '#e5e7eb',
    splitLine: isDark ? '#374151' : '#f3f4f6',
    tooltipBg: isDark ? '#1f2937' : '#ffffff',
    tooltipBorder: isDark ? '#4b5563' : '#e5e7eb',
    nav: isDark ? '#60a5fa' : '#2563eb',
    emaFast: isDark ? '#fbbf24' : '#f59e0b',
    emaMid: isDark ? '#38bdf8' : '#0ea5e9',
    emaSlow: isDark ? '#a78bfa' : '#8b5cf6',
    buy: '#ef4444',
    sell: '#22c55e',
    stop: isDark ? '#f87171' : '#dc2626',
    target: isDark ? '#4ade80' : '#16a34a',
    range: isDark ? '#f472b6' : '#db2777',
    zone: isDark ? 'rgba(74, 222, 128, 0.14)' : 'rgba(34, 197, 94, 0.10)',
    zonePrimary: isDark ? 'rgba(74, 222, 128, 0.26)' : 'rgba(34, 197, 94, 0.18)',
    zoomBg: isDark ? '#37415133' : '#f3f4f6',
    zoomFill: isDark ? '#60a5fa44' : '#2563eb22',
    zoomHandle: isDark ? '#60a5fa' : '#2563eb',
  }
}

const chartOption = computed<EChartsOption>(() => {
  const { dates, nav, emaFast, emaMid, emaSlow, rangePct } = props.series
  const c = palette()
  const p = props.params

  /** 标注线统一带浅色衬底，避免与净值/均线文字重叠 */
  const lineLabel = (text: string, color: string, position: 'insideEndTop' | 'insideEndBottom' = 'insideEndTop') => ({
    formatter: text,
    color,
    fontSize: 10,
    position,
    backgroundColor: c.tooltipBg,
    borderRadius: 3,
    padding: [2, 4] as [number, number],
  })

  // --- 支撑区色带：主支撑区加深、标注成分 ---
  const zoneAreas = props.zones.map((z) => {
    const isPrimary = props.primaryZone
      ? props.primaryZone.low === z.low && props.primaryZone.high === z.high
      : false
    const partsText = z.parts.map(part => part.label).join('+')
    return [
      {
        yAxis: z.low,
        itemStyle: { color: isPrimary ? c.zonePrimary : c.zone },
        label: {
          show: true,
          position: 'insideTopLeft' as const,
          formatter: `${isPrimary ? '主支撑区 ' : '支撑区 '}${partsText}`,
          color: c.textMuted,
          fontSize: 10,
        },
      },
      { yAxis: z.high },
    ]
  })

  // --- 价格标注线：进场参考 / 止损 / 3R、5R ---
  const levelLines: any[] = []
  if (props.levels) {
    const lv = props.levels
    levelLines.push({
      yAxis: lv.entry,
      lineStyle: { color: c.nav, type: 'solid' as const, width: 1.2, opacity: 0.9 },
      label: lineLabel(`进场参考 ${lv.entry.toFixed(4)}`, c.nav),
    })
    levelLines.push({
      yAxis: lv.stop,
      lineStyle: { color: c.stop, type: 'dashed' as const, width: 1.2 },
      label: lineLabel(`止损 ${lv.stop.toFixed(4)}（-${lv.stopPct}%）`, c.stop, 'insideEndBottom'),
    })
    lv.targets.forEach((t) => {
      levelLines.push({
        yAxis: t.nav,
        lineStyle: { color: c.target, type: 'dashed' as const, width: 1, opacity: 0.85 },
        label: lineLabel(`${t.r}R 止盈 ${t.nav.toFixed(4)}·减${t.portionPct}%`, c.target),
      })
    })
  }

  // --- 买点（回踩重新站上 EMA9，红色 pin）/ 卖点（跌破 EMA9，绿色三角） ---
  const buyMarks = props.signals.buy.map(s => ({
    name: '买入',
    coord: [s.date, s.nav],
    symbol: 'pin',
    itemStyle: { color: c.buy },
    fullData: s,
  }))
  const sellMarks = props.signals.sell.map(s => ({
    name: '卖出',
    coord: [s.date, s.nav],
    symbol: 'triangle',
    symbolRotate: 180,
    itemStyle: { color: c.sell },
    fullData: s,
  }))

  return {
    title: props.title
      ? { text: props.title, left: 'center', textStyle: { fontSize: 14, color: c.text } }
      : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: c.tooltipBg,
      borderColor: c.tooltipBorder,
      textStyle: { color: c.text, fontSize: 12 },
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params]
        const head = list[0]?.axisValue ?? ''
        const rows = list
          .filter((item: any) => item.value !== null && item.value !== undefined)
          .map((item: any) => `<div style="display:flex;justify-content:space-between;gap:12px"><span>${item.marker}${item.seriesName}</span><b>${typeof item.value === 'number' ? item.value.toFixed(4) : item.value}</b></div>`)
        const mark = list.find((item: any) => item.data?.fullData)?.data?.fullData
        const markRow = mark ? `<div style="margin-top:4px;color:${c.textMuted}">${mark.reason ?? ''}</div>` : ''
        return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${rows.join('')}${markRow}`
      },
    },
    legend: {
      top: props.title ? 28 : 0,
      textStyle: { color: c.text },
      data: [`净值`, `EMA${p.emaFast}`, `EMA${p.emaMid}`, `EMA${p.emaSlow}`, '区间波动幅度'],
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 64, right: 24, top: props.title ? 56 : 32, height: '52%' },
      { left: 64, right: 24, top: '76%', bottom: 44 },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: c.axisLine } },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLabel: { color: c.textMuted, fontSize: 10 },
        axisLine: { lineStyle: { color: c.axisLine } },
      },
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        axisLabel: { color: c.text, formatter: (val: number) => val.toFixed(3) },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: c.splitLine } },
      },
      {
        type: 'value',
        gridIndex: 1,
        scale: true,
        axisLabel: { color: c.textMuted, fontSize: 10, formatter: '{value}%' },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: c.splitLine } },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 55, end: 100, zoomOnMouseWheel: false },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        start: 55,
        end: 100,
        bottom: 6,
        height: 20,
        backgroundColor: c.zoomBg,
        borderColor: 'transparent',
        fillerColor: c.zoomFill,
        handleStyle: { color: c.zoomHandle },
        moveHandleStyle: { color: c.zoomHandle },
        textStyle: { color: c.textMuted },
      },
    ],
    series: [
      {
        name: '净值',
        type: 'line',
        data: nav,
        showSymbol: false,
        lineStyle: { width: 2, color: c.nav },
        itemStyle: { color: c.nav },
        emphasis: { focus: 'series' },
        markArea: { silent: true, data: zoneAreas },
        markLine: { symbol: 'none', silent: true, data: levelLines },
        markPoint: {
          symbolSize: 26,
          data: [...buyMarks, ...sellMarks],
          label: {
            show: true,
            color: '#fff',
            fontSize: 10,
            fontWeight: 'bold' as const,
            formatter: (params: any) => (params.name === '买入' ? 'B' : 'S'),
          },
        },
      },
      {
        name: `EMA${p.emaFast}`,
        type: 'line',
        data: emaFast,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.2, color: c.emaFast },
        itemStyle: { color: c.emaFast },
      },
      {
        name: `EMA${p.emaMid}`,
        type: 'line',
        data: emaMid,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.2, color: c.emaMid },
        itemStyle: { color: c.emaMid },
      },
      {
        name: `EMA${p.emaSlow}`,
        type: 'line',
        data: emaSlow,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1, type: 'dashed', opacity: 0.8, color: c.emaSlow },
        itemStyle: { color: c.emaSlow },
      },
      {
        name: '区间波动幅度',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: rangePct,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.5, color: c.range },
        itemStyle: { color: c.range },
        areaStyle: { opacity: 0.12, color: c.range },
      },
    ],
  } as EChartsOption
})
</script>

<template>
  <VChartFull class="h-130 w-full" :option="chartOption" autoresize />
</template>
