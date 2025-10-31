<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { HoldingHistoryPoint } from '~/types/holding'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
}>()

const chartOption = computed<EChartsOption>(() => {
  if (!props.history || props.history.length === 0)
    return {}

  // 根据首尾数据判断整体趋势，决定图表颜色
  const firstNav = props.history[0]?.nav ?? 0
  const lastNav = props.history[props.history.length - 1]?.nav ?? 0
  const mainColor = lastNav >= firstNav ? '#ef4444' : '#22c55e' // 红涨绿跌

  // 信号点映射逻辑 (保持不变)
  const mapSignalsToMarkPoints = (signalType: '买入' | '卖出') => {
    const isBuy = signalType === '买入'
    return props.signals
      .filter(s => s.signal.trim() === signalType)
      .map(s => ({
        name: signalType,
        coord: [s.latestDate, Number(s.latestClose)],
        symbol: isBuy ? 'circle' : 'triangle',
        symbolRotate: isBuy ? 0 : 180,
        symbolSize: 8,
        itemStyle: {
          color: isBuy ? '#ef4444' : '#22c55e',
        },
      }))
  }

  return {
    grid: { top: 10, right: 10, bottom: 10, left: 10 },
    xAxis: { type: 'category', show: false, data: props.history.map(p => p.date) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false }, // 禁用交互
    series: [
      {
        name: '净值',
        type: 'line',
        data: props.history.map(p => p.nav),
        showSymbol: false,
        lineStyle: { color: mainColor, width: 2 },
        areaStyle: { color: mainColor, opacity: 0.1 },
        markPoint: {
          data: [...mapSignalsToMarkPoints('买入'), ...mapSignalsToMarkPoints('卖出')],
        },
      },
      // 简化均线
      { name: 'MA5', type: 'line', data: props.history.map(p => p.ma5), showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.5 } },
      { name: 'MA20', type: 'line', data: props.history.map(p => p.ma20), showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.5 } },
    ],
  }
})
</script>

<template>
  <VChartFull class="h-full w-full" :option="chartOption" autoresize />
</template>
