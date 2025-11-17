<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import MiniFundChart from '~/components/charts/MiniFundChart.vue'
import MiniRsiChart from '~/components/charts/MiniRsiChart.vue'
import { apiFetch } from '~/utils/api'

const props = defineProps<{
  fundCode: string
  strategyKey: string
}>()

// 1. 获取全量数据，不再传递 start_date 参数
const { data: chartData, pending, error } = useAsyncData(
  `strategy-tooltip-${props.fundCode}-${props.strategyKey}`,
  async () => {
    if (props.strategyKey === 'rsi') {
      return await apiFetch<RsiChartData>(`/api/charts/rsi/${props.fundCode}`)
    }
    else {
      return await apiFetch(`/api/fund/holdings/${props.fundCode}/history`, {
        params: {
          strategy: props.strategyKey,
          ma: [5, 20, 120],
        },
      })
    }
  },
  {
    watch: [() => props.fundCode, () => props.strategyKey],
  },
)

// 2. [核心] 新增 computed 属性，用于在客户端对全量数据进行切片
const slicedChartData = computed(() => {
  if (!chartData.value)
    return null

  const isRsi = props.strategyKey === 'rsi'
  const fullData = chartData.value

  const allDates = isRsi
    ? (fullData as RsiChartData).dates
    : (fullData as any).history.map((p: any) => p.date)

  if (!allDates || allDates.length === 0)
    return fullData // 如果没数据，直接返回

  // 计算起始索引
  const dayjs = useDayjs()
  const totalPoints = allDates.length
  const lastDate = allDates[totalPoints - 1]
  const targetDate = dayjs(lastDate).subtract(3, 'months')
  let startIndex = allDates.findIndex((d: string) => dayjs(d).isAfter(targetDate))

  // 如果找不到（所有数据都在3个月前），则从头开始
  if (startIndex === -1)
    startIndex = 0

  // 根据类型对数据进行切片
  if (isRsi) {
    const rsiData = fullData as RsiChartData
    return {
      ...rsiData,
      dates: rsiData.dates.slice(startIndex),
      netValues: rsiData.netValues.slice(startIndex),
      rsiValues: rsiData.rsiValues.slice(startIndex),
    }
  }
  else {
    const genericData = fullData as any
    return {
      ...genericData,
      history: genericData.history.slice(startIndex),
    }
  }
})
</script>

<template>
  <div class="p-2 border card bg-white h-40 w-64 shadow-lg dark:bg-gray-800">
    <div v-if="pending" class="flex h-full items-center justify-center">
      <div i-carbon-circle-dash class="text-2xl text-primary animate-spin" />
    </div>
    <div v-else-if="error" class="text-xs text-red-500 text-center flex h-full items-center justify-center">
      加载失败: {{ error.message }}
    </div>
    <!-- 3. [修改] 使用切片后的数据 (slicedChartData) 来渲染图表 -->
    <div v-else-if="slicedChartData" class="h-full w-full">
      <template v-if="strategyKey === 'rsi'">
        <MiniRsiChart :data="slicedChartData as RsiChartData" />
      </template>
      <template v-else>
        <MiniFundChart
          :history="(slicedChartData as any).history"
          :signals="(slicedChartData as any).signals"
        />
      </template>
    </div>
  </div>
</template>
