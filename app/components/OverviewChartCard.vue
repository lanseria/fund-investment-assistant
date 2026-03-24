<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import MiniFundChart from '~/components/charts/MiniFundChart.vue'
import MiniRsiChart from '~/components/charts/MiniRsiChart.vue'
import { dateFilterOptions } from '~/constants/chart'
import { formatCurrency } from '~/utils/format'

interface ChartCardData {
  code: string
  name: string
  strategy: string
  data: RsiChartData | { history: HoldingHistoryPoint[], signals: any[] }
  holdingAmount: number | null
  percentageChange: number | null
  todayEstimateProfitLoss: number | null
}

const props = defineProps<{
  fund: ChartCardData
  activeDateFilter: string
}>()

const dayjs = useDayjs()

// --- 辅助函数 ---
function getChangeClass(value: number | null | undefined) {
  if (value === undefined || value === null)
    return 'text-gray'
  if (value > 0)
    return 'text-red-500 dark:text-red-400'
  if (value < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray'
}

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
  <div class="card flex flex-col overflow-hidden">
    <!-- 头部：基金名称 -->
    <div class="p-3 border-b flex gap-2 items-baseline justify-between dark:border-gray-700">
      <NuxtLink :to="`/fund/${fund.code}`" :title="fund.code" class="text-sm font-semibold truncate transition-colors hover:text-primary">
        {{ fund.name }}
      </NuxtLink>
    </div>

    <!-- 图表区域 -->
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

    <!-- 底部持仓信息 -->
    <div class="text-xs p-3 border-t flex items-center justify-between dark:border-gray-700">
      <div class="flex flex-col items-start">
        <span class="text-gray-500 dark:text-gray-400">持仓市值</span>
        <span class="font-mono font-semibold tabular-nums">
          {{ fund.holdingAmount !== null ? formatCurrency(fund.holdingAmount) : '--' }}
        </span>
      </div>
      <div class="flex flex-col items-center">
        <span class="text-gray-500 dark:text-gray-400">今日涨跌</span>
        <span class="font-mono font-semibold tabular-nums" :class="getChangeClass(fund.percentageChange)">
          {{ fund.percentageChange !== null ? `${fund.percentageChange > 0 ? '+' : ''}${fund.percentageChange.toFixed(2)}%` : '-' }}
        </span>
      </div>
      <div class="flex flex-col items-end">
        <span class="text-gray-500 dark:text-gray-400">预估盈亏</span>
        <span class="font-mono font-semibold tabular-nums" :class="fund.holdingAmount !== null ? getChangeClass(fund.todayEstimateProfitLoss) : ''">
          {{ fund.holdingAmount !== null ? formatCurrency(fund.todayEstimateProfitLoss) : '--' }}
        </span>
      </div>
    </div>
  </div>
</template>
