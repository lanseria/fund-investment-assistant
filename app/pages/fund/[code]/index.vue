<script setup lang="ts">
// [新增] 导入新创建的组件
import GenericStrategyChart from '~/components/strategy-charts/GenericStrategyChart.vue'
import RsiStrategyChart from '~/components/strategy-charts/RsiStrategyChart.vue'
import { appName } from '~/constants'

const dayjs = useDayjs()
const route = useRoute<'fund-code'>()
const code = route.params.code as string

const activeFilter = ref<string | null>(null)
const dataZoomStart = ref(50)
const dataZoomEnd = ref(100)

const dateFilters = [
  { label: '近1个月', value: '1m', amount: 1, unit: 'month' },
  { label: '近3个月', value: '3m', amount: 3, unit: 'months' },
  { label: '近6个月', value: '6m', amount: 6, unit: 'months' },
  { label: '近1年', value: '1y', amount: 1, unit: 'year' },
  { label: '近2年', value: '2y', amount: 2, unit: 'years' },
  { label: '近5年', value: '5y', amount: 5, unit: 'years' },
  { label: '全部', value: 'all' },
]

// --- Modal State ---
const isStrategyModalOpen = ref(false)
const selectedSignal = ref<Record<string, any> | null>(null)
function openSignalDetails(signal: Record<string, any>) {
  selectedSignal.value = signal
  isStrategyModalOpen.value = true
}

// [重大修改] 更新 useAsyncData，使其返回一个结构化对象
const { data, pending, error, refresh } = await useAsyncData(
  `fund-all-strategies-structured-${code}`,
  async () => {
    // 定义获取通用策略数据的函数
    const fetchGenericStrategy = (strategy: string = '') =>
      apiFetch(`/api/fund/holdings/${code}/history`, {
        params: {
          ma: [5, 10, 20],
          strategy: strategy || undefined,
        },
      })

    // 定义获取 RSI 策略数据的函数
    const fetchRsiStrategy = () => apiFetch(`/api/charts/rsi/${code}`)

    // 并发执行所有请求
    const [
      baseData,
      rsiData,
      macData,
      maCrossData,
      bollingerData,
    ] = await Promise.all([
      fetchGenericStrategy(''),
      fetchRsiStrategy(),
      fetchGenericStrategy('macd'),
      fetchGenericStrategy('ma_cross'),
      fetchGenericStrategy('bollinger_bands'),
    ])

    // 返回一个结构清晰的对象
    return {
      base: baseData,
      rsi: rsiData,
      macd: macData,
      maCross: maCrossData,
      bollingerBands: bollingerData,
    }
  },
)

const holdingStore = useHoldingStore()
const { syncHistory: triggerSyncHistory, runStrategiesForFund } = holdingStore

const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : code
})

useHead({
  title: () => `策略分析: ${fundName.value} (${code}) - ${appName}`,
})

const isSyncing = ref(false)
async function handleSyncHistory() {
  isSyncing.value = true
  try {
    await triggerSyncHistory(code)
    await refresh()
  }
  finally {
    isSyncing.value = false
  }
}

const isRunningStrategies = ref(false)
async function handleRunStrategies() {
  isRunningStrategies.value = true
  try {
    await runStrategiesForFund(code)
    await refresh()
  }
  finally {
    isRunningStrategies.value = false
  }
}

function setDateRange(period: string) {
  activeFilter.value = period
  // 现在可以安全地从 data.base.history 获取日期信息
  const historyData = data.value?.base.history
  if (!historyData || historyData.length === 0)
    return

  const totalPoints = historyData.length
  if (period === 'all') {
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
    return
  }

  const filter = dateFilters.find(f => f.value === period)
  if (!filter || !filter.unit)
    return

  const targetDate = dayjs(historyData[totalPoints - 1]!.date).subtract(filter.amount, filter.unit as any)
  const startIndex = historyData.findIndex(p => dayjs(p.date).isAfter(targetDate))

  if (startIndex !== -1) {
    dataZoomStart.value = (startIndex / totalPoints) * 100
    dataZoomEnd.value = 100
  }
  else {
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
  }
}

watch(data, (newData) => {
  if (newData)
    setDateRange('3m')
}, { immediate: true })
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8 flex items-center justify-between">
      <div class="text-sm text-gray-500 inline-flex gap-2 cursor-pointer transition-colors items-center hover:text-primary-hover" @click="$router.back()">
        <div i-carbon-arrow-left />
        返回持仓列表
      </div>
      <div class="flex gap-3">
        <button class="btn flex items-center" :disabled="isRunningStrategies" @click="handleRunStrategies">
          <div i-carbon-bot :class="{ 'animate-pulse': isRunningStrategies }" mr-1 />
          {{ isRunningStrategies ? '分析中...' : '执行策略分析' }}
        </button>
        <button class="btn flex items-center" :disabled="isSyncing" @click="handleSyncHistory">
          <div i-carbon-update-now :class="{ 'animate-spin': isSyncing }" mr-1 />
          {{ isSyncing ? '同步中...' : '同步历史数据' }}
        </button>
      </div>
    </header>

    <div class="mb-8 p-4 card">
      <div class="flex flex-wrap gap-2">
        <button v-for="filter in dateFilters" :key="filter.value" class="text-sm px-3 py-1.5 rounded-md transition-colors" :class="[activeFilter === filter.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']" @click="setDateRange(filter.value)">
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div v-if="pending" class="card flex h-100 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.message }}</p>
    </div>

    <!-- [重大修改] 显式调用每个策略图表组件 -->
    <div v-else-if="data" class="space-y-8">
      <GenericStrategyChart
        :history="data.base.history"
        :signals="data.base.signals"
        :title="`基金 ${fundName} - 基础走势`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
      />

      <RsiStrategyChart
        :chart-data="data.rsi"
        :title="`基金 ${fundName} - RSI 策略`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
      />

      <GenericStrategyChart
        :history="data.macd.history"
        :signals="data.macd.signals"
        :title="`基金 ${fundName} - MACD 策略`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
      />

      <GenericStrategyChart
        :history="data.maCross.history"
        :signals="data.maCross.signals"
        :title="`基金 ${fundName} - 双均线交叉策略`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
      />

      <GenericStrategyChart
        :history="data.bollingerBands.history"
        :signals="data.bollingerBands.signals"
        :title="`基金 ${fundName} - 布林带策略`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
      />
    </div>

    <div v-else class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>没有找到该基金的历史数据。</p>
    </div>

    <Modal v-model="isStrategyModalOpen" :title="`策略信号详情 (ID: ${selectedSignal?.id})`">
      <StrategyDetailModal :signal="selectedSignal" />
    </Modal>
  </div>
</template>
