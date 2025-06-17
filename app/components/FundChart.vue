<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import type { HoldingHistoryPoint } from '~/types/holding'

use([CanvasRenderer, LineChart, TitleComponent, TooltipComponent, GridComponent, LegendComponent])

const props = defineProps<{
  history: HoldingHistoryPoint[]
  title: string
}>()

const chartOption = computed<EChartsOption>(() => {
  const dates = props.history.map(p => p.date)
  const navs = props.history.map(p => p.nav)
  const ma5 = props.history.map(p => p.ma5)
  const ma10 = props.history.map(p => p.ma10)
  const ma20 = props.history.map(p => p.ma20)

  return {
    title: { text: props.title, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['净值', 'MA5', 'MA10', 'MA20'], top: 30 },
    grid: { top: 70, left: '10%', right: '10%', bottom: '10%' },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value', scale: true },
    series: [
      { name: '净值', type: 'line', data: navs, showSymbol: false },
      { name: 'MA5', type: 'line', data: ma5, showSymbol: false, lineStyle: { type: 'dashed' } },
      { name: 'MA10', type: 'line', data: ma10, showSymbol: false, lineStyle: { type: 'dashed' } },
      { name: 'MA20', type: 'line', data: ma20, showSymbol: false, lineStyle: { type: 'dashed' } },
    ],
  }
})
</script>

<template>
  <VChart class="h-100 w-full" :option="chartOption" autoresize />
</template>