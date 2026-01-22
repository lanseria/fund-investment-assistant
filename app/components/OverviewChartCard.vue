<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import MiniFundChart from '~/components/charts/MiniFundChart.vue'
import MiniRsiChart from '~/components/charts/MiniRsiChart.vue'
import { SECTOR_DICT_TYPE } from '~/constants'
import { dateFilterOptions } from '~/constants/chart'
import { formatCurrency } from '~/utils/format'

interface ChartCardData {
  code: string
  name: string
  strategy: string
  data: RsiChartData | { history: HoldingHistoryPoint[], signals: any[] }
  sector: string | null
  holdingAmount: number | null
  percentageChange: number | null
  todayEstimateProfitLoss: number | null
}

const props = defineProps<{
  fund: ChartCardData
  activeDateFilter: string
}>()

const dayjs = useDayjs()
const { getLabel } = useDictStore()

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
    <!-- 头部：基金名称和板块 -->
    <div class="p-3 border-b flex gap-2 items-baseline justify-between dark:border-gray-700">
      <div class="text-xs font-medium px-2 py-0.5 rounded-full flex-none" :class="fund.sector ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400'">
        {{ getLabel(SECTOR_DICT_TYPE, fund.sector) || '未分类' }}
      </div>
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
    <div v-if="fund.holdingAmount !== null" class="text-xs p-3 border-t flex items-center justify-between dark:border-gray-700">
      <div class="flex flex-col items-start">
        <span class="text-gray-500 dark:text-gray-400">持仓市值</span>
        <span class="font-numeric font-semibold">{{ formatCurrency(fund.holdingAmount) }}</span>
      </div>
      <div class="flex flex-col items-center">
        <span class="text-gray-500 dark:text-gray-400">今日涨跌</span>
        <span class="font-numeric font-semibold" :class="getChangeClass(fund.percentageChange)">
          {{ fund.percentageChange !== null ? `${fund.percentageChange > 0 ? '+' : ''}${fund.percentageChange.toFixed(2)}%` : '-' }}
        </span>
      </div>
      <div class="flex flex-col items-end">
        <span class="text-gray-500 dark:text-gray-400">预估盈亏</span>
        <span class="font-numeric font-semibold" :class="getChangeClass(fund.todayEstimateProfitLoss)">
          {{ formatCurrency(fund.todayEstimateProfitLoss) }}
        </span>
      </div>
    </div>
    <!-- 如果是仅关注，则显示提示信息 -->
    <div v-else class="text-xs text-gray-400 p-3 text-center border-t dark:border-gray-700">
      仅关注，无持仓信息
    </div>
  </div>
</template>
