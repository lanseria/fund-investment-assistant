<!-- eslint-disable no-console -->
<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { Holding, SortableKey } from '~/types/holding'
import { appName } from '~/constants'

const router = useRouter()
const route = useRoute()

useHead({
  title: `持仓列表 - ${appName}`,
})

const holdingStore = useHoldingStore()
const { holdings, summary, sseStatus } = storeToRefs(holdingStore)

// useAsyncData 依然很有用，它能处理 pending 状态并防止在客户端重新请求
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

// --- 排序与分组逻辑 ---
const isGroupedBySector = ref(false) // 新增：分组状态
const sortKey = ref<SortableKey>((route.query.sort as SortableKey) || 'holdingAmount')
const sortOrder = ref<'asc' | 'desc'>((route.query.order as 'asc' | 'desc') || 'desc')
const { getLabel } = useDictStore()
const SECTOR_UNCATEGORIZED_KEY = 'unclassified'
const SECTOR_UNCATEGORIZED_LABEL = '未分类板块'

function handleSetSort(key: SortableKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortOrder.value = 'desc'
  }
  // 排序时自动取消分组，体验更佳
  isGroupedBySector.value = false
  router.replace({ query: { sort: sortKey.value, order: sortOrder.value } })
}

// [核心] 计算最终要显示的数据
const displayData = computed(() => {
  const sourceHoldings = holdings.value || []

  // 1. 分组逻辑
  if (isGroupedBySector.value) {
    const groups = sourceHoldings.reduce((acc, holding) => {
      const key = holding.sector || SECTOR_UNCATEGORIZED_KEY
      if (!acc[key]) {
        acc[key] = {
          sectorKey: key,
          sectorLabel: key === SECTOR_UNCATEGORIZED_KEY ? SECTOR_UNCATEGORIZED_LABEL : (getLabel('sectors', key) || key),
          holdings: [],
          holdingCount: 0,
          groupTotalAmount: 0,
          groupTotalProfitLoss: 0,
        }
      }
      acc[key]!.holdings.push(holding)
      return acc
    }, {} as Record<string, any>)

    const groupedArray = Object.values(groups).map((group) => {
      group.holdingCount = group.holdings.length
      // 计算分组汇总数据
      group.holdings.forEach((h: Holding) => {
        if (h.holdingAmount !== null)
          group.groupTotalAmount += h.holdingAmount
        if (h.todayEstimateAmount !== null && h.holdingAmount !== null)
          group.groupTotalProfitLoss += (h.todayEstimateAmount - h.holdingAmount)
      })
      return group
    })

    // 按分组总金额降序排列
    return groupedArray.sort((a, b) => b.groupTotalAmount - a.groupTotalAmount)
  }

  // 2. 扁平化排序逻辑 (原 HoldingList 中的逻辑移到此处)
  if (!sortKey.value)
    return sourceHoldings

  return [...sourceHoldings].sort((a, b) => {
    const key = sortKey.value!
    const valA = a[key] ?? -Infinity
    const valB = b[key] ?? -Infinity

    if (sortOrder.value === 'asc')
      return Number(valA) - Number(valB)
    else
      return Number(valB) - Number(valA)
  })
})

// --- 模态框状态管理 ---
const isModalOpen = ref(false)
const editingHolding = ref<Holding | null>(null)
const modalTitle = computed(() => editingHolding.value ? '编辑基金' : '添加新基金')

// 板块编辑模态框的状态
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

// 打开板块编辑模态框的函数
function openSectorModal(holding: Holding) {
  editingHoldingForSector.value = holding
  isSectorModalOpen.value = true
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

async function onSectorUpdateSuccess() {
  isSectorModalOpen.value = false
  // 重新从服务器获取最新的持仓数据，以确保数据同步
  await holdingStore.fetchHoldings()
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <!-- MarketOverview 组件内部会自己引入 useMarketStore，所以这里不需要做什么 -->
    <MarketOverview />

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
        <button class="icon-btn" title="刷新所有估值" :disabled="isDataLoading" @click="() => refresh()">
          <div i-carbon-renew :class="{ 'animate-spin': isDataLoading }" />
        </button>
        <button
          class="icon-btn"
          :class="{ 'text-primary': isGroupedBySector }"
          title="按板块分组"
          @click="isGroupedBySector = !isGroupedBySector"
        >
          <div i-carbon-table-split />
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

    <div v-if="isDataLoading" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>
    <div v-else-if="holdings.length === 0" class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>暂无持仓数据，请先添加基金。</p>
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

    <!-- 添加板块编辑模态框到模板中 -->
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
