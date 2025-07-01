<!-- eslint-disable no-console -->
<!-- eslint-disable no-alert -->
<!-- File: app/pages/index.vue -->
<script setup lang="ts">
import type { Holding, HoldingSummary, SortableKey } from '~/types/holding' // 引入 HoldingSummary
import { appName } from '~/constants'

const router = useRouter()
const route = useRoute()

useHead({
  title: `持仓列表 - ${appName}`,
})
const holdingStore = useHoldingStore()
// 从 store 中解构出状态和 action
const { holdings, isLoading, isRefreshing, summary } = storeToRefs(holdingStore)
const { refreshAllEstimates } = holdingStore

// 1. [保持不变] 首次数据加载，对 SSR 和首屏至关重要
const { pending: isDataLoading } = await useAsyncData(
  'holdings',
  async () => {
    const data = await apiFetch<{ holdings: Holding[], summary: HoldingSummary }>('/api/fund/holdings/')
    if (data) {
      holdingStore.holdings = data.holdings
      holdingStore.summary = data.summary
    }
    return data
  },
)
watch(isDataLoading, (loading) => {
  holdingStore.isLoading = loading
})

// 2. [重要修改] 使用 useEventSource
const sseUrl = ref('')
const { status: sseStatus, data: sseData, open: sseOpen, close: sseClose } = useEventSource(
  sseUrl, // 使用 ref，以便在 onMounted 中动态设置
  [],
  {
    // immediate: false 确保我们能先设置 URL 再连接
    immediate: false,
  },
)
const sseStatusText = computed(() => {
  switch (sseStatus.value) {
    case 'OPEN':
      return '实时更新中'
    case 'CONNECTING':
      return '连接中...'
    case 'CLOSED':
      return '已断开'
    default:
      return '未知状态'
  }
})

// 3. 监听 SSE 数据变化并更新 store
watch(sseData, (newData) => {
  if (newData) {
    try {
      const updatedData = JSON.parse(newData) as { holdings: Holding[], summary: HoldingSummary }
      console.log('[SSE] Received data update via useEventSource:', updatedData)

      holdingStore.holdings = updatedData.holdings
      holdingStore.summary = updatedData.summary
    }
    catch (e) {
      console.error('[SSE] Failed to parse message data:', e)
    }
  }
})

// 4. 在 onMounted 中建立连接，在 onUnmounted 中断开
onMounted(() => {
  const authToken = useCookie('auth-token')
  if (authToken.value) {
    // 动态设置带 token 的 URL
    sseUrl.value = `/api/sse/holdings?token=${authToken.value}`
    // 手动开启连接
    sseOpen()
    console.log('[SSE] Opening connection to', sseUrl.value)
  }
  else {
    console.warn('No auth token found, SSE connection will not be established.')
  }
})

onUnmounted(() => {
  // 手动关闭连接
  sseClose()
  console.log('[SSE] Connection closed.')
})

const sortKey = ref<SortableKey>((route.query.sort as SortableKey) || 'holdingAmount')
const sortOrder = ref<'asc' | 'desc'>((route.query.order as 'asc' | 'desc') || 'desc')
function handleSetSort(key: SortableKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortOrder.value = 'desc'
  }
  router.replace({ query: { sort: sortKey.value, order: sortOrder.value } })
}

// --- 模态框状态管理 ---
const isModalOpen = ref(false)
const editingHolding = ref<Holding | null>(null)
const modalTitle = computed(() => editingHolding.value ? '编辑基金' : '添加新基金')

function formatCurrency(value: number | undefined) {
  if (value === undefined)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}

function getChangeClass(value: number | undefined) {
  if (value === undefined || value === null)
    return 'text-gray'
  if (value > 0)
    return 'text-red-500 dark:text-red-400'
  if (value < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray'
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
  try {
    if (editingHolding.value) {
      await holdingStore.updateHolding(formData.code, { holdingAmount: formData.holdingAmount, holdingProfitRate: formData.holdingProfitRate })
    }
    else {
      await holdingStore.addHolding(formData)
    }
    closeModal()
  }
  catch (error) {
    console.error(error)
    alert('操作失败，请查看控制台获取更多信息。')
  }
}

async function handleRefresh() {
  await refreshAllEstimates()
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

const isImportModalOpen = ref(false)

async function handleExport() {
  await holdingStore.exportHoldings()
}

async function handleImportSubmit({ file, overwrite }: { file: File, overwrite: boolean }) {
  const result = await holdingStore.importHoldings(file, overwrite)
  isImportModalOpen.value = false
  if (result)
    alert(`导入完成！成功: ${result.imported}, 跳过: ${result.skipped}`)
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8 flex flex-col gap-4 items-start justify-between sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-bold sm:text-3xl">
          我的持仓
        </h1>
        <p class="text-gray-500 mt-1 dark:text-gray-400">
          概览您的基金投资组合
        </p>
      </div>
      <div class="flex gap-2 items-center sm:gap-4">
        <button class="icon-btn" title="刷新所有估值" :disabled="isRefreshing" @click="handleRefresh">
          <div i-carbon-renew :class="{ 'animate-spin': isRefreshing }" />
        </button>
        <button class="icon-btn" title="导入数据" @click="isImportModalOpen = true">
          <div i-carbon-upload />
        </button>
        <button class="icon-btn" title="导出数据" @click="handleExport">
          <div i-carbon-download />
        </button>
        <button class="btn flex items-center" @click="openAddModal">
          <div i-carbon-add mr-1 />
          添加基金
        </button>
      </div>
    </header>

    <!-- 投资组合总览卡片 -->
    <div v-if="summary && summary.count > 0" class="mb-8 p-4 card relative">
      <!-- 状态指示器，放置在右上角 -->
      <div class="flex gap-2 items-center right-4 top-4 absolute">
        <span
          class="rounded-full h-2 w-2"
          :class="{
            'bg-green-500 animate-pulse': sseStatus === 'OPEN',
            'bg-yellow-500': sseStatus === 'CONNECTING',
            'bg-gray-400': sseStatus === 'CLOSED',
          }"
        />
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ sseStatusText }}
        </span>
      </div>
      <div class="gap-4 grid grid-cols-2 md:grid-cols-4">
        <!-- 持仓总成本 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            持仓总成本
          </p>
          <!-- 应用 font-numeric 类 -->
          <p class="text-lg font-numeric font-semibold sm:text-xl">
            {{ formatCurrency(summary.totalHoldingAmount) }}
          </p>
        </div>
        <!-- 预估总市值 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            预估总市值
          </p>
          <!-- 应用 font-numeric 类 -->
          <p class="text-lg font-numeric font-semibold sm:text-xl">
            {{ formatCurrency(summary.totalEstimateAmount) }}
          </p>
        </div>
        <!-- 预估总盈亏 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            预估总盈亏
          </p>
          <!-- 应用 font-numeric 类 -->
          <p class="text-lg font-numeric font-semibold sm:text-xl" :class="getChangeClass(summary.totalProfitLoss)">
            {{ summary.totalProfitLoss.toFixed(2) }}
          </p>
        </div>
        <!-- 预估涨跌幅 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            预估涨跌幅
          </p>
          <!-- [修改] 应用 font-numeric 类 -->
          <p class="text-lg font-numeric font-semibold sm:text-xl" :class="getChangeClass(summary.totalPercentageChange)">
            {{ summary.totalPercentageChange.toFixed(2) }}%
          </p>
        </div>
      </div>
    </div>

    <!-- 主体内容 -->
    <div v-if="isLoading" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
    </div>
    <div v-else-if="holdings.length === 0" class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>暂无持仓数据，请先添加基金。</p>
    </div>
    <HoldingList
      v-else
      :holdings="holdings"
      :sort-key="sortKey"
      :sort-order="sortOrder"
      @edit="openEditModal"
      @delete="handleDelete"
      @set-sort="handleSetSort"
    />

    <Modal v-model="isModalOpen" :title="modalTitle">
      <AddEditHoldingForm
        :initial-data="editingHolding"
        @submit="handleSubmit"
        @cancel="closeModal"
      />
    </Modal>

    <Modal v-model="isImportModalOpen" title="导入持仓数据">
      <ImportHoldingForm @submit="handleImportSubmit" @cancel="isImportModalOpen = false" />
    </Modal>
  </div>
</template>
