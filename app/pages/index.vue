<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'
import DashboardHeader from '~/components/dashboard/Header.vue'
import { appName } from '~/constants'

useHead({
  title: `持仓列表 - ${appName}`,
})

const holdingStore = useHoldingStore()
const { holdings, summary, sseStatus, isRefreshing } = storeToRefs(holdingStore)

// 数据获取
const { data: portfolioData, pending: isDataLoading, refresh } = await useAsyncData(
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
  isGroupedBySector,
  isHeldOnly,
  sortKey,
  sortOrder,
  displayData,
  handleSetSort,
  toggleGrouping,
  toggleHeldFilter,
} = useDashboardData(holdings)

// --- 模态框状态管理 ---
const isModalOpen = ref(false)
const editingHolding = ref<Holding | null>(null)
const modalTitle = computed(() => editingHolding.value ? '编辑基金' : '添加新基金')

// 交易模态框状态
const isTradeModalOpen = ref(false)
const isConvertModalOpen = ref(false)
const tradeTarget = ref<Holding | null>(null)
const tradeType = ref<'buy' | 'sell'>('buy')
const availableShares = ref(0)
const tradeTargetTransactions = ref<any[]>([]) // 新增

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
  tradeTargetTransactions.value = holding.recentTransactions || [] // 新增

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
    refresh()
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
    refresh()
  }
  catch (e) {
    console.error(e)
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

const isSectorModalOpen = ref(false)
const editingHoldingForSector = ref<Holding | null>(null)

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

function openSectorModal(holding: Holding) {
  editingHoldingForSector.value = holding
  isSectorModalOpen.value = true
}

async function handleSubmit(formData: any) {
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
async function handleExport() {
  await holdingStore.exportHoldings()
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
  const result = await holdingStore.importHoldings(file, overwrite)
  isImportModalOpen.value = false
  if (result)
    alert(`导入完成！成功: ${result.imported}, 跳过: ${result.skipped}`)
}

async function onSectorUpdateSuccess() {
  isSectorModalOpen.value = false
  await holdingStore.fetchHoldings()
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <MarketOverview />

    <DashboardHeader
      :is-refreshing="isRefreshing"
      :is-data-loading="!!isDataLoading"
      :is-processing-transactions="isProcessingTransactions"
      :is-held-only="isHeldOnly"
      :is-grouped-by-sector="isGroupedBySector"
      @refresh-estimates="holdingStore.refreshAllEstimates()"
      @refresh-data="refresh"
      @process-transactions="handleProcessTransactions"
      @toggle-held="toggleHeldFilter"
      @toggle-group="toggleGrouping"
      @import="isImportModalOpen = true"
      @export="handleExport"
      @copy-info="handleCopyInfo"
      @add-fund="openAddModal"
    />

    <PortfolioSummaryCard :summary="summary" :sse-status="sseStatus" />

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
      :is-grouped="isGroupedBySector"
      :sort-key="sortKey"
      :sort-order="sortOrder"
      @edit="openEditModal"
      @delete="handleDelete"
      @set-sort="handleSetSort"
      @clear-position="handleClearPosition"
      @edit-sector="openSectorModal"
      @trade="openTradeModal"
      @delete-transaction="handleDeleteTransaction"
    />

    <!-- Modals -->
    <Modal v-model="isModalOpen" :title="modalTitle">
      <AddEditHoldingForm
        :initial-data="editingHolding"
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
        @submit="handleConvertSubmit"
        @cancel="isConvertModalOpen = false"
      />
    </Modal>

    <Modal v-model="isImportModalOpen" title="导入持仓数据">
      <ImportHoldingForm @submit="handleImportSubmit" @cancel="isImportModalOpen = false" />
    </Modal>

    <Modal v-if="editingHoldingForSector" v-model="isSectorModalOpen" title="设置基金板块">
      <SectorEditModal
        :fund-code="editingHoldingForSector.code"
        :fund-name="editingHoldingForSector.name"
        :current-sector="editingHoldingForSector.sector"
        @success="onSectorUpdateSuccess"
        @cancel="isSectorModalOpen = false"
      />
    </Modal>
  </div>
</template>
