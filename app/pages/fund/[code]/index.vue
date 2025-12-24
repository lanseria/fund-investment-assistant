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

// --- Transaction Modal State ---
const isTransactionModalOpen = ref(false)
const selectedTransactionList = ref<any[]>([])

function openTransactionDetails(txList: any[]) {
  selectedTransactionList.value = txList
  isTransactionModalOpen.value = true
}

// 辅助函数：获取交易类型的显示文本和颜色
function getTransactionTypeInfo(type: string) {
  switch (type) {
    case 'buy': return { label: '买入', color: 'text-red-500' }
    case 'sell': return { label: '卖出', color: 'text-green-500' }
    case 'convert_in': return { label: '转换转入', color: 'text-purple-500' }
    case 'convert_out': return { label: '转换转出', color: 'text-blue-500' }
    default: return { label: type, color: 'text-gray-500' }
  }
}
function formatCurrency(val: any) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(Number(val))
}

const { data, pending, error, refresh } = await useAsyncData(
  `fund-all-strategies-structured-${code}`,
  async () => {
    const fetchGenericStrategy = (strategy: string = '') =>
      apiFetch(`/api/fund/holdings/${code}/history`, {
        params: {
          ma: [5, 10, 20, 120],
          strategy: strategy || undefined,
        },
      })
    const fetchRsiStrategy = () => apiFetch(`/api/charts/rsi/${code}`)

    // [新增] 获取区间涨跌幅数据
    const fetchPerformance = () => apiFetch<Record<string, number | null>>(`/api/fund/holdings/${code}/performance`)

    const [baseData, rsiData, macData, bollingerData, performanceData] = await Promise.all([
      fetchGenericStrategy(''),
      fetchRsiStrategy(),
      fetchGenericStrategy('macd'),
      fetchGenericStrategy('bollinger_bands'),
      fetchPerformance(), // [新增]
    ])

    return {
      base: baseData,
      rsi: rsiData,
      macd: macData,
      bollingerBands: bollingerData,
      performance: performanceData, // [新增]
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

// [新增] 辅助函数：获取特定区间的性能数据
function getPerformanceValue(key: string) {
  if (!data.value?.performance)
    return null
  return data.value.performance[key]
}

// [新增] 辅助函数：格式化显示
function formatPerformance(key: string) {
  const val = getPerformanceValue(key)
  if (val === null || val === undefined)
    return '--'
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
}

// [新增] 辅助函数：获取颜色样式
function getPerformanceClass(key: string) {
  const val = getPerformanceValue(key)
  if (val === null || val === undefined)
    return 'text-gray-400'
  if (val > 0)
    return 'text-red-500 dark:text-red-400'
  if (val < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
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

    <!-- [修改] 顶部数据卡片区域 -->
    <div class="mb-8 p-4 card">
      <div class="gap-2 grid grid-cols-3 md:grid-cols-7 sm:grid-cols-4">
        <button
          v-for="filter in dateFilters"
          :key="filter.value"
          class="p-2 border rounded-lg flex flex-col transition-all duration-200 items-center justify-center"
          :class="[
            activeFilter === filter.value
              ? 'bg-primary/5 border-primary shadow-sm'
              : 'border-transparent bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/30 dark:hover:bg-gray-700/60',
          ]"
          @click="setDateRange(filter.value)"
        >
          <!-- 标签 -->
          <span
            class="text-xs mb-1"
            :class="activeFilter === filter.value ? 'text-primary font-bold' : 'text-gray-500 dark:text-gray-400'"
          >
            {{ filter.label }}
          </span>

          <!-- 数值 -->
          <div class="flex h-6 items-center justify-center">
            <span v-if="!data && pending" class="i-carbon-circle-dash text-xs text-gray-400 animate-spin" />
            <span v-else class="text-sm font-bold font-numeric" :class="getPerformanceClass(filter.value)">
              {{ formatPerformance(filter.value) }}
            </span>
          </div>
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

    <div v-else-if="data" class="space-y-8">
      <!-- 监听 transaction-click 事件 -->
      <GenericStrategyChart
        :history="data.base.history"
        :signals="data.base.signals"
        :transactions="(data.base as any).transactions"
        :title="`基金 ${fundName} - 基础走势`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
        @transaction-click="openTransactionDetails"
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

    <!-- 策略信号模态框 -->
    <Modal v-model="isStrategyModalOpen" :title="`策略信号详情 (ID: ${selectedSignal?.id})`">
      <StrategyDetailModal :signal="selectedSignal" />
    </Modal>

    <!-- 交易详情模态框: 改为支持列表展示 -->
    <Modal v-model="isTransactionModalOpen" :title="`交易详情 (${selectedTransactionList.length}笔)`">
      <div v-if="selectedTransactionList.length > 0" class="pr-1 max-h-[60vh] overflow-y-auto space-y-4">
        <!-- 遍历交易列表 -->
        <div v-for="tx in selectedTransactionList" :key="tx.id" class="p-4 rounded-md bg-gray-100 dark:bg-gray-700">
          <div class="mb-2 flex items-baseline justify-between">
            <span class="text-lg font-bold" :class="getTransactionTypeInfo(tx.type).color">
              {{ getTransactionTypeInfo(tx.type).label }}
            </span>
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{ tx.orderDate }}
            </span>
          </div>

          <div class="text-sm pt-2 border-t gap-2 grid dark:border-gray-600">
            <div class="flex justify-between">
              <span class="text-gray-500">确认金额</span>
              <span class="font-mono">{{ tx.confirmedAmount ? formatCurrency(tx.confirmedAmount) : '-' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">确认份额</span>
              <span class="font-mono">{{ tx.confirmedShares ? `${Number(tx.confirmedShares).toFixed(2)} 份` : '-' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">确认净值</span>
              <span class="font-mono">{{ tx.confirmedNav ? Number(tx.confirmedNav).toFixed(4) : '-' }}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>
