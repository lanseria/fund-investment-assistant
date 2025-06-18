<!-- app/components/FundChart.vue -->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { HoldingHistoryPoint } from '~/types/holding'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  title: string
}>()

use([CanvasRenderer, LineChart, TitleComponent, TooltipComponent, GridComponent, LegendComponent])

// 新增: 引入 useColorMode 来感知主题变化
const colorMode = useColorMode()

const chartOption = computed<EChartsOption>(() => {
  // 优化1: 仅截取日期部分 (YYYY-MM-DD)，移除可能的时间部分
  const dates = props.history.map(p => p.date.slice(0, 10))
  const navs = props.history.map(p => p.nav)
  const ma5 = props.history.map(p => p.ma5)
  const ma10 = props.history.map(p => p.ma10)
  const ma20 = props.history.map(p => p.ma20)

  // 优化2: 根据主题模式设置文本颜色
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151' // 使用 Tailwind gray-300 和 gray-700

  return {
    title: {
      text: props.title,
      left: 'center',
      textStyle: {
        color: textColor,
      },
    },
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['净值', 'MA5', 'MA10', 'MA20'],
      top: 30,
      textStyle: {
        color: textColor,
      },
    },
    grid: { top: 70, left: '10%', right: '10%', bottom: '10%' },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        color: textColor,
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: textColor,
      },
    },
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
