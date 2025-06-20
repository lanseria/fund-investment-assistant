<!-- File: app/pages/fund/[code].vue -->
<script setup lang="ts">
import type { HoldingHistoryPoint } from '~/types/holding'
import { appName } from '~/constants'

const dayjs = useDayjs()
const route = useRoute<'fund-code'>()
const code = route.params.code as string

// [修改] 定义需要展示的所有策略图表
const strategiesToDisplay = [
  { value: '', label: '基础走势' },
  { value: 'rsi', label: 'RSI 策略' },
  { value: 'bollinger_bands', label: '布林带策略' },
  { value: 'ma_cross', label: '双均线交叉策略' },
  { value: 'dual_confirmation', label: '双重确认策略' },
]

// --- State for Chart Controls (remains the same) ---
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

// --- Modal State (remains the same) ---
const isStrategyModalOpen = ref(false)
const selectedSignal = ref<Record<string, any> | null>(null)
function openSignalDetails(signal: Record<string, any>) {
  selectedSignal.value = signal
  isStrategyModalOpen.value = true
}

// [重大修改] 使用 useAsyncData 和 Promise.all 一次性获取所有策略的数据
const { data, pending, error, refresh } = await useAsyncData(
  `fund-all-strategies-${code}`,
  async () => {
    // 为每个策略创建一个 fetch Promise
    const promises = strategiesToDisplay.map(strategy =>
      $fetch<{ history: HoldingHistoryPoint[], signals: any[] }>(`/api/fund/holdings/${code}/history`, {
        params: {
          ma: [5, 10, 20],
          strategy: strategy.value || undefined,
        },
      }).then(response => ({
        // 将策略的元信息（label, value）和API返回的数据合并
        ...strategy,
        history: response.history,
        signals: response.signals,
      })),
    )
    // 并发执行所有请求并等待结果
    return Promise.all(promises)
  },
)

const holdingStore = useHoldingStore()
const { syncHistory: triggerSyncHistory, runAllStrategies: triggerRunStrategies } = holdingStore

const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : code
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
    await triggerRunStrategies()
    await refresh()
  }
  finally {
    isRunningStrategies.value = false
  }
}

useHead({
  title: () => `策略分析: ${fundName.value} (${code}) - ${appName}`,
})

// [修改] setDateRange 现在作用于所有图表
function setDateRange(period: string) {
  activeFilter.value = period
  // 使用第一个图表的历史数据来计算，因为所有图表的 history 是一样的
  const historyData = data.value?.[0]?.history
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

// [修改] 页面加载或数据获取完成后，设置一个默认的缩放范围
watch(data, (newData) => {
  if (newData && newData.length > 0)
    setDateRange('1y') // 默认显示近1年
}, { immediate: true })
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8 flex items-center justify-between">
      <NuxtLink to="/" class="text-sm text-gray-500 inline-flex gap-2 transition-colors items-center hover:text-teal-500">
        <div i-carbon-arrow-left />
        返回持仓列表
      </NuxtLink>
      <!-- [修改] 将按钮组放在一个 div 中 -->
      <div class="flex gap-2 items-center">
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

    <!-- [修改] 控制面板不再有策略选择器 -->
    <div class="mb-8 p-4 card">
      <div class="flex flex-wrap gap-2">
        <button v-for="filter in dateFilters" :key="filter.value" class="text-sm px-3 py-1.5 rounded-md transition-colors" :class="[activeFilter === filter.value ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']" @click="setDateRange(filter.value)">
          {{ filter.label }}
        </button>
      </div>
    </div>

    <!-- --- Loading and Error States --- -->
    <div v-if="pending" class="card flex h-100 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.message }}</p>
    </div>

    <!-- [重大修改] 使用 v-for 循环渲染所有图表 -->
    <div v-else-if="data && data.length > 0" class="space-y-8">
      <div
        v-for="chartData in data"
        :key="chartData.value"
        class="p-4 card"
      >
        <FundChart
          :history="chartData.history"
          :signals="chartData.signals"
          :title="`基金 ${fundName} - ${chartData.label}`"
          :data-zoom-start="dataZoomStart"
          :data-zoom-end="dataZoomEnd"
          @signal-click="openSignalDetails"
        />˚
      </div>
    </div>
    <div v-else class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>没有找到该基金的历史数据。</p>
    </div>

    <!-- --- Modal (remains the same) --- -->
    <Modal v-model="isStrategyModalOpen" :title="`策略信号详情 (ID: ${selectedSignal?.id})`">
      <StrategyDetailModal :signal="selectedSignal" />
    </Modal>
  </div>
</template>
