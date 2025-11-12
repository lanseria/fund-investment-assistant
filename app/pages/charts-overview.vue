<script setup lang="ts">
import { appName } from '~/constants'
import { dateFilterOptions } from '~/constants/chart'

useHead({
  title: `策略视图 - ${appName}`,
})

const holdingStore = useHoldingStore()
const fundList = computed(() => holdingStore.holdings)

const strategySelectOptions = [
  { value: 'rsi', label: 'RSI 策略' },
  { value: 'macd', label: 'MACD 策略' },
  { value: 'ma_cross', label: '双均线交叉策略' },
  { value: 'bollinger_bands', label: '布林带策略' },
  { value: '', label: '基础走势' },
]

const selectedStrategy = ref('rsi')
const activeDateFilter = ref('3m')

const { data: chartData, pending, error, refresh } = useAsyncData(
  'charts-overview-data-full',
  async () => {
    if (fundList.value.length === 0)
      return []

    const promises = fundList.value.map(async (fund) => {
      let chartApiData
      try {
        if (selectedStrategy.value === 'rsi') {
          chartApiData = await apiFetch(`/api/charts/rsi/${fund.code}`)
        }
        else {
          chartApiData = await apiFetch(`/api/fund/holdings/${fund.code}/history`, {
            params: {
              strategy: selectedStrategy.value || undefined,
              ma: [5, 10, 20, 120],
            },
          })
        }
        return {
          code: fund.code,
          name: fund.name,
          strategy: selectedStrategy.value,
          data: chartApiData,
        }
      }
      catch (e) {
        console.error(`加载基金 ${fund.code} 的图表数据失败:`, e)
        return null
      }
    })

    const results = await Promise.all(promises)
    return results.filter(Boolean)
  },
  {
    watch: [selectedStrategy],
  },
)

onMounted(async () => {
  if (holdingStore.holdings.length === 0) {
    await holdingStore.fetchHoldings()
    await refresh()
  }
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8">
      <h1 class="text-2xl font-bold sm:text-3xl">
        策略视图
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        在统一的策略和时间维度下，对比所有基金的走势。
      </p>
    </header>

    <div class="mb-8 p-4 card flex flex-wrap gap-4 items-center justify-start">
      <div class="flex gap-2 items-center">
        <label for="strategy-select" class="text-sm font-medium mr-2">策略选择:</label>
        <CustomSelect
          id="strategy-select"
          v-model="selectedStrategy"
          :options="strategySelectOptions"
          class="w-48"
        />
      </div>
      <div class="flex flex-grow flex-wrap gap-2 items-center">
        <label class="text-sm font-medium">时间范围:</label>
        <button
          v-for="filter in dateFilterOptions"
          :key="filter.value"
          class="text-sm px-3 py-1.5 rounded-md transition-colors"
          :class="[activeDateFilter === filter.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']"
          @click="activeDateFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div v-if="pending" class="card flex h-96 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
      <span class="text-lg ml-4">正在加载图表...</span>
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.message }}</p>
    </div>
    <div v-else-if="!chartData || chartData.length === 0" class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>暂无持仓基金或无法加载图表数据。</p>
    </div>

    <!-- [重大修改] 更新网格布局以实现更好的响应式 -->
    <div v-else class="gap-4 grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2 xl:grid-cols-4">
      <OverviewChartCard
        v-for="fundData in chartData"
        :key="fundData!.code"
        :fund="fundData!"
        :active-date-filter="activeDateFilter"
      />
    </div>
  </div>
</template>
