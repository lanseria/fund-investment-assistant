<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { StrategyTiers } from '~~/shared/strategyTiers'

/**
 * 档位策略可视化图：
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

const chartOption = computed<EChartsOption>(() => {
  const { dates, nav, ma20, ma60, ma250, rsi14 } = props.series
  const t = props.tiers

  const buyLines = t.buyTiers.map(tier => ({
    yAxis: tier.nav,
    lineStyle: { color: '#22c55e', type: 'dashed' as const, width: 1, opacity: 0.8 },
    label: {
      formatter: `低吸 ≤${tier.nav} 买现金${tier.percentOfCash}%`,
      position: 'insideEndTop' as const,
      color: '#22c55e',
      fontSize: 10,
    },
  }))

  const sellLines = t.sellTiers.map(tier => ({
    yAxis: tier.nav,
    lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1, opacity: 0.8 },
    label: {
      formatter: `高抛 ≥${tier.nav} 减${tier.percent}%`,
      position: 'insideEndBottom' as const,
      color: '#ef4444',
      fontSize: 10,
    },
  }))

  const rsiLines: any[] = []
  if (t.trigger.rsi14Max !== null) {
    rsiLines.push({
      yAxis: t.trigger.rsi14Max,
      lineStyle: { color: '#22c55e', type: 'dashed' as const, width: 1 },
      label: { formatter: `触发 RSI14≤${t.trigger.rsi14Max}`, fontSize: 10, color: '#22c55e' },
    })
  }
  if (t.clearRule?.rsi14Min !== null && t.clearRule?.rsi14Min !== undefined) {
    rsiLines.push({
      yAxis: t.clearRule.rsi14Min,
      lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1 },
      label: { formatter: `清仓 RSI14≥${t.clearRule.rsi14Min}`, fontSize: 10, color: '#ef4444' },
    })
  }

  return {
    title: props.title ? { text: props.title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: { trigger: 'axis' },
    legend: { top: props.title ? 28 : 0 },
    grid: [
      { left: 60, right: 20, top: 50, height: '55%' },
      { left: 60, right: 20, top: '76%', bottom: 40 },
    ],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: false },
      { type: 'category', gridIndex: 1, data: dates, boundaryGap: false, axisLabel: { show: false } },
    ],
    yAxis: [
      { type: 'value', scale: true },
      { type: 'value', gridIndex: 1, min: 0, max: 100, axisLabel: { formatter: '{value}' } },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1] },
      { type: 'slider', xAxisIndex: [0, 1], bottom: 5 },
    ],
    series: [
      {
        name: '净值',
        type: 'line',
        data: nav,
        showSymbol: false,
        lineStyle: { width: 2 },
        markLine: { symbol: 'none', silent: true, data: [...buyLines, ...sellLines] },
      },
      { name: 'MA20', type: 'line', data: ma20, showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.6 } },
      { name: 'MA60', type: 'line', data: ma60, showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.6 } },
      { name: 'MA250', type: 'line', data: ma250, showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.6 } },
      {
        name: 'RSI14',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: rsi14,
        showSymbol: false,
        lineStyle: { width: 1.5, color: '#a855f7' },
        markLine: { symbol: 'none', silent: true, data: rsiLines },
      },
    ],
  }
})
</script>

<template>
  <VChartFull class="h-130 w-full" :option="chartOption" autoresize />
</template>
