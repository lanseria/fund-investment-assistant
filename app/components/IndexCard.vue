<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { MarketIndexData } from '~~/server/utils/dataFetcher'

const props = defineProps<{
  data: MarketIndexData
}>()

const isPositive = computed(() => props.data.changeAmount >= 0)

const colorClass = computed(() => {
  if (props.data.changeAmount > 0)
    return 'text-red-500 dark:text-red-400'
  if (props.data.changeAmount < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500 dark:text-gray-400'
})

const chartOption = computed<EChartsOption>(() => {
  const chartColor = isPositive.value ? '#ef4444' : '#22c55e'
  return {
    grid: { top: 5, right: 5, bottom: 5, left: 5 },
    xAxis: {
      type: 'category',
      show: false,
      data: props.data.chartData.map(p => p[0]),
    },
    yAxis: {
      type: 'value',
      show: false,
      min: 'dataMin',
      max: 'dataMax',
    },
    series: [{
      data: props.data.chartData.map(p => p[1]),
      type: 'line',
      showSymbol: false,
      smooth: true,
      lineStyle: { color: chartColor, width: 2 },
      areaStyle: {
        color: chartColor,
        opacity: 0.1,
      },
    }],
  }
})
</script>

<template>
  <div class="p-3 card flex flex-col h-32">
    <!-- Top Section -->
    <div class="flex items-baseline justify-between">
      <span class="font-semibold">{{ data.name }}</span>
      <div class="font-numeric font-semibold flex flex-col items-end" :class="colorClass">
        <span>{{ data.value.toFixed(2) }}</span>
        <div class="text-xs font-normal flex gap-2">
          <span>{{ data.changeAmount > 0 ? '+' : '' }}{{ data.changeAmount.toFixed(2) }}</span>
          <span>{{ data.changeRate > 0 ? '+' : '' }}{{ data.changeRate.toFixed(2) }}%</span>
        </div>
      </div>
    </div>
    <!-- Chart Section -->
    <div class="mt-1 flex-grow -mx-3 -mb-3">
      <VChartFull v-if="data.chartData && data.chartData.length > 0" :option="chartOption" autoresize />
      <div v-else class="text-xs text-gray-400 flex h-full items-center justify-center">
        暂无走势
      </div>
    </div>
  </div>
</template>
