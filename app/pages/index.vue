<!-- eslint-disable no-console -->
<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { Holding, SortableKey } from '~/types/holding'
import { appName } from '~/constants'

const router = useRouter()
const route = useRoute()
const holdingStore = useHoldingStore()

useHead({
  title: `持仓列表 - ${appName}`,
})

// 从 store 中解构出状态和 action
const { holdings, isLoading, summary, sseStatus } = storeToRefs(holdingStore)

// useAsyncData 依然很有用，它能处理 pending 状态并防止在客户端重新请求
const { pending: isDataLoading, refresh } = await useAsyncData(
  'holdings',
  () => holdingStore.fetchHoldings(),
  { server: true }, // 确保在服务端执行
)

// 监听 useAsyncData 的 pending 状态，同步到 store 的 isLoading
watch(isDataLoading, (loading) => {
  holdingStore.isLoading = loading
})

onMounted(() => {
  const authStore = useAuthStore()
  if (authStore.isAuthenticated) {
    holdingStore.startSseUpdates()
  }
})

onUnmounted(() => {
  holdingStore.stopSseUpdates()
})

// --- 排序逻辑 ---
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

// --- 表单和操作处理 ---
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
        <button class="icon-btn" title="刷新所有估值" :disabled="isLoading" @click="() => refresh()">
          <div i-carbon-renew :class="{ 'animate-spin': isLoading }" />
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

    <PortfolioSummaryCard :summary="summary" :sse-status="sseStatus" />

    <div v-if="isLoading" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
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
      @clear-position="handleClearPosition"
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
