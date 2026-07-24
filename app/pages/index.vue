<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'
import DashboardHeader from '~/components/dashboard/Header.vue'
import { appName } from '~/constants'
import { formatCurrency } from '~/utils/format'

useHead({
  title: `持仓列表 - ${appName}`,
})

const authStore = useAuthStore()
const holdingStore = useHoldingStore()
const { holdings, summary, sseStatus, isRefreshing } = storeToRefs(holdingStore)

const todayTxsRef = ref<any>(null)

// 数据获取
const { data: portfolioData, pending: isDataLoading, refresh: _refreshHoldings } = await useAsyncData(
  'holdings',
  () => holdingStore.fetchHoldings(),
  { server: true },
)

watch(portfolioData, (newData) => {
  if (newData) {
    holdings.value = newData.holdings
    summary.value = newData.summary
  }
}, { immediate: true })

// --- 抽离的排序与分组逻辑 ---
const {
  isHeldOnly,
  sortKey,
  sortOrder,
  displayData,
  handleSetSort,
  toggleHeldFilter,
} = useDashboardData(holdings)

// --- 待办区：聚合所有持仓的待确认交易 ---
const pendingTodos = computed(() => {
  return holdings.value
    .filter(h => h.pendingTransactions && h.pendingTransactions.length > 0)
    .flatMap(h => (h.pendingTransactions || []).map(tx => ({ ...tx, fundName: h.name, fundCode: h.code })))
})
const pendingCount = computed(() => pendingTodos.value.length)

// --- 市场概览折叠状态 ---
const isMarketOpen = ref(false)

// --- 模态框状态管理 ---
const isModalOpen = ref(false)
const editingHolding = ref<Holding | null>(null)
const modalTitle = computed(() => editingHolding.value ? '编辑基金' : '添加新基金')
const isHoldingSubmitting = ref(false)

// 交易模态框状态
const isTradeModalOpen = ref(false)
const isConvertModalOpen = ref(false)
const isTradeSubmitting = ref(false)
const isConvertSubmitting = ref(false)
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
  isConvertSubmitting.value = true
  try {
    await holdingStore.submitConversion(payload)
    isConvertModalOpen.value = false
    alert('转换申请已提交！\n将在卖出确认后自动处理买入。')
    refresh()
  }
  catch (e) {
    console.error(e)
  }
  finally {
    isConvertSubmitting.value = false
  }
}

async function handleTradeSubmit(payload: any) {
  isTradeSubmitting.value = true
  try {
    await holdingStore.submitTrade(payload)
    isTradeModalOpen.value = false
    alert('交易请求已记录！将在下一交易日净值更新后生效。')
    refresh()
  }
  catch (e) {
    console.error(e)
  }
  finally {
    isTradeSubmitting.value = false
  }
}

async function handleDeleteTransaction(tx: any) {
  const typeText = tx.type === 'buy' ? '买入' : '卖出'
  const amountText = tx.type === 'buy' ? `金额 ${tx.orderAmount}元` : `份额 ${tx.orderShares}份`
  if (confirm(`确认撤销这笔交易申请吗？\n\n${typeText} - ${amountText}\n申请日期: ${tx.orderDate}`)) {
    try {
      await holdingStore.deleteTransaction(tx.id)
    }
    catch (e) {
      console.error(e)
    }
  }
}

function openAddModal() {
  editingHolding.value = null
  isModalOpen.value = true
}

function openEditModal(holding: Holding) {
  editingHolding.value = holding
  isModalOpen.value = true
}

function closeModal() {
  isModalOpen.value = false
}

async function handleSubmit(formData: any) {
  isHoldingSubmitting.value = true
  try {
    if (editingHolding.value)
      await holdingStore.updateHolding(formData.code, { shares: formData.shares, costPrice: formData.costPrice })
    else
      await holdingStore.addHolding(formData)
    closeModal()
  }
  catch (error) {
    console.error(error)
    alert('操作失败，请查看控制台获取更多信息。')
  }
  finally {
    isHoldingSubmitting.value = false
  }
}

async function handleDelete(holding: Holding) {
  if (confirm(`确定要删除基金 ${holding.name} (${holding.code}) 吗？`)) {
    try {
      await holdingStore.deleteHolding(holding.code)
    }
    catch (error) {
      console.error(error)
      alert('删除失败！')
    }
  }
}

async function handleClearPosition(holding: Holding) {
  if (confirm(`确定要清仓基金 ${holding.name} (${holding.code}) 吗？\n此操作会保留该基金为"仅关注"状态。`)) {
    try {
      await holdingStore.clearHoldingPosition(holding.code)
    }
    catch (error) {
      console.error(error)
      alert('清仓失败！')
    }
  }
}

const isProcessingTransactions = ref(false)
async function handleProcessTransactions() {
  if (isProcessingTransactions.value)
    return
  isProcessingTransactions.value = true
  try {
    const res: any = await apiFetch('/api/dev/process-transactions', { method: 'POST' })
    const { processed, skipped, skippedReasons } = res.result || {}
    let msg = `交易处理完成！\n成功: ${processed ?? 0}, 跳过: ${skipped ?? 0}`
    if (skippedReasons && skippedReasons.length > 0)
      msg += `\n\n跳过原因:\n${skippedReasons.join('\n')}`
    alert(msg)
    await refresh()
  }
  catch (e: any) {
    console.error(e)
    alert(`处理失败: ${e.data?.statusMessage || e.message}`)
  }
  finally {
    isProcessingTransactions.value = false
  }
}

const isImportModalOpen = ref(false)
const isImportSubmitting = ref(false)
async function handleExport() {
  await holdingStore.exportHoldings()
}

async function refresh() {
  await _refreshHoldings()
  if (todayTxsRef.value) {
    todayTxsRef.value.refresh()
  }
}

const { copy } = useClipboard({ legacy: true })
async function handleCopyInfo() {
  try {
    const contextData = await apiFetch('/api/user/context-data')
    await copy(JSON.stringify(contextData, null, 2))
    alert('持仓及市场信息（AI标准格式）已复制到剪贴板！')
  }
  catch (e) {
    console.error('复制失败', e)
    alert('获取数据或复制失败，请重试')
  }
}

async function handleImportSubmit({ file, overwrite }: { file: File, overwrite: boolean }) {
  isImportSubmitting.value = true
  try {
    const result = await holdingStore.importHoldings(file, overwrite)
    isImportModalOpen.value = false
    if (result)
      alert(`导入完成！成功: ${result.imported}, 跳过: ${result.skipped}`)
  }
  catch (error) {
    console.error(error)
    alert('导入失败，请查看控制台获取更多信息。')
  }
  finally {
    isImportSubmitting.value = false
  }
}

async function handleUpdateAttention(code: string, newLevel: number) {
  // 1. 乐观更新（Pinia store 中 holdings 是 deep reactive，直接修改即可响应）
  const index = holdingStore.holdings.findIndex(h => h.code === code)
  if (index !== -1) {
    holdingStore.holdings[index]!.attentionLevel = newLevel
  }

  // 2. 发起 API 请求更新后端
  try {
    await holdingStore.updateHolding(code, { attentionLevel: newLevel })
  }
  catch (error) {
    console.error('更新关注度失败:', error)
    await refresh() // 失败则回滚视图状态
  }
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <!-- 市场概览（默认折叠，降低噪音） -->
    <div class="mb-6">
      <button
        class="px-4 py-2 card flex w-full transition-colors items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="isMarketOpen = !isMarketOpen"
      >
        <span class="text-sm text-gray-600 font-semibold flex gap-2 items-center dark:text-gray-300">
          <div i-carbon-dashboard />
          市场速览
        </span>
        <div i-carbon-chevron-down class="text-gray-400 transition-transform" :class="{ 'rotate-180': isMarketOpen }" />
      </button>
      <Transition name="collapse">
        <div v-show="isMarketOpen" class="mt-2">
          <MarketOverview />
        </div>
      </Transition>
    </div>

    <DashboardHeader
      :is-refreshing="isRefreshing"
      :is-data-loading="!!isDataLoading"
      :is-processing-transactions="isProcessingTransactions"
      :is-held-only="isHeldOnly"
      @refresh-server-user="holdingStore.refreshServerEstimates('user')"
      @refresh-data="refresh"
      @process-transactions="handleProcessTransactions"
      @toggle-held="toggleHeldFilter"
      @import="isImportModalOpen = true"
      @export="handleExport"
      @copy-info="handleCopyInfo"
      @add-fund="openAddModal"
    />

    <PortfolioSummaryCard :summary="summary" :sse-status="sseStatus" />

    <!-- 待办区：有待确认交易时高亮提示（用户真正需要行动的信息） -->
    <div
      v-if="pendingCount > 0"
      class="mb-6 p-4 border border-amber-200 rounded-lg bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
    >
      <div class="flex items-center justify-between">
        <div class="flex gap-2 items-center">
          <div i-carbon-warning-alt class="text-lg text-amber-600 dark:text-amber-400" />
          <span class="text-sm text-amber-800 font-semibold dark:text-amber-300">
            待办：{{ pendingCount }} 笔交易待确认
          </span>
        </div>
        <button
          class="text-xs text-amber-700 font-medium underline dark:text-amber-400 hover:text-amber-900"
          @click="handleProcessTransactions"
        >
          处理待确认交易
        </button>
      </div>
      <!-- 待确认交易明细（折叠，最多展示3条） -->
      <div class="mt-3 space-y-1">
        <div
          v-for="tx in pendingTodos.slice(0, 3)"
          :key="tx.id"
          class="text-xs text-amber-700 flex gap-2 items-center dark:text-amber-400"
        >
          <span class="px-1 py-0.5 border border-amber-300 rounded dark:border-amber-700">{{ tx.type === 'buy' ? '买入' : tx.type === 'sell' ? '卖出' : tx.type === 'convert_in' ? '转入' : '转出' }}</span>
          <span>{{ tx.fundName }}</span>
          <span class="font-mono">{{ tx.orderAmount ? formatCurrency(tx.orderAmount) : `${Number(tx.orderShares).toFixed(2)} 份` }}</span>
          <span class="text-amber-500">{{ tx.status === 'draft' ? '(预操作)' : '(待确认)' }}</span>
        </div>
        <p v-if="pendingCount > 3" class="text-xs text-amber-500 pt-1">
          …还有 {{ pendingCount - 3 }} 笔
        </p>
      </div>
    </div>

    <!-- 插入今日操作组件 -->
    <TodayTransactionsCard v-if="authStore.user" ref="todayTxsRef" :user-id="authStore.user.id" class="mb-8" />

    <div v-if="isDataLoading" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>
    <div v-else-if="holdings.length === 0" class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>暂无持仓数据，请先添加基金。</p>
    </div>
    <div v-else-if="displayData.length === 0" class="text-gray-500 py-20 text-center card">
      <div i-carbon-filter-remove class="text-5xl mx-auto mb-4" />
      <p>当前筛选条件下无基金数据。</p>
    </div>
    <HoldingList
      v-else
      :data="displayData"
      :is-grouped="false"
      :sort-key="sortKey"
      :sort-order="sortOrder"
      @edit="openEditModal"
      @delete="handleDelete"
      @set-sort="handleSetSort"
      @clear-position="handleClearPosition"
      @trade="openTradeModal"
      @delete-transaction="handleDeleteTransaction"
      @update-attention="handleUpdateAttention"
    />

    <!-- Modals -->
    <Modal v-model="isModalOpen" :title="modalTitle">
      <AddEditHoldingForm
        :initial-data="editingHolding"
        :loading="isHoldingSubmitting"
        @submit="handleSubmit"
        @cancel="closeModal"
      />
    </Modal>

    <Modal v-if="tradeTarget" v-model="isTradeModalOpen" :title="tradeType === 'buy' ? '买入基金' : '卖出基金'">
      <TradeForm
        :fund-code="tradeTarget.code"
        :fund-name="tradeTarget.name"
        :type="tradeType"
        :current-shares="availableShares"
        :current-market-value="tradeTarget.todayEstimateAmount || tradeTarget.holdingAmount || 0"
        :recent-transactions="tradeTargetTransactions"
        :fees="tradeTarget.fees"
        :loading="isTradeSubmitting"
        @submit="handleTradeSubmit"
        @cancel="isTradeModalOpen = false"
      />
    </Modal>

    <Modal v-if="tradeTarget" v-model="isConvertModalOpen" title="基金转换">
      <ConvertForm
        :from-code="tradeTarget.code"
        :from-name="tradeTarget.name"
        :current-shares="availableShares"
        :available-funds="holdings"
        :recent-transactions="tradeTargetTransactions"
        :fees="tradeTarget.fees"
        :loading="isConvertSubmitting"
        @submit="handleConvertSubmit"
        @cancel="isConvertModalOpen = false"
      />
    </Modal>

    <Modal v-model="isImportModalOpen" title="导入持仓数据">
      <ImportHoldingForm :loading="isImportSubmitting" @submit="handleImportSubmit" @cancel="isImportModalOpen = false" />
    </Modal>
  </div>
</template>

<style scoped>
/* 市场概览折叠动画 */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 1000px;
}
</style>
