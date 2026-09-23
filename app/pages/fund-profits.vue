<script setup lang="ts">
import type { FundProfitRow, FundProfitsData } from '~/types/profit'
import EmptyState from '~/components/EmptyState.vue'
import StatCard from '~/components/StatCard.vue'
import { appName } from '~/constants'
import { formatChange, formatCurrency, getChangeColorClass } from '~/utils/format'

useHead({
  title: `基金收益总览 - ${appName}`,
})

const { data, pending, error } = useAsyncData<FundProfitsData>(
  'fund-profits',
  () => apiFetch('/api/user/fund-profits'),
)

// --- 排序/筛选（同步 URL query，刷新/分享可保留） ---
type SortKey = 'name' | 'holdingAmount' | 'dayProfit' | 'holdingProfitRate' | 'totalProfit' | 'lastTradeDate'

const route = useRoute()
const router = useRouter()

const statusFilter = ref<'all' | 'held' | 'sold'>(
  route.query.status === 'held' || route.query.status === 'sold' ? route.query.status : 'all',
)
const sortKey = ref<SortKey | null>((route.query.sort as SortKey) || 'holdingAmount')
const sortOrder = ref<'asc' | 'desc'>((route.query.order as 'asc' | 'desc') || 'desc')

function setStatus(status: 'all' | 'held' | 'sold') {
  statusFilter.value = status
  syncQuery()
}

function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortOrder.value = 'desc'
  }
  syncQuery()
}

function syncQuery() {
  const query: Record<string, string> = {}
  if (statusFilter.value !== 'all')
    query.status = statusFilter.value
  if (sortKey.value) {
    query.sort = sortKey.value
    query.order = sortOrder.value
  }
  router.replace({ query })
}

/** 日收益展示值:盘中优先今日估算,否则用最近确认日收益 */
function dayProfitOf(row: FundProfitRow): number | null {
  return row.estimateProfit ?? row.dayProfit
}

function sortValue(row: FundProfitRow, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return row.name
    case 'lastTradeDate':
      return row.lastTradeDate ?? ''
    case 'dayProfit':
      return dayProfitOf(row) ?? -Infinity
    case 'holdingProfitRate':
      return row.holdingProfitRate ?? -Infinity
    case 'holdingAmount':
      return row.holdingAmount ?? -Infinity
    case 'totalProfit':
      return row.totalProfit
  }
}

const displayData = computed(() => {
  let rows = data.value?.funds ?? []
  if (statusFilter.value !== 'all')
    rows = rows.filter(r => r.status === statusFilter.value)

  if (!sortKey.value)
    return rows

  return rows.toSorted((a, b) => {
    const valA = sortValue(a, sortKey.value!)
    const valB = sortValue(b, sortKey.value!)
    const diff = typeof valA === 'string' || typeof valB === 'string'
      ? String(valA).localeCompare(String(valB))
      : Number(valA) - Number(valB)
    return sortOrder.value === 'asc' ? diff : -diff
  })
})

const statusFilters = [
  { label: '全部', value: 'all' },
  { label: '持有中', value: 'held' },
  { label: '已清仓', value: 'sold' },
] as const
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl lg:p-8 sm:p-6">
    <header class="mb-6 flex gap-2 items-center">
      <NuxtLink to="/" class="btn-icon p-2 rounded-full transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">
        <div i-carbon-arrow-left text-xl />
      </NuxtLink>
      <h1 class="text-2xl font-bold sm:text-3xl">
        基金收益总览
      </h1>
    </header>

    <div v-if="pending" class="py-20 flex justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>

    <EmptyState
      v-else-if="error"
      icon="i-carbon-warning-alt"
      message="加载失败"
      :description="error.message"
    />

    <EmptyState
      v-else-if="!data || data.funds.length === 0"
      icon="i-carbon-chart-line"
      message="暂无基金收益数据"
      description="完成第一笔交易确认或导入持仓后，将在此展示所有基金的收益情况"
    />

    <div v-else class="space-y-6">
      <!-- 1. 汇总指标 -->
      <div class="p-4 card gap-4 grid grid-cols-2 md:grid-cols-3">
        <StatCard
          label="涉及基金"
          :value="data.summary.fundCount"
          :hint="`持有中 ${data.summary.heldCount} · 已清仓 ${data.summary.soldCount}`"
        />
        <StatCard label="持有市值合计" :value="formatCurrency(data.summary.totalHoldingAmount)" />
        <StatCard label="累计收益合计" :value="formatCurrency(data.summary.totalProfit)" :colored="true" />
      </div>

      <!-- 2. 状态筛选 -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="f in statusFilters"
          :key="f.value"
          class="text-xs px-3 py-1.5 rounded-md transition-colors"
          :class="statusFilter === f.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
          @click="setStatus(f.value)"
        >
          {{ f.label }}
        </button>
      </div>

      <!-- 3. 基金收益表（点击表头排序） -->
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="text-left min-w-220 w-full table-fixed">
            <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
              <tr>
                <th
                  class="text-sm text-gray-600 font-semibold p-4 w-60 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  @click="setSort('name')"
                >
                  基金名称
                  <span v-if="sortKey === 'name'" class="ml-1 align-middle inline-block">
                    <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                    <div v-else i-carbon-arrow-down />
                  </span>
                </th>

                <th
                  class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="份额 × 最新已确认净值"
                  @click="setSort('holdingAmount')"
                >
                  持有金额
                  <span v-if="sortKey === 'holdingAmount'" class="ml-1 align-middle inline-block">
                    <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                    <div v-else i-carbon-arrow-down />
                  </span>
                </th>

                <th
                  class="text-sm text-gray-600 font-semibold p-4 text-right w-32 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="盘中为今日估算收益(标'估');净值确认后为最近确认日收益 = 份额 × (最新净值 - 前一净值)"
                  @click="setSort('dayProfit')"
                >
                  日收益
                  <span v-if="sortKey === 'dayProfit'" class="ml-1 align-middle inline-block">
                    <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                    <div v-else i-carbon-arrow-down />
                  </span>
                </th>

                <th
                  class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="持有收益 = 持有金额 - 持有成本;按收益率排序"
                  @click="setSort('holdingProfitRate')"
                >
                  持有收益 / 收益率
                  <span v-if="sortKey === 'holdingProfitRate'" class="ml-1 align-middle inline-block">
                    <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                    <div v-else i-carbon-arrow-down />
                  </span>
                </th>

                <th
                  class="text-sm text-gray-600 font-semibold p-4 text-right w-32 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="累计收益 = 持有收益 + 已落袋盈亏;已清仓基金即其历史全部落袋盈亏"
                  @click="setSort('totalProfit')"
                >
                  累计收益
                  <span v-if="sortKey === 'totalProfit'" class="ml-1 align-middle inline-block">
                    <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                    <div v-else i-carbon-arrow-down />
                  </span>
                </th>

                <th
                  class="text-sm text-gray-600 font-semibold p-4 text-right w-28 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  @click="setSort('lastTradeDate')"
                >
                  最近交易
                  <span v-if="sortKey === 'lastTradeDate'" class="ml-1 align-middle inline-block">
                    <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                    <div v-else i-carbon-arrow-down />
                  </span>
                </th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="row in displayData"
                :key="row.code"
                class="border-b transition-colors dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <td class="p-4">
                  <NuxtLink :to="`/fund/${row.code}`" class="group flex flex-col">
                    <span class="flex gap-2 items-center">
                      <span class="font-medium group-hover:text-primary group-hover:underline">{{ row.name }}</span>
                      <span
                        v-if="row.status === 'sold'"
                        class="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-100 dark:text-gray-400 dark:bg-gray-700"
                      >已清仓</span>
                    </span>
                    <span class="text-xs text-gray-400">{{ row.code }}</span>
                  </NuxtLink>
                </td>

                <td class="text-sm font-mono p-4 text-right tabular-nums">
                  <template v-if="row.holdingAmount !== null">
                    <div>{{ formatCurrency(row.holdingAmount) }}</div>
                    <div class="text-xs text-gray-400 font-sans">
                      份额 {{ row.shares?.toFixed(2) }}
                    </div>
                  </template>
                  <span v-else class="text-gray-400">—</span>
                </td>

                <td class="text-sm font-mono p-4 text-right tabular-nums">
                  <template v-if="row.status === 'held' && dayProfitOf(row) !== null">
                    <div :class="getChangeColorClass(dayProfitOf(row))" class="font-semibold">
                      {{ formatCurrency(dayProfitOf(row)) }}
                      <span v-if="row.estimateProfit !== null" class="text-[10px] text-gray-400 font-sans">(估)</span>
                    </div>
                    <div class="text-xs text-gray-400 font-sans">
                      {{ row.dayProfitRate !== null ? formatChange(row.dayProfitRate) : '' }}
                    </div>
                  </template>
                  <span v-else class="text-gray-400">—</span>
                </td>

                <td class="text-sm font-mono p-4 text-right tabular-nums">
                  <template v-if="row.holdingProfit !== null">
                    <div :class="getChangeColorClass(row.holdingProfit)" class="font-semibold">
                      {{ formatCurrency(row.holdingProfit) }}
                    </div>
                    <div class="text-xs text-gray-400 font-sans">
                      {{ formatChange(row.holdingProfitRate) }}
                    </div>
                  </template>
                  <span v-else class="text-gray-400">—</span>
                </td>

                <td class="text-sm font-mono font-semibold p-4 text-right tabular-nums" :class="getChangeColorClass(row.totalProfit)">
                  {{ formatCurrency(row.totalProfit) }}
                </td>

                <td class="text-sm text-gray-500 p-4 text-right dark:text-gray-400">
                  {{ row.lastTradeDate ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 口径说明 -->
      <p class="text-xs text-gray-400 leading-5">
        口径说明：持有金额、持有收益按最新已确认净值计算；日收益盘中为今日估算值（标"估"），净值确认后为最近确认日收益；累计收益 = 持有收益 + 已落袋盈亏，已清仓基金即其历史全部落袋盈亏。部分历史份额（如手工导入、直接清仓）无对应交易记录，落袋盈亏按当前成本价近似。
      </p>
    </div>
  </div>
</template>
