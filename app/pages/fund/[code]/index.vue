<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'
import GenericStrategyChart from '~/components/strategy-charts/GenericStrategyChart.vue'
import RsiStrategyChart from '~/components/strategy-charts/RsiStrategyChart.vue'
import { appName, SECTOR_DICT_TYPE } from '~/constants'
import { formatCurrency } from '~/utils/format'

const dayjs = useDayjs()
const route = useRoute<'fund-code'>()
const code = route.params.code as string
const targetUserId = route.query.userId ? Number(route.query.userId) : null

const holdingStore = useHoldingStore()
const { holdings } = storeToRefs(holdingStore)

// 获取当前基金的 holding 数据
const currentHolding = computed(() => holdingStore.holdings.find(h => h.code === code))
const { getLabel } = useDictStore()

// 请求新的基金详情接口
const { data: fundDetail, refresh: refreshDetail } = await useAsyncData(
  `fund-detail-${code}-${targetUserId || 'me'}`,
  () => apiFetch<any>(`/api/fund/holdings/${code}/detail`, {
    params: targetUserId ? { userId: targetUserId } : undefined,
  }),
)

onMounted(async () => {
  // 如果直接通过链接进入，确保持仓数据加载以供后续"买入/卖出"模态框联调使用
  if (holdingStore.holdings.length === 0) {
    await holdingStore.fetchHoldings()
  }
})

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

// --- 交易模态框状态 ---
const isTradeModalOpen = ref(false)
const isConvertModalOpen = ref(false)
const tradeTarget = ref<Holding | null>(null)
const tradeType = ref<'buy' | 'sell'>('buy')
const availableShares = ref(0)
const tradeTargetTransactions = ref<any[]>([])

// 辅助函数
function calculateAvailableShares(holding: Holding) {
  const currentShares = holding.shares || 0
  if (!holding.pendingTransactions)
    return currentShares
  const frozenShares = holding.pendingTransactions
    .filter(t => t.type === 'sell' || t.type === 'convert_out')
    .reduce((sum, t) => sum + (Number(t.orderShares) || 0), 0)
  return Math.max(0, currentShares - frozenShares)
}

function openTradeModal(holding: Holding, type: 'buy' | 'sell' | 'convert') {
  tradeTarget.value = holding
  availableShares.value = calculateAvailableShares(holding)
  tradeTargetTransactions.value = holding.recentTransactions || []

  if (type === 'convert') {
    isConvertModalOpen.value = true
  }
  else {
    tradeType.value = type
    isTradeModalOpen.value = true
  }
}

// 处理转换提交
async function handleConvertSubmit(payload: any) {
  try {
    await holdingStore.submitConversion(payload)
    isConvertModalOpen.value = false
    alert('转换申请已提交！\n将在卖出确认后自动处理买入。')
  }
  catch (e) {
    console.error(e)
  }
}

async function handleTradeSubmit(payload: any) {
  try {
    await holdingStore.submitTrade(payload)
    isTradeModalOpen.value = false
    alert('交易请求已记录！将在下一交易日净值更新后生效。')
  }
  catch (e) {
    console.error(e)
  }
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

const { data, pending, error, refresh } = await useAsyncData(
  `fund-all-strategies-structured-${code}`,
  async () => {
    const fetchGenericStrategy = (strategy: string = '') => {
      const params: any = { ma: [5, 10, 20, 120] }
      if (strategy)
        params.strategy = strategy
      if (targetUserId)
        params.userId = targetUserId

      return apiFetch(`/api/fund/holdings/${code}/history`, { params })
    }
    const fetchRsiStrategy = () => apiFetch(`/api/charts/rsi/${code}`)

    // 获取区间涨跌幅数据
    const fetchPerformance = () => apiFetch<Record<string, number | null>>(`/api/fund/holdings/${code}/performance`)

    // [新增] 获取板块历史量化决策信号
    const fetchSectorSignals = () => apiFetch<any[]>(`/api/fund/holdings/${code}/sector-signals`)

    const [baseData, rsiData, bollingerData, performanceData, sectorSignalsData] = await Promise.all([
      fetchGenericStrategy(''),
      fetchRsiStrategy(),
      fetchGenericStrategy('bollinger_bands'),
      fetchPerformance(),
      fetchSectorSignals(), // [新增]
    ])

    return {
      base: baseData,
      rsi: rsiData,
      bollingerBands: bollingerData,
      performance: performanceData,
      sectorSignals: sectorSignalsData, // [新增]
    }
  },
)

const { syncHistory: triggerSyncHistory, runStrategiesForFund } = holdingStore

const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : (fundDetail.value?.name || code)
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
    await refreshDetail() // 同步历史数据后，刷新详情面板
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
        <template v-if="!targetUserId">
          <button v-if="currentHolding" class="btn-primary btn flex items-center" @click="openTradeModal(currentHolding, 'buy')">
            <div mr-1 />
            买入
          </button>
          <button v-if="currentHolding && currentHolding.shares! > 0" class="btn flex items-center" @click="openTradeModal(currentHolding, 'sell')">
            <div mr-1 />
            卖出
          </button>
          <button v-if="currentHolding && currentHolding.shares! > 0" class="btn flex items-center" @click="openTradeModal(currentHolding, 'convert')">
            <div i-carbon-arrows-horizontal mr-1 />
            转换
          </button>
          <button class="btn flex items-center" :disabled="isRunningStrategies" @click="handleRunStrategies">
            <div i-carbon-bot :class="{ 'animate-pulse': isRunningStrategies }" mr-1 />
            {{ isRunningStrategies ? '分析中...' : '执行策略分析' }}
          </button>
          <button class="btn flex items-center" :disabled="isSyncing" @click="handleSyncHistory">
            <div i-carbon-update-now :class="{ 'animate-spin': isSyncing }" mr-1 />
            {{ isSyncing ? '同步中...' : '同步历史数据' }}
          </button>
        </template>
        <template v-else>
          <div class="text-sm text-blue-600 font-medium px-3 py-1.5 border border-blue-100 rounded-md bg-blue-50 flex gap-2 items-center dark:text-blue-300 dark:border-blue-800 dark:bg-blue-900/30">
            <div i-carbon-view />
            正在查看他人持仓详情
          </div>
        </template>
      </div>
    </header>

    <!-- [新增] 基金当日核心详情面板 -->
    <div v-if="fundDetail" class="mb-8 p-5 card flex flex-col gap-6 items-center justify-between from-white to-gray-50 bg-gradient-to-br md:flex-row dark:from-gray-800 dark:to-gray-800/80">
      <!-- 基本信息 -->
      <div class="flex flex-1 flex-col">
        <div class="flex gap-3 items-center">
          <span class="text-xl font-bold">{{ fundDetail.name }}</span>
          <span class="text-sm text-gray-500 font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{{ fundDetail.code }}</span>
          <span class="text-xs text-blue-600 px-2 py-0.5 border border-blue-100 rounded bg-blue-50 dark:text-blue-300 dark:border-blue-800 dark:bg-blue-900/30">
            {{ getLabel(SECTOR_DICT_TYPE, fundDetail.sector) || '未设置板块' }}
          </span>
        </div>
        <div class="text-xs text-gray-400 mt-2 flex gap-4">
          <span>类型: {{ fundDetail.fundType === 'qdii_lof' ? '场内/LOF' : '场外基金' }}</span>
          <span>更新时间: {{ fundDetail.todayEstimateUpdateTime ? dayjs(fundDetail.todayEstimateUpdateTime).format('YYYY-MM-DD HH:mm:ss') : '-' }}</span>
        </div>
      </div>

      <!-- 核心指标统计 -->
      <div class="flex flex-wrap gap-6 md:flex-nowrap">
        <div class="flex flex-col">
          <span class="text-xs text-gray-500 mb-1">最新净值</span>
          <span class="text-xl font-bold font-mono tabular-nums">{{ fundDetail.todayEstimateNav || fundDetail.yesterdayNav || '-' }}</span>
        </div>

        <div class="flex flex-col">
          <span class="text-xs text-gray-500 mb-1">估算涨跌</span>
          <span class="text-xl font-bold font-mono tabular-nums" :class="fundDetail.percentageChange > 0 ? 'text-red-500' : (fundDetail.percentageChange < 0 ? 'text-green-500' : 'text-gray-500')">
            {{ fundDetail.percentageChange !== null ? `${(fundDetail.percentageChange > 0 ? '+' : '') + fundDetail.percentageChange.toFixed(2)}%` : '-' }}
          </span>
        </div>

        <div class="flex flex-col">
          <span class="text-xs text-gray-500 mb-1">持仓市值</span>
          <span class="text-xl font-bold font-mono tabular-nums">{{ fundDetail.holdingAmount !== null ? formatCurrency(fundDetail.holdingAmount) : '--' }}</span>
        </div>

        <div class="flex flex-col">
          <span class="text-xs text-gray-500 mb-1">持仓收益</span>
          <div class="flex gap-1 items-baseline">
            <span class="text-xl font-bold font-mono tabular-nums" :class="fundDetail.holdingProfitAmount > 0 ? 'text-red-500' : (fundDetail.holdingProfitAmount < 0 ? 'text-green-500' : 'text-gray-500')">
              {{ fundDetail.holdingProfitAmount !== null ? (fundDetail.holdingProfitAmount > 0 ? '+' : '') + formatCurrency(fundDetail.holdingProfitAmount) : '--' }}
            </span>
            <span v-if="fundDetail.holdingProfitRate !== null" class="text-sm font-mono tabular-nums" :class="fundDetail.holdingProfitRate > 0 ? 'text-red-500' : (fundDetail.holdingProfitRate < 0 ? 'text-green-500' : 'text-gray-500')">
              ({{ fundDetail.holdingProfitRate > 0 ? '+' : '' }}{{ fundDetail.holdingProfitRate.toFixed(2) }}%)
            </span>
          </div>
        </div>
      </div>
    </div>

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
            <span v-else class="text-sm font-bold font-mono tabular-nums" :class="getPerformanceClass(filter.value)">
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
        :history="data.bollingerBands.history"
        :signals="data.bollingerBands.signals"
        :title="`基金 ${fundName} - 布林带策略`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
      />

      <!-- [新增] 板块量化决策历史图表 -->
      <GenericStrategyChart
        :history="data.base.history"
        :signals="data.sectorSignals || []"
        :title="`基金 ${fundName} - 板块量化决策`"
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

    <!-- 交易模态框 -->
    <Modal v-if="tradeTarget" v-model="isTradeModalOpen" :title="tradeType === 'buy' ? '买入基金' : '卖出基金'">
      <TradeForm
        :fund-code="tradeTarget.code"
        :fund-name="tradeTarget.name"
        :type="tradeType"
        :current-shares="availableShares"
        :current-market-value="tradeTarget.todayEstimateAmount || tradeTarget.holdingAmount || 0"
        :recent-transactions="tradeTargetTransactions"
        @submit="handleTradeSubmit"
        @cancel="isTradeModalOpen = false"
      />
    </Modal>

    <!-- 转换模态框 -->
    <Modal v-if="tradeTarget" v-model="isConvertModalOpen" title="基金转换">
      <ConvertForm
        :from-code="tradeTarget.code"
        :from-name="tradeTarget.name"
        :current-shares="availableShares"
        :available-funds="holdings"
        :recent-transactions="tradeTargetTransactions"
        @submit="handleConvertSubmit"
        @cancel="isConvertModalOpen = false"
      />
    </Modal>
  </div>
</template>
