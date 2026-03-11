<!-- app/pages/leaderboard/[id].vue -->
<script setup lang="ts">
import type { Holding, SortableKey } from '~/types/holding'
import { appName } from '~/constants'

const route = useRoute<'leaderboard-id'>()
const router = useRouter()
const userId = Number(route.params.id)

useHead({
  title: `用户持仓详情 - ${appName}`,
})

// --- 获取用户持仓详情 ---
const { data: userHoldings, pending, error, refresh } = useAsyncData(
  `leaderboard-details-${userId}`,
  () => apiFetch<Holding[]>(`/api/leaderboard/${userId}`),
)

// --- 排序逻辑 ---
const sortKey = ref<SortableKey | null>(null)
const sortOrder = ref<'asc' | 'desc'>('desc')

function handleSetSort(key: SortableKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortOrder.value = 'desc'
  }
}

const displayData = computed(() => {
  if (!userHoldings.value)
    return []
  const data = [...userHoldings.value]

  if (sortKey.value) {
    data.sort((a, b) => {
      const valA = a[sortKey.value!] ?? -Infinity
      const valB = b[sortKey.value!] ?? -Infinity
      return sortOrder.value === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA)
    })
  }
  return data
})

// --- 编辑板块逻辑 ---
const isSectorModalOpen = ref(false)
const editingHoldingForSector = ref<Holding | null>(null)

function openSectorModal(holding: Holding) {
  editingHoldingForSector.value = holding
  isSectorModalOpen.value = true
}

async function onSectorUpdateSuccess() {
  isSectorModalOpen.value = false
  await refresh() // 更新成功后重新拉取数据
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <!-- 头部区域 -->
    <header class="mb-6 flex gap-4 items-center">
      <button
        class="icon-btn p-2 rounded-full bg-white flex shadow-sm transition-colors items-center justify-center dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="router.back()"
      >
        <div i-carbon-arrow-left class="text-xl" />
      </button>
      <div>
        <h1 class="text-2xl font-bold sm:text-3xl">
          用户持仓详情
        </h1>
        <p class="text-sm text-gray-500 mt-1 dark:text-gray-400">
          查看该用户的公开持仓及操作记录 (ID: {{ userId }})
        </p>
      </div>
    </header>

    <!-- 加载与错误状态 -->
    <div v-if="pending" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>

    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载持仓详情失败: {{ error.message }}</p>
    </div>

    <!-- 列表数据渲染 -->
    <div v-else-if="displayData.length > 0">
      <HoldingList
        :data="displayData"
        :is-grouped="false"
        :sort-key="sortKey"
        :sort-order="sortOrder"
        :show-actions="false"
        :target-user-id="userId"
        @set-sort="handleSetSort"
        @edit-sector="openSectorModal"
      />
    </div>

    <!-- 空状态 -->
    <div v-else class="text-gray-400 py-20 text-center card">
      <div i-carbon-filter-remove class="text-5xl mx-auto mb-4 opacity-30" />
      <p>该用户暂无持仓数据</p>
    </div>

    <!-- 板块编辑模态框 -->
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
