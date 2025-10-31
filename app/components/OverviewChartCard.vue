<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import MiniFundChart from '~/components/charts/MiniFundChart.vue'
import MiniRsiChart from '~/components/charts/MiniRsiChart.vue'
import { dateFilterOptions } from '~/constants/chart'

interface ChartCardData {
  code: string
  name: string
  strategy: string
  // data 是全量数据
  data: RsiChartData | { history: HoldingHistoryPoint[], signals: any[] }
}

const props = defineProps<{
  fund: ChartCardData
  activeDateFilter: string
}>()

const dayjs = useDayjs()

// [核心] 在卡片组件内部根据全量数据和筛选器，计算出需要传递给图表的数据切片
const slicedData = computed(() => {
  const period = props.activeDateFilter
  const isRsi = props.fund.strategy === 'rsi'

  // 1. 获取全量日期和数据
  const fullData = props.fund.data
  const allDates = isRsi
    ? (fullData as RsiChartData).dates
    : (fullData as { history: HoldingHistoryPoint[] }).history.map(p => p.date)

  if (!allDates || allDates.length === 0)
    return isRsi ? { dates: [], netValues: [], rsiValues: [], signals: { buy: [], sell: [] }, config: (fullData as RsiChartData).config } : { history: [], signals: [] }

  // 2. 计算起始索引
  const totalPoints = allDates.length
  let startIndex = 0
  if (period !== 'all') {
    const filter = dateFilterOptions.find(f => f.value === period)
    if (filter?.unit) {
      const targetDate = dayjs(allDates[totalPoints - 1]).subtract(filter.amount, filter.unit as any)
      const foundIndex = allDates.findIndex((d: string) => dayjs(d).isAfter(targetDate))
      if (foundIndex !== -1)
        startIndex = foundIndex
    }
  }

  // 3. 根据起始索引切片数据
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
    const genericData = fullData as { history: HoldingHistoryPoint[], signals: any[] }
    return {
      ...genericData,
      history: genericData.history.slice(startIndex),
    }
  }
})
</script>

<template>
  <div class="card overflow-hidden">
    <div class="p-3 border-b dark:border-gray-700">
      <NuxtLink :to="`/fund/${fund.code}`" class="text-sm font-semibold transition-colors hover:text-primary">
        {{ fund.name }}
        <span class="text-xs text-gray-400 font-normal font-numeric">({{ fund.code }})</span>
      </NuxtLink>
    </div>

    <div class="h-40">
      <template v-if="fund.strategy === 'rsi'">
        <MiniRsiChart :data="slicedData as RsiChartData" />
      </template>
      <template v-else>
        <MiniFundChart
          :history="(slicedData as any).history"
          :signals="(slicedData as any).signals"
        />
      </template>
    </div>
  </div>
</template>
