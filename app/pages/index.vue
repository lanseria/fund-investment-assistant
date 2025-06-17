<script setup lang="ts">
import type { Holding } from '~/types/holding'

const holdingStore = useHoldingStore()
const { holdings, isLoading } = storeToRefs(holdingStore)

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
    // 错误处理，例如显示一个 toast 通知
    alert('操作失败，请查看控制台获取更多信息。')
  }
}

async function handleDelete(holding: Holding) {
  if (confirm(`确定要删除基金 ${holding.name} (${holding.code}) 吗？`)) {
    try {
      await holdingStore.deleteHolding(holding.code)
    }
    catch (error) {
      alert('删除失败！')
    }
  }
}
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">
        我的持仓
      </h1>
      <button class="btn" @click="openAddModal">
        <div i-carbon-add mr-1 />
        添加基金
      </button>
    </div>

    <div v-if="isLoading" class="text-center p-10">
      <div i-carbon-circle-dash class="text-4xl animate-spin" />
    </div>
    <div v-else-if="holdings.length === 0" class="text-center text-gray-500 p-10">
      暂无持仓数据，请先添加基金。
    </div>
    <HoldingList v-else :holdings="holdings" @edit="openEditModal" @delete="handleDelete" />

    <Footer />

    <!-- 模态框组件 -->
    <Modal v-model="isModalOpen" :title="modalTitle">
      <AddEditHoldingForm
        :initial-data="editingHolding"
        @submit="handleSubmit"
        @cancel="closeModal"
      />
    </Modal>
  </div>
</template>