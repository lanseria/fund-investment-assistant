<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { RsiChartData } from '~/types/chart'

const props = defineProps<{
  data: RsiChartData
}>()

const chartOption = computed<EChartsOption>(() => {
  if (!props.data || props.data.dates.length === 0)
    return {}

  const { dates, netValues, rsiValues, signals, config } = props.data
  const firstNav = netValues[0] ?? 0
  const lastNav = netValues[netValues.length - 1] ?? 0
  const mainColor = lastNav >= firstNav ? '#ef4444' : '#22c55e'

  return {
    grid: [
      { top: '5%', left: '2%', right: '2%', height: '60%' }, // 净值图
      { top: '70%', left: '2%', right: '2%', height: '25%' }, // RSI图
    ],
    xAxis: [
      { type: 'category', gridIndex: 0, show: false, data: dates },
      { type: 'category', gridIndex: 1, show: false, data: dates },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, show: false, scale: true },
      { type: 'value', gridIndex: 1, show: false, min: 0, max: 100 },
    ],
    tooltip: { show: false },
    series: [
      {
        name: '净值',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: netValues,
        showSymbol: false,
        lineStyle: { color: mainColor, width: 2 },
        areaStyle: { color: mainColor, opacity: 0.1 },
        markPoint: {
          symbolSize: 8,
          data: [
            ...signals.buy.map(p => ({ name: '买', coord: p.coord, itemStyle: { color: '#ef4444' } })),
            ...signals.sell.map(p => ({ name: '卖', coord: p.coord, symbol: 'triangle', symbolRotate: 180, itemStyle: { color: '#22c55e' } })),
          ],
        },
      },
      {
        name: `RSI`,
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: rsiValues,
        showSymbol: false,
        lineStyle: { width: 1, color: '#8b5cf6' },
        markArea: {
          silent: true,
          itemStyle: { opacity: 0.1 },
          data: [
            [{ yAxis: config.rsiUpper, itemStyle: { color: '#ef4444' } }, { yAxis: 100 }],
            [{ yAxis: config.rsiLower, itemStyle: { color: '#22c55e' } }, { yAxis: 0 }],
          ],
        },
      },
    ],
  } as EChartsOption
})
</script>

<template>
  <VChartFull class="h-full w-full" :option="chartOption" autoresize />
</template>
