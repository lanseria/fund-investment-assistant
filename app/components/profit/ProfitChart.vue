<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { DailyProfitPoint } from '~/types/profit'

const props = defineProps<{
  history: DailyProfitPoint[]
}>()

const mode = ref<'rate' | 'amount'>('amount') // amount: 收益额, rate: 收益率

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  const dates = props.history.map(p => p.date)
  const values = props.history.map(p => mode.value === 'amount' ? p.totalProfit : p.totalProfitRate)

  const lineColor = mode.value === 'amount' ? '#f59e0b' : '#3b82f6' // 黄色金额，蓝色收益率
  const areaColor = mode.value === 'amount' ? '#f59e0b' : '#3b82f6'

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        const val = p.value
        const label = mode.value === 'amount' ? '累计收益' : '累计收益率'
        const unit = mode.value === 'amount' ? '元' : '%'
        return `${p.axisValue}<br/>${label}: <span style="font-weight:bold">${val}${unit}</span>`
      },
    },
    grid: { top: 30, right: 20, bottom: 20, left: 50, containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#e5e7eb' } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: textColor,
        // 确保返回值始终为 string 类型
        formatter: (val: number) => mode.value === 'rate' ? `${val}%` : `${val}`,
      },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#f3f4f6' } },
    },
    series: [
      {
        data: values,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: lineColor },
        areaStyle: { opacity: 0.1, color: areaColor },
      },
    ],
  } as EChartsOption // 显式断言为 EChartsOption
})
</script>

<template>
  <div class="mb-6 p-4 card">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-bold">
        收益走势
      </h3>
      <div class="p-1 rounded-lg bg-gray-100 flex dark:bg-gray-700">
        <button
          class="text-xs px-3 py-1 rounded-md transition-colors"
          :class="mode === 'amount' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary font-bold' : 'text-gray-500'"
          @click="mode = 'amount'"
        >
          收益金额
        </button>
        <button
          class="text-xs px-3 py-1 rounded-md transition-colors"
          :class="mode === 'rate' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary font-bold' : 'text-gray-500'"
          @click="mode = 'rate'"
        >
          收益率
        </button>
      </div>
    </div>

    <div class="h-64 w-full">
      <VChartFull :option="chartOption" autoresize />
    </div>
  </div>
</template>
