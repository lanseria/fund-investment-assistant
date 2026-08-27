<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { EstimatePoint } from '~/types/chart'
import type { FundRealtimeDetail } from '~/types/realtime'
import type { SectorCapitalHistoryResponse } from '~/types/sector'
import SectorBehaviorSummary from '~/components/fund/SectorBehaviorSummary.vue'
import TransactionDetailModal from '~/components/fund/TransactionDetailModal.vue'
import GenericStrategyChart from '~/components/strategy-charts/GenericStrategyChart.vue'
import { appName } from '~/constants'

const route = useRoute<'fund-code'>()
const code = route.params.code as string
const targetUserId = route.query.userId ? Number(route.query.userId) : null

const holdingStore = useHoldingStore()
const { holdings } = storeToRefs(holdingStore)

// 获取当前基金的 holding 数据
const currentHolding = computed(() => holdingStore.holdings.find(h => h.code === code))

// 基金详情：懒加载不阻塞路由切换，进入页面后后台请求
const { data: fundDetail, pending: fundDetailPending, error: fundDetailError, refresh: refreshDetail } = useAsyncData(
  `fund-detail-${code}-${targetUserId || 'me'}`,
  () => apiFetch<any>(`/api/fund/holdings/${code}/detail`, {
    params: targetUserId ? { userId: targetUserId } : undefined,
  }),
  {
    lazy: true,
    server: false,
    default: () => null,
  },
)

// 板块主力行为回顾：仅当基金设置了项目板块时请求，懒加载不阻塞路由切换
const fundSector = computed(() => fundDetail.value?.sector ?? null)
const { data: sectorCapitalHistoryData, pending: sectorHistoryPending } = useAsyncData(
  `sector-capital-history-${code}`,
  () => fundSector.value
    ? apiFetch<SectorCapitalHistoryResponse>(`/api/sectors/${fundSector.value}/history`, {
        params: { days: 90 },
      }).catch(() => null)
    : Promise.resolve(null),
  {
    lazy: true,
    server: false,
    watch: [fundSector],
    default: () => null,
  },
)

// 板块主力行为历史：仅当已绑定东财板块且有快照数据时，才合并到基础走势图中
const mergedSectorHistory = computed(() => {
  const d = sectorCapitalHistoryData.value
  if (d && d.bound && d.history.dates.length > 0)
    return d.history
  return undefined
})

// 重仓股持仓明细：来自实时估值聚合接口(纯展示不落库)，失败时静默降级为 null 不阻塞页面
// 该接口需聚合多只重仓股实时行情、耗时较长，故改为客户端懒加载：不阻塞路由切换/SSR，进入页面后再后台请求
const { data: realtimeHoldings, pending: realtimeHoldingsPending } = useAsyncData(
  `fund-realtime-holdings-${code}`,
  () => apiFetch<FundRealtimeDetail>(`/api/fund/realtime/${code}`).catch(() => null),
  {
    lazy: true,
    server: false,
    default: () => null,
  },
)

// 当日盘中估值点：复用实时估值接口(无额外请求)，由「基础走势」图以虚线延伸到估值日期
const latestEstimate = computed<EstimatePoint | undefined>(() => {
  const r = realtimeHoldings.value
  if (!r?.estimateNav)
    return undefined
  const nav = Number(r.estimateNav)
  if (Number.isNaN(nav))
    return undefined
  return { date: r.estimateDate, nav, growthRate: r.estimateGrowthRate }
})

onMounted(async () => {
  // 如果直接通过链接进入，确保持仓数据加载以供后续"买入/卖出"模态框联调使用
  if (holdingStore.holdings.length === 0) {
    await holdingStore.fetchHoldings()
  }
})

// --- 策略信号详情模态框 ---
const isStrategyModalOpen = ref(false)
const selectedSignal = ref<Record<string, any> | null>(null)
function openSignalDetails(signal: Record<string, any>) {
  selectedSignal.value = signal
  isStrategyModalOpen.value = true
}

// --- 交易详情模态框（图表交易标注点点击） ---
const isTransactionModalOpen = ref(false)
const selectedTransactionList = ref<any[]>([])
function openTransactionDetails(txList: any[]) {
  selectedTransactionList.value = txList
  isTransactionModalOpen.value = true
}

// --- 买入/卖出/转换模态框 ---
const {
  isTradeModalOpen,
  isConvertModalOpen,
  tradeTarget,
  tradeType,
  availableShares,
  tradeTargetTransactions,
  openTradeModal,
  handleConvertSubmit,
  handleTradeSubmit,
} = useTradeModals()

// --- 策略图表数据（基础走势 / RSI / 布林带 / 区间涨跌 / dataZoom 区间筛选） ---
const {
  data,
  pending,
  error,
  refresh,
  rsiData,
  refreshRsi,
  bollingerSignalData,
  activeFilter,
  dataZoomStart,
  dataZoomEnd,
  setDateRange,
  dateFilters,
  performance,
} = useFundStrategyData(code, targetUserId)

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
    await refreshRsi() // 历史数据同步后 RSI 指标需重新计算
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
    await refreshRsi() // 策略重跑后 RSI 图信号可能变化
  }
  finally {
    isRunningStrategies.value = false
  }
}
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

    <!-- 基金详情总览：核心指标 / 我的持仓 / 区间涨跌 三区合一 -->
    <FundOverviewCard
      v-if="fundDetail"
      :detail="fundDetail"
      :holding="currentHolding"
      :filters="dateFilters"
      :active-filter="activeFilter"
      :performance="performance"
      :performance-loading="pending"
      @select-range="setDateRange"
    />
    <!-- 基金详情后台加载中/失败占位 -->
    <div v-else-if="fundDetailPending" class="mb-8 card flex h-100 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>
    <div v-else-if="fundDetailError" class="text-red-500 mb-8 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>基金详情加载失败: {{ fundDetailError.message }}</p>
    </div>

    <!-- 重仓股持仓明细(报告期持仓 + 最新行情快照；无股票仓位或数据源不可用时不展示) -->
    <FundHoldingsPanel
      v-if="realtimeHoldings?.holdings?.length"
      class="mb-8"
      :holdings="realtimeHoldings.holdings"
      :holdings-date="realtimeHoldings.holdingsDate"
    />
    <!-- 实时行情后台聚合中，数据到达后自动替换 -->
    <div v-else-if="realtimeHoldingsPending" class="mb-8 card flex h-40 items-center justify-center">
      <div i-carbon-circle-dash class="text-3xl text-primary animate-spin" />
    </div>

    <div v-if="pending" class="card flex h-100 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.message }}</p>
    </div>

    <div v-else-if="data" class="space-y-8">
      <!-- 监听 transaction-click 事件；板块主力行为 / RSI / 布林带策略数据存在时合并为同一张图（布林带信号子图位于 RSI 下方） -->
      <GenericStrategyChart
        :history="data.base.history"
        :signals="data.base.signals"
        :transactions="(data.base as any).transactions"
        :title="`基金 ${fundName} - 基础走势${mergedSectorHistory && sectorCapitalHistoryData?.sectorName ? ` · 板块「${sectorCapitalHistoryData.sectorName}」主力行为` : ''}`"
        :sector-history="mergedSectorHistory"
        :rsi-data="rsiData ?? undefined"
        :bollinger-data="bollingerSignalData"
        :estimate="latestEstimate"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
        @transaction-click="openTransactionDetails"
      />
    </div>

    <div v-else class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>没有找到该基金的历史数据。</p>
    </div>

    <!-- 板块主力行为：摘要与状态（图表已合并到上方「基础走势」走势图中） -->
    <SectorBehaviorSummary
      v-if="fundSector"
      :fund-sector="fundSector"
      :data="sectorCapitalHistoryData"
      :pending="sectorHistoryPending"
    />

    <!-- 策略信号模态框 -->
    <Modal v-model="isStrategyModalOpen" :title="`策略信号详情 (ID: ${selectedSignal?.id})`">
      <StrategyDetailModal :signal="selectedSignal" />
    </Modal>

    <!-- 交易详情模态框: 支持列表展示 -->
    <TransactionDetailModal v-model="isTransactionModalOpen" :transactions="selectedTransactionList" />

    <!-- 交易模态框 -->
    <Modal v-if="tradeTarget" v-model="isTradeModalOpen" :title="tradeType === 'buy' ? '买入基金' : '卖出基金'">
      <TradeForm
        :fund-code="tradeTarget.code"
        :fund-name="tradeTarget.name"
        :type="tradeType"
        :current-shares="availableShares"
        :current-market-value="tradeTarget.todayEstimateAmount || tradeTarget.holdingAmount || 0"
        :recent-transactions="tradeTargetTransactions"
        :fees="tradeTarget.fees"
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
