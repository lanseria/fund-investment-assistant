<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'
import { appName } from '~/constants'

useHead({
  title: `持仓列表 - ${appName}`,
})
const holdingStore = useHoldingStore()
const { holdings, isLoading, isRefreshing } = storeToRefs(holdingStore)
const { refreshAllEstimates } = holdingStore

// 使用 useAsyncData 确保在服务端也能获取数据
await useAsyncData('holdings', () => holdingStore.fetchHoldings())

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

async function handleSubmit(formData: any) {
  try {
    if (editingHolding.value) {
      // 编辑模式
      await holdingStore.updateHolding(formData.code, formData.holding_amount)
    }
    else {
      // 添加模式
      await holdingStore.addHolding(formData)
    }
    closeModal()
  }
  catch (error) {
    console.error(error)
    // 错误处理，例如显示一个 toast 通知
    alert('操作失败，请查看控制台获取更多信息。')
  }
}

// [新增] 刷新按钮的处理器
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

// --- 新的导入/导出状态和逻辑 ---
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
  <!-- 调整整体内边距，使其在手机和桌面都合适 -->
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
        <!-- [新增] 刷新按钮 -->
        <button class="icon-btn" title="刷新所有估值" :disabled="isRefreshing" @click="handleRefresh">
          <div i-carbon-renew :class="{ 'animate-spin': isRefreshing }" />
        </button>
        <!-- 新增的导入/导出按钮 -->
        <button class="icon-btn" title="导入数据" @click="isImportModalOpen = true">
          <div i-carbon-upload />
        </button>
        <button class="icon-btn" title="导出数据" @click="handleExport">
          <div i-carbon-download />
        </button>
        <DarkToggle /> <!-- 将暗色模式切换按钮移到这里 -->
        <button class="flex items-center btn" @click="openAddModal">
          <div i-carbon-add mr-1 />
          添加基金
        </button>
      </div>
    </header>

    <!-- 主体内容 -->
    <div v-if="isLoading" class="flex h-64 items-center justify-center card">
      <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
    </div>
    <div v-else-if="holdings.length === 0" class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>暂无持仓数据，请先添加基金。</p>
    </div>
    <HoldingList v-else :holdings="holdings" @edit="openEditModal" @delete="handleDelete" />

    <!-- 移除 Footer，让页面更专注 -->
    <!-- <Footer /> -->

    <!-- 模态框组件 (保持不变) -->
    <Modal v-model="isModalOpen" :title="modalTitle">
      <AddEditHoldingForm
        :initial-data="editingHolding"
        @submit="handleSubmit"
        @cancel="closeModal"
      />
    </Modal>

    <!-- 新的导入模态框 -->
    <Modal v-model="isImportModalOpen" title="导入持仓数据">
      <ImportHoldingForm @submit="handleImportSubmit" @cancel="isImportModalOpen = false" />
    </Modal>
  </div>
</template>
