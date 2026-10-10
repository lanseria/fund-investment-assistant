<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { StrategyTiers } from '~~/shared/strategyTiers'

/**
 * 档位策略可视化图（跟随明暗主题）：
 * - 主图：净值 + MA20/MA60/MA250 + 低吸档位线(绿虚线) / 高抛档位线(红虚线)
 * - 副图：RSI14 曲线 + 触发条件线 (RSI14Max) + 泡沫清仓线 (rsi14Min)
 */
const props = defineProps<{
  series: {
    dates: string[]
    nav: number[]
    ma20: (number | null)[]
    ma60: (number | null)[]
    ma250: (number | null)[]
    rsi14: (number | null)[]
  }
  tiers: StrategyTiers
  title?: string
}>()

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

/** 明暗两套调色板：与 FundChart / marks.ts 保持同一套约定 */
function palette() {
  const isDark = colorMode.value === 'dark'
  return {
    isDark,
    text: isDark ? '#d1d5db' : '#374151',
    textMuted: isDark ? '#9ca3af' : '#9ca3af',
    axisLine: isDark ? '#4b5563' : '#e5e7eb',
    splitLine: isDark ? '#374151' : '#f3f4f6',
    tooltipBg: isDark ? '#1f2937' : '#ffffff',
    tooltipBorder: isDark ? '#4b5563' : '#e5e7eb',
    nav: isDark ? '#60a5fa' : '#2563eb',
    ma20: isDark ? '#fbbf24' : '#f59e0b',
    ma60: isDark ? '#38bdf8' : '#0ea5e9',
    ma250: isDark ? '#64748b' : '#94a3b8',
    rsi: isDark ? '#c084fc' : '#a855f7',
    buy: isDark ? '#4ade80' : '#22c55e',
    sell: isDark ? '#f87171' : '#ef4444',
    zoomBg: isDark ? '#37415133' : '#f3f4f6',
    zoomFill: isDark ? '#60a5fa44' : '#2563eb22',
    zoomHandle: isDark ? '#60a5fa' : '#2563eb',
  }
}

const chartOption = computed<EChartsOption>(() => {
  const { dates, nav, ma20, ma60, ma250, rsi14 } = props.series
  const t = props.tiers
  const c = palette()

  /** 档位标注线统一带浅色衬底，避免与 K 线/均线文字打架 */
  const lineLabel = (text: string, color: string) => ({
    formatter: text,
    color,
    fontSize: 10,
    backgroundColor: c.tooltipBg,
    borderRadius: 3,
    padding: [2, 4] as [number, number],
  })

  const buyLines = t.buyTiers.map(tier => ({
    yAxis: tier.nav,
    lineStyle: { color: c.buy, type: 'dashed' as const, width: 1, opacity: 0.85 },
    label: { ...lineLabel(`低吸 ≤${tier.nav} 买现金${tier.percentOfCash}%`, c.buy), position: 'insideEndTop' as const },
  }))

  const sellLines = t.sellTiers.map(tier => ({
    yAxis: tier.nav,
    lineStyle: { color: c.sell, type: 'dashed' as const, width: 1, opacity: 0.85 },
    label: { ...lineLabel(`高抛 ≥${tier.nav} 减${tier.percent}%`, c.sell), position: 'insideEndBottom' as const },
  }))

  const rsiLines: any[] = []
  if (t.trigger.rsi14Max !== null) {
    rsiLines.push({
      yAxis: t.trigger.rsi14Max,
      lineStyle: { color: c.buy, type: 'dashed' as const, width: 1 },
      label: lineLabel(`触发 RSI14≤${t.trigger.rsi14Max}`, c.buy),
    })
  }
  if (t.clearRule?.rsi14Min !== null && t.clearRule?.rsi14Min !== undefined) {
    rsiLines.push({
      yAxis: t.clearRule.rsi14Min,
      lineStyle: { color: c.sell, type: 'dashed' as const, width: 1 },
      label: lineLabel(`清仓 RSI14≥${t.clearRule.rsi14Min}`, c.sell),
    })
  }

  return {
    title: props.title
      ? { text: props.title, left: 'center', textStyle: { fontSize: 14, color: c.text } }
      : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.tooltipBg,
      borderColor: c.tooltipBorder,
      textStyle: { color: c.text, fontSize: 12 },
    },
    legend: { top: props.title ? 28 : 0, textStyle: { color: c.text } },
    grid: [
      { left: 60, right: 20, top: 50, height: '55%' },
      { left: 60, right: 20, top: '76%', bottom: 40 },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLabel: { color: c.text },
        axisLine: { lineStyle: { color: c.axisLine } },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: c.axisLine } },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        axisLabel: { color: c.text },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: c.splitLine } },
      },
      {
        type: 'value',
        gridIndex: 1,
        min: 0,
        max: 100,
        axisLabel: { color: c.textMuted },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: c.splitLine } },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1] },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        bottom: 5,
        backgroundColor: c.zoomBg,
        borderColor: 'transparent',
        fillerColor: c.zoomFill,
        handleStyle: { color: c.zoomHandle },
        moveHandleStyle: { color: c.zoomHandle },
        emphasis: { handleStyle: { color: c.zoomHandle }, moveHandleStyle: { color: c.zoomHandle } },
        textStyle: { color: c.textMuted },
        dataBackground: {
          lineStyle: { color: c.axisLine },
          areaStyle: { color: c.zoomBg },
        },
        selectedDataBackground: {
          lineStyle: { color: c.zoomHandle },
          areaStyle: { color: c.zoomFill },
        },
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
        markLine: { symbol: 'none', silent: true, data: [...buyLines, ...sellLines] },
      },
      { name: 'MA20', type: 'line', data: ma20, showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.7, color: c.ma20 }, itemStyle: { color: c.ma20 } },
      { name: 'MA60', type: 'line', data: ma60, showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.7, color: c.ma60 }, itemStyle: { color: c.ma60 } },
      { name: '年线 MA250', type: 'line', data: ma250, showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.7, color: c.ma250 }, itemStyle: { color: c.ma250 } },
      {
        name: 'RSI14',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: rsi14,
        showSymbol: false,
        lineStyle: { width: 1.5, color: c.rsi },
        itemStyle: { color: c.rsi },
        markLine: { symbol: 'none', silent: true, data: rsiLines },
      },
    ],
  }
})
</script>

<template>
  <VChartFull class="h-130 w-full" :option="chartOption" autoresize />
</template>
