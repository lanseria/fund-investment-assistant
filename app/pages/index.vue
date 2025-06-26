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

// 正确使用 useAsyncData
// 1. useAsyncData 的处理器直接返回 fetch 的结果
// 2. 我们从 useAsyncData 解构出 data, pending 等状态
const { data: asyncData, pending: isDataLoading } = await useAsyncData(
  'holdings',
  () => apiFetch<{ holdings: Holding[], summary: HoldingSummary }>('/api/fund/holdings/'),
)

// 使用 watch 将 useAsyncData 获取的数据同步到 Pinia store
// 这样既能在 SSR 时获取数据，又能将数据保存在全局状态中
watch(asyncData, (newData) => {
  if (newData) {
    holdingStore.holdings = newData.holdings
    holdingStore.summary = newData.summary
  }
}, { immediate: true }) // immediate: true 保证在组件加载时立即执行一次

// isLoading 状态现在应该由 useAsyncData 的 pending 状态驱动
// 这样可以避免手动管理加载状态
watch(isDataLoading, (loading) => {
  holdingStore.isLoading = loading
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
    <div v-if="summary && summary.count > 0" class="mb-8 p-4 card">
      <div class="gap-4 grid grid-cols-2 md:grid-cols-4">
        <!-- 持仓总成本 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            持仓总成本
          </p>
          <!-- 应用 font-numeric 类 -->
          <p class="font-numeric text-lg font-semibold sm:text-xl">
            {{ formatCurrency(summary.totalHoldingAmount) }}
          </p>
        </div>
        <!-- 预估总市值 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            预估总市值
          </p>
          <!-- 应用 font-numeric 类 -->
          <p class="font-numeric text-lg font-semibold sm:text-xl">
            {{ formatCurrency(summary.totalEstimateAmount) }}
          </p>
        </div>
        <!-- 预估总盈亏 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            预估总盈亏
          </p>
          <!-- 应用 font-numeric 类 -->
          <p class="font-numeric text-lg font-semibold sm:text-xl" :class="getChangeClass(summary.totalProfitLoss)">
            {{ summary.totalProfitLoss.toFixed(2) }}
          </p>
        </div>
        <!-- 预估涨跌幅 -->
        <div class="p-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            预估涨跌幅
          </p>
          <!-- [修改] 应用 font-numeric 类 -->
          <p class="font-numeric text-lg font-semibold sm:text-xl" :class="getChangeClass(summary.totalPercentageChange)">
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
