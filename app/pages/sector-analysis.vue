<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { appName, SECTOR_DICT_TYPE } from '~/constants'
import { formatCurrency } from '~/utils/format'

useHead({
  title: `板块分析 - ${appName}`,
})

const dayjs = useDayjs()
const dictStore = useDictStore()
const holdingStore = useHoldingStore()

// 状态管理
const selectedDate = ref(dayjs().format('YYYY-MM-DD'))
const activeTab = ref<'all' | 'my_all' | 'held' | 'watched'>('all')

// 确保基础数据已加载
onMounted(async () => {
  if (holdingStore.holdings.length === 0) {
    await holdingStore.fetchHoldings()
  }
})

const isSyncing = ref(false)
const { data: statsData, pending, refresh: refreshStats } = useAsyncData(
  `sector-stats-${selectedDate.value}`,
  () => apiFetch<any[]>('/api/sectors/stats', { params: { date: selectedDate.value } }),
  { watch: [selectedDate] },
)

async function handleSync() {
  isSyncing.value = true
  try {
    const res = await apiFetch<{ message: string }>('/api/dev/sync-sectors', { method: 'POST' })
    alert(res.message)
    await refreshStats()
  }
  catch (e: any) {
    alert(`同步失败: ${e.data?.statusMessage || e.message}`)
  }
  finally {
    isSyncing.value = false
  }
}

// 修改原有的辅助格式化函数，增加市值转亿的函数
function formatMarketCap(val: number | null) {
  if (val === null)
    return '-'
  if (val >= 100000000)
    return `${(val / 100000000).toFixed(2)} 亿`
  return formatCurrency(val) // 兜底降级处理
}

// --- 数据计算逻辑 ---

// 获取用户持仓和关注的板块集合
const holdingSectors = computed(() => {
  const s = new Set<string>()
  holdingStore.holdings.forEach((h) => {
    if (h.sector && h.holdingAmount !== null)
      s.add(h.sector)
  })
  return s
})

const watchingSectors = computed(() => {
  const s = new Set<string>()
  holdingStore.holdings.forEach((h) => {
    if (h.sector && h.holdingAmount === null)
      s.add(h.sector)
  })
  return s
})

const myAllSectors = computed(() => new Set([...holdingSectors.value, ...watchingSectors.value]))

// 获取字典中配置的所有板块
const allSectors = computed(() => dictStore.getDictData(SECTOR_DICT_TYPE) || [])

// 根据选中的 Tab 过滤展示的板块
const displaySectors = computed(() => {
  let list = allSectors.value
  if (activeTab.value === 'my_all') {
    list = list.filter(s => myAllSectors.value.has(s.value))
  }
  else if (activeTab.value === 'held') {
    list = list.filter(s => holdingSectors.value.has(s.value))
  }
  else if (activeTab.value === 'watched') {
    list = list.filter(s => watchingSectors.value.has(s.value))
  }
  return list
})

// 组合字典数据与当日统计数据
const tableData = computed(() => {
  const statsMap = new Map()
  if (statsData.value) {
    statsData.value.forEach(s => statsMap.set(s.sector, s))
  }

  return displaySectors.value.map((sector) => {
    const stat = statsMap.get(sector.value) || {}
    return {
      value: sector.value,
      label: sector.label,
      changeRate: stat.changeRate !== undefined ? Number(stat.changeRate) : null,
      turnoverRate: stat.turnoverRate !== undefined ? Number(stat.turnoverRate) : null,
      volumeRatio: stat.volumeRatio !== undefined ? Number(stat.volumeRatio) : null,
      totalMarketCap: stat.totalMarketCap !== undefined ? Number(stat.totalMarketCap) : null,
      netInflow: stat.netInflow !== undefined ? Number(stat.netInflow) : null,
      upCount: stat.upCount ?? null,
      downCount: stat.downCount ?? null,
    }
  }).sort((a, b) => {
    // 默认按照涨跌幅降序排列
    return (b.changeRate || -9999) - (a.changeRate || -9999)
  })
})

// 辅助样式函数
function getColorClass(val: number | null) {
  if (val === null)
    return 'text-gray-500 dark:text-gray-400'
  if (val > 0)
    return 'text-red-500 dark:text-red-400'
  if (val < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500 dark:text-gray-400'
}

function formatPercent(val: number | null) {
  return val !== null ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : '-'
}
</script>

<template>
  <div class="mx-auto p-4 max-w-7xl lg:p-8 sm:p-6">
    <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold sm:text-3xl">
          板块分析
        </h1>
        <p class="text-gray-500 mt-1 dark:text-gray-400">
          每日各板块资金流向、涨跌与换手率追踪
        </p>
      </div>
      <div class="flex gap-4 items-center">
        <button class="btn flex items-center !text-sm" :disabled="isSyncing" @click="handleSync">
          <div i-carbon-update-now :class="{ 'animate-spin': isSyncing }" mr-1 />
          {{ isSyncing ? '抓取中...' : '手动更新' }}
        </button>
        <input v-model="selectedDate" type="date" class="input-base !w-auto">
      </div>
    </header>

    <div class="mb-6 p-1 rounded-lg bg-gray-100 inline-flex dark:bg-gray-800">
      <button
        class="text-sm font-medium px-4 py-1.5 rounded-md transition-all"
        :class="activeTab === 'all' ? 'bg-white text-primary shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="activeTab = 'all'"
      >
        全市场
      </button>
      <button
        class="text-sm font-medium px-4 py-1.5 rounded-md transition-all"
        :class="activeTab === 'my_all' ? 'bg-white text-primary shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="activeTab = 'my_all'"
      >
        全部自选 (持有+关注)
      </button>
      <button
        class="text-sm font-medium px-4 py-1.5 rounded-md transition-all"
        :class="activeTab === 'held' ? 'bg-white text-primary shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="activeTab = 'held'"
      >
        仅持仓
      </button>
      <button
        class="text-sm font-medium px-4 py-1.5 rounded-md transition-all"
        :class="activeTab === 'watched' ? 'bg-white text-primary shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="activeTab = 'watched'"
      >
        仅关注
      </button>
    </div>

    <!-- 数据表格 -->
    <div class="card overflow-hidden">
      <div v-if="pending" class="flex h-64 items-center justify-center">
        <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
      </div>
      <div v-else-if="tableData.length === 0" class="text-gray-500 py-20 text-center">
        <div i-carbon-filter-remove class="text-5xl mx-auto mb-4 opacity-30" />
        <p>当前筛选条件下无板块数据。</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="text-left w-full whitespace-nowrap">
          <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
            <tr>
              <th class="text-sm text-gray-600 font-semibold p-4 dark:text-gray-300">
                板块名称
              </th>
              <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
                涨跌幅
              </th>
              <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
                换手率
              </th>
              <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
                成交额占比
              </th>
              <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
                总市值
              </th>
              <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
                净流入(亿)
              </th>
              <th class="text-sm text-gray-600 font-semibold p-4 text-center dark:text-gray-300">
                涨跌家数
              </th>
            </tr>
          </thead>
          <tbody class="divide-gray-100 divide-y dark:divide-gray-700/50">
            <tr v-for="row in tableData" :key="row.value" class="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
              <td class="p-4">
                <div class="text-gray-800 font-medium dark:text-gray-200">
                  {{ row.label }}
                </div>
                <div class="text-[10px] text-gray-400 font-mono mt-0.5">
                  {{ row.value }}
                </div>
              </td>
              <td class="font-numeric font-semibold p-4 text-right" :class="getColorClass(row.changeRate)">
                {{ formatPercent(row.changeRate) }}
              </td>
              <td class="text-gray-600 font-numeric p-4 text-right dark:text-gray-300">
                {{ row.turnoverRate !== null ? `${row.turnoverRate.toFixed(2)}%` : '-' }}
              </td>
              <td class="text-gray-600 font-numeric p-4 text-right dark:text-gray-300">
                {{ row.volumeRatio !== null ? `${row.volumeRatio.toFixed(2)}%` : '-' }}
              </td>
              <td class="text-gray-600 font-numeric p-4 text-right dark:text-gray-300">
                {{ formatMarketCap(row.totalMarketCap) }}
              </td>
              <td class="font-numeric font-semibold p-4 text-right" :class="getColorClass(row.netInflow)">
                {{ row.netInflow !== null ? (row.netInflow > 0 ? '+' : '') + row.netInflow.toFixed(2) : '-' }}
              </td>
              <td class="text-xs p-4 text-center">
                <span v-if="row.upCount !== null || row.downCount !== null" class="flex gap-1.5 items-center justify-center">
                  <span class="text-red-500 font-numeric">{{ row.upCount ?? 0 }}</span>
                  <span class="text-gray-400">/</span>
                  <span class="text-green-500 font-numeric">{{ row.downCount ?? 0 }}</span>
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
