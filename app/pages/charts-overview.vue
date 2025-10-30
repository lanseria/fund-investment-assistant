<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import { appName } from '~/constants'

useHead({
  title: `策略视图 - ${appName}`,
})

const dayjs = useDayjs()
const holdingStore = useHoldingStore()
const fundList = computed(() => holdingStore.holdings)

// --- 筛选器与图表控制状态 ---
const strategyOptions = [
  { value: 'rsi', label: 'RSI 策略' },
  { value: 'macd', label: 'MACD 策略' },
  { value: 'ma_cross', label: '双均线交叉策略' },
  { value: 'bollinger_bands', label: '布林带策略' },
  { value: '', label: '基础走势' },
]
const dateFilterOptions = [
  { label: '近1个月', value: '1m', amount: 1, unit: 'month' },
  { label: '近3个月', value: '3m', amount: 3, unit: 'months' },
  { label: '近6个月', value: '6m', amount: 6, unit: 'months' },
  { label: '近1年', value: '1y', amount: 1, unit: 'year' },
  { label: '全部', value: 'all' }, // [新增] '全部' 选项
]

const selectedStrategy = ref('rsi')
const activeDateFilter = ref('3m')
// [新增] dataZoom 状态，由父组件统一控制
const dataZoomStart = ref(0)
const dataZoomEnd = ref(100)

// --- 数据获取逻辑 ---
const { data: chartData, pending, error, refresh } = useAsyncData(
  'charts-overview-data-full',
  async () => {
    if (fundList.value.length === 0)
      return []

    // [删除] 不再在 API 请求中传递 start_date
    const promises = fundList.value.map(async (fund) => {
      let chartApiData
      try {
        if (selectedStrategy.value === 'rsi') {
          // 获取完整的 RSI 数据
          chartApiData = await apiFetch(`/api/charts/rsi/${fund.code}`)
        }
        else {
          // 获取完整的历史数据
          chartApiData = await apiFetch(`/api/fund/holdings/${fund.code}/history`, {
            params: {
              strategy: selectedStrategy.value || undefined,
              ma: [5, 10, 20],
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
    // [修改] 只在策略变化时重新获取数据
    watch: [selectedStrategy],
  },
)

// [新增] 前端时间筛选逻辑
function setDateRange(period: string) {
  activeDateFilter.value = period
  if (!chartData.value || chartData.value.length === 0)
    return

  // 使用第一个基金的数据来计算日期范围
  const firstFund = chartData.value[0]!
  const dates = firstFund.strategy === 'rsi'
    ? (firstFund.data as RsiChartData).dates
    : (firstFund.data as any).history.map((p: any) => p.date)

  if (!dates || dates.length === 0)
    return

  const totalPoints = dates.length
  if (period === 'all') {
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
    return
  }

  const filter = dateFilterOptions.find(f => f.value === period)
  if (!filter || !filter.unit)
    return

  const targetDate = dayjs(dates[totalPoints - 1]).subtract(filter.amount, filter.unit as any)
  const startIndex = dates.findIndex((d: string) => dayjs(d).isAfter(targetDate))

  if (startIndex !== -1) {
    dataZoomStart.value = (startIndex / totalPoints) * 100
    dataZoomEnd.value = 100
  }
  else {
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
  }
}

// [新增] 数据加载完成后，应用默认的时间筛选
watch(chartData, (newData) => {
  if (newData && newData.length > 0)
    setDateRange(activeDateFilter.value)
}, { immediate: true })

onMounted(async () => {
  if (holdingStore.holdings.length === 0) {
    await holdingStore.fetchHoldings()
    await refresh()
  }
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <!-- 页面头部 -->
    <header class="mb-8">
      <h1 class="text-2xl font-bold sm:text-3xl">
        策略视图
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        在统一的策略和时间维度下，对比所有基金的走势。
      </p>
    </header>

    <!-- 筛选器面板 -->
    <div class="mb-8 p-4 card flex flex-wrap gap-4 items-center">
      <div>
        <label for="strategy-select" class="text-sm font-medium mr-2">策略选择:</label>
        <select id="strategy-select" v-model="selectedStrategy" class="input-base w-48">
          <option v-for="opt in strategyOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <div class="flex flex-grow flex-wrap gap-2 items-center">
        <label class="text-sm font-medium">时间范围:</label>
        <button
          v-for="filter in dateFilterOptions"
          :key="filter.value"
          class="text-sm px-3 py-1.5 rounded-md transition-colors"
          :class="[activeDateFilter === filter.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']"
          @click="setDateRange(filter.value)"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <!-- 加载与状态处理 -->
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

    <!-- 图表网格 -->
    <div v-else class="gap-6 grid grid-cols-1 lg:grid-cols-2">
      <OverviewChartCard
        v-for="fundData in chartData"
        :key="fundData!.code"
        :fund="fundData!"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
      />
    </div>
  </div>
</template>
