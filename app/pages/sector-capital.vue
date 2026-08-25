<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { SectorCapitalResponse, SectorType } from '~/types/sector'
import { parseYi } from '~~/shared/sectorCapital'
import { appName, SECTOR_DICT_TYPE } from '~/constants'
import { apiFetch } from '~/utils/api'
import { CHANGE_LEGEND, formatChange, getChangeColorClass } from '~/utils/format'
import { getActionBadgeClass } from '~/utils/sectorStyle'

useHead({
  title: `板块资金 - ${appName}`,
})

const authStore = useAuthStore()
const dictStore = useDictStore()
const isAdmin = computed(() => authStore.isAdmin)

// 行业 / 概念切换（同步到 URL query，默认行业）
const sectorTypes: { label: string, value: SectorType }[] = [
  { label: '行业板块', value: 'industry' },
  { label: '概念板块', value: 'concept' },
]

const route = useRoute()
const router = useRouter()

const sectorType = computed<SectorType>({
  get: () => (route.query.type as SectorType) || 'industry',
  set: val => router.replace({ query: { ...route.query, type: val } }),
})

// 切换板块类型自动重新请求
const { data: sectorCapitalData, pending, error, refresh } = useAsyncData(
  'sector-capital',
  () => apiFetch<SectorCapitalResponse>('/api/sectors/capital', {
    params: { type: sectorType.value },
  }),
  {
    watch: [sectorType],
  },
)

// === 板块绑定（绑定关系、绑定/解绑模态框） ===
const {
  bindingMap,
  sectorOptions,
  occupiedDictValues,
  editingBindingSector,
  selectedDictValue,
  isBindingModalOpen,
  isBindingSubmitting,
  openBindingModal,
  handleBindingSubmit,
} = useSectorBinding(sectorType)

// === admin 手动抓取快照 ===
const isSyncing = ref(false)
async function handleSyncSnapshot() {
  if (!isAdmin.value)
    return
  isSyncing.value = true
  try {
    const res = await apiFetch<{ message: string }>('/api/admin/sectors/sync-capital', { method: 'POST' })
    alert(res.message)
  }
  catch (error: any) {
    alert(`抓取失败: ${error.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSyncing.value = false
  }
}

// === 筛选与排序（主力行为 / 搜索 / 成交额 / 排序列） ===
const {
  actionFilters,
  actionFilter,
  search,
  amountPresets,
  amountMin,
  sortKey,
  sortOrder,
  toggleSort,
  filteredSectors,
} = useSectorFilters(computed(() => sectorCapitalData.value?.sectors))

// 数据最近更新时间（客户端成功抓取时刻；上游为盘中实时数据，无自带时间戳）
const lastUpdated = ref<Date | null>(null)
watch(sectorCapitalData, (val) => {
  if (val)
    lastUpdated.value = new Date()
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold sm:text-3xl">
        板块资金
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        行业 / 概念板块主力资金流向全景（盘中实时，{{ CHANGE_LEGEND }}）
      </p>
    </header>

    <!-- 工具栏：板块类型 Tab + 刷新 + 搜索 -->
    <div class="mb-4 flex flex-wrap gap-3 items-center justify-between">
      <div class="p-1 rounded-lg bg-gray-100 inline-flex dark:bg-gray-800">
        <button
          v-for="t in sectorTypes"
          :key="t.value"
          class="text-sm font-medium px-4 py-1.5 rounded-md transition-all"
          :class="sectorType === t.value
            ? 'bg-white text-primary shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
          @click="sectorType = t.value"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="flex gap-2 items-center">
        <div class="relative">
          <div class="i-carbon-search text-gray-400 left-3 top-1/2 absolute -translate-y-1/2" />
          <input
            v-model="search"
            type="text"
            placeholder="搜索板块名称 / 代码"
            class="input-base pl-9 w-48 sm:w-60"
          >
        </div>
        <button
          v-if="isAdmin"
          class="icon-btn p-2"
          title="立即抓取板块主力快照（仅管理员）"
          :class="{ 'animate-spin': isSyncing }"
          :disabled="isSyncing"
          @click="handleSyncSnapshot"
        >
          <div class="i-carbon-cloud-download" />
        </button>
        <button
          class="icon-btn p-2"
          title="刷新数据"
          :class="{ 'animate-spin': pending }"
          :disabled="pending"
          @click="refresh()"
        >
          <div class="i-carbon-renew" />
        </button>
      </div>
    </div>

    <!-- 主力行为筛选 -->
    <div class="mb-4 flex flex-wrap gap-2 items-center">
      <span class="text-xs text-gray-400">主力行为：</span>
      <button
        v-for="f in actionFilters"
        :key="f"
        class="text-xs font-medium px-2.5 py-1 border rounded-full transition-colors"
        :class="actionFilter === f
          ? 'bg-primary/10 text-primary border-primary/30'
          : 'text-gray-500 border-gray-200 hover:bg-gray-100 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700/40'"
        @click="actionFilter = f"
      >
        {{ f }}
      </button>
    </div>

    <!-- 成交额过滤 -->
    <div class="mb-4 flex flex-wrap gap-2 items-center">
      <span class="text-xs text-gray-400">成交额：</span>
      <button
        v-for="p in amountPresets"
        :key="p.value"
        class="text-xs font-medium px-2.5 py-1 border rounded-full transition-colors"
        :class="amountMin === p.value
          ? 'bg-primary/10 text-primary border-primary/30'
          : 'text-gray-500 border-gray-200 hover:bg-gray-100 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700/40'"
        @click="amountMin = p.value"
      >
        {{ p.label }}
      </button>
      <!-- 自定义成交额阈值 -->
      <div class="flex gap-1 items-center">
        <span class="text-xs text-gray-400">≥</span>
        <input
          :value="amountMin || ''"
          type="number"
          min="0"
          step="10"
          placeholder="自定义"
          class="text-xs input-base py-0.5 w-24"
          @input="(e) => {
            const v = Number((e.target as HTMLInputElement).value)
            amountMin = Number.isNaN(v) || v < 0 ? 0 : v
          }"
        >
        <span class="text-xs text-gray-400">亿</span>
      </div>
    </div>

    <!-- 计数 + 更新时间 -->
    <div
      v-if="!pending && !error && sectorCapitalData"
      class="text-xs text-gray-400 font-mono mb-2 flex flex-wrap gap-x-3 gap-y-1 items-center justify-between"
    >
      <span>共 {{ sectorCapitalData.count }} 个板块，命中筛选 {{ filteredSectors.length }} 个</span>
      <span v-if="lastUpdated" class="inline-flex gap-1 items-center">
        <div class="i-carbon-time text-gray-400" />
        更新于 {{ lastUpdated.toLocaleTimeString('zh-CN', { hour12: false }) }}
      </span>
    </div>

    <!-- Loading / Error -->
    <div v-if="pending" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-3xl text-primary animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载板块资金数据失败</p>
      <p class="text-sm text-gray-400 mt-1">
        {{ error.message }}
      </p>
    </div>

    <!-- 数据表 -->
    <div
      v-else-if="sectorCapitalData && sectorCapitalData.sectors.length > 0"
      class="card max-h-[70vh] overflow-auto"
    >
      <table class="text-left w-full table-fixed">
        <thead class="border-b border-gray-200 bg-gray-50/95 top-0 sticky z-10 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
          <tr>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 w-[26%] uppercase">
              板块
            </th>
            <th
              class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[12%] cursor-pointer select-none uppercase transition-colors hover:text-primary"
              :class="{ 'text-primary font-bold': sortKey === 'changePercent' }"
              @click="toggleSort('changePercent')"
            >
              <span class="inline-flex gap-0.5 items-center">
                涨幅
                <div v-if="sortKey === 'changePercent'" :class="sortOrder === 'asc' ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down'" />
              </span>
            </th>
            <th
              class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[14%] cursor-pointer select-none uppercase transition-colors hover:text-primary"
              :class="{ 'text-primary font-bold': sortKey === 'amount' }"
              @click="toggleSort('amount')"
            >
              <span class="inline-flex gap-0.5 items-center">
                成交额
                <div v-if="sortKey === 'amount'" :class="sortOrder === 'asc' ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down'" />
              </span>
            </th>
            <th
              class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[12%] cursor-pointer select-none uppercase transition-colors hover:text-primary"
              :class="{ 'text-primary font-bold': sortKey === 'mainCapital' }"
              @click="toggleSort('mainCapital')"
            >
              <span class="inline-flex gap-0.5 items-center">
                主力资金
                <div v-if="sortKey === 'mainCapital'" :class="sortOrder === 'asc' ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down'" />
              </span>
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[12%] uppercase">
              散户资金
            </th>
            <th
              class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[12%] cursor-pointer select-none uppercase transition-colors hover:text-primary"
              :class="{ 'text-primary font-bold': sortKey === 'mainHidden' }"
              @click="toggleSort('mainHidden')"
            >
              <span class="inline-flex gap-0.5 items-center">
                主力暗盘
                <div v-if="sortKey === 'mainHidden'" :class="sortOrder === 'asc' ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down'" />
              </span>
            </th>
            <th
              class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[12%] cursor-pointer select-none uppercase transition-colors hover:text-primary"
              :class="{ 'text-primary font-bold': sortKey === 'mainStrength' }"
              @click="toggleSort('mainStrength')"
            >
              <span class="inline-flex gap-0.5 items-center">
                主力强度
                <div v-if="sortKey === 'mainStrength'" :class="sortOrder === 'asc' ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down'" />
              </span>
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-center w-[10%] uppercase">
              主力行为
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-center w-[10%] uppercase">
              项目板块
            </th>
          </tr>
        </thead>

        <tbody class="bg-white divide-gray-100 divide-y dark:bg-gray-900 dark:divide-gray-800">
          <tr
            v-for="sector in filteredSectors"
            :key="sector.code"
            class="transition-colors duration-150 hover:bg-gray-50/80 dark:hover:bg-gray-800/60"
          >
            <!-- 板块（名称 + 代码） -->
            <td class="px-4 py-3 align-middle">
              <div class="flex flex-col min-w-0">
                <span class="font-semibold truncate dark:text-gray-100">{{ sector.name }}</span>
                <span class="text-[10px] text-gray-400 font-mono">{{ sector.code }}</span>
              </div>
            </td>
            <!-- 涨幅 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm font-mono font-semibold tabular-nums" :class="getChangeColorClass(sector.changePercent)">
                {{ formatChange(sector.changePercent) }}
              </span>
            </td>
            <!-- 成交额 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm text-gray-600 font-mono tabular-nums dark:text-gray-300">{{ sector.amount }}</span>
            </td>
            <!-- 主力资金 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm font-mono font-semibold tabular-nums" :class="getChangeColorClass(parseYi(sector.mainCapital))">
                {{ sector.mainCapital }}
              </span>
            </td>
            <!-- 散户资金 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm text-gray-500 font-mono tabular-nums dark:text-gray-400">{{ sector.retailCapital }}</span>
            </td>
            <!-- 主力暗盘 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm font-mono font-semibold tabular-nums" :class="getChangeColorClass(parseYi(sector.mainHidden))">
                {{ sector.mainHidden }}
              </span>
            </td>
            <!-- 主力强度 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm font-bold font-mono tabular-nums" :class="getChangeColorClass(sector.mainStrength)">
                {{ formatChange(sector.mainStrength) }}
              </span>
            </td>
            <!-- 主力行为 -->
            <td class="px-4 py-3 text-center align-middle">
              <span
                class="text-xs font-medium px-2 py-0.5 border rounded-full whitespace-nowrap"
                :class="getActionBadgeClass(sector.mainAction)"
              >
                {{ sector.mainAction }}
              </span>
            </td>
            <!-- 项目板块绑定 -->
            <td class="px-4 py-3 text-center align-middle">
              <button
                class="text-xs px-2 py-1 border rounded-md whitespace-nowrap transition-colors"
                :class="bindingMap.get(sector.code)
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                  : 'border-gray-200 text-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700/40'"
                @click="openBindingModal(sector)"
              >
                <span v-if="bindingMap.get(sector.code)">
                  {{ dictStore.getLabel(SECTOR_DICT_TYPE, bindingMap.get(sector.code)!.dictValue) }}
                </span>
                <span v-else class="inline-flex gap-0.5 items-center">
                  <div class="i-carbon-link text-sm" />
                  绑定
                </span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 筛选后空态 -->
    <div v-else class="text-gray-400 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4 opacity-30" />
      <p>没有符合条件的板块</p>
    </div>

    <!-- 板块绑定 Modal -->
    <Modal v-model="isBindingModalOpen" title="绑定项目板块">
      <form v-if="isBindingModalOpen" class="space-y-4" @submit.prevent="handleBindingSubmit">
        <p class="text-sm">
          将东财板块
          <span class="font-semibold">{{ editingBindingSector?.name }} ({{ editingBindingSector?.code }})</span>
          绑定到一个项目板块，绑定后可在基金详情页查看该板块的主力行为回顾。
        </p>
        <div>
          <label class="text-sm font-medium mb-1 block">选择项目板块</label>
          <CustomSelect
            v-model="selectedDictValue"
            :options="sectorOptions"
            placeholder="选择要绑定的项目板块"
          />
          <p
            v-if="selectedDictValue && occupiedDictValues.has(selectedDictValue) && bindingMap.get(editingBindingSector?.code ?? '')?.dictValue !== selectedDictValue"
            class="text-xs text-orange-500 mt-2"
          >
            ⚠ 该项目板块已绑定其他东财板块，确认后将自动转移绑定关系。
          </p>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="isBindingModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn" :disabled="isBindingSubmitting">
            {{ isBindingSubmitting ? '保存中...' : '确认保存' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
