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
const isSyncing = ref(false)
const isHelpModalOpen = ref(false) // 帮助模态框状态

// 确保基础数据已加载
onMounted(async () => {
  if (holdingStore.holdings.length === 0) {
    await holdingStore.fetchHoldings()
  }
})

// 请求板块统计数据
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

// --- 数据计算逻辑 ---

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
const allSectors = computed(() => dictStore.getDictData(SECTOR_DICT_TYPE) || [])

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
      // 对比数据
      diffVolumeRatio: stat.diffVolumeRatio !== undefined ? Number(stat.diffVolumeRatio) : 0,
      diffTurnoverRate: stat.diffTurnoverRate !== undefined ? Number(stat.diffTurnoverRate) : 0,
      // 决策数据
      signal: stat.signal || '-',
      signalCode: stat.signalCode || 'neutral',
      action: stat.action || '-',

      upCount: stat.upCount ?? null,
      downCount: stat.downCount ?? null,
    }
  }).sort((a, b) => {
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

function getDiffColorClass(val: number) {
  if (val > 0)
    return 'text-red-500 dark:text-red-400'
  if (val < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-400'
}

function formatPercent(val: number | null) {
  return val !== null ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : '-'
}

function formatMarketCap(val: number | null) {
  if (val === null)
    return '-'
  if (val >= 100000000)
    return `${(val / 100000000).toFixed(2)} 亿`
  return formatCurrency(val)
}

// 信号样式
function getSignalClass(code: string) {
  switch (code) {
    case 'top': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
    case 'up': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
    case 'bottom': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
    case 'down': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
    default: return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
  }
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
          基于量化四象限的每日资金流向与决策追踪
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
        全部自选
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
                <span class="text-[10px] text-gray-400 font-normal block">(vs 昨日)</span>
              </th>
              <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
                成交额占比
                <span class="text-[10px] text-gray-400 font-normal block">(vs 昨日)</span>
              </th>

              <th class="text-sm text-gray-600 font-semibold p-4 text-center dark:text-gray-300">
                <div class="flex gap-1 cursor-help items-center justify-center hover:text-primary" @click="isHelpModalOpen = true">
                  AI 决策
                  <div i-carbon-information />
                </div>
              </th>

              <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
                总市值
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
              <!-- 换手率 -->
              <td class="p-4 text-right">
                <div class="text-gray-800 font-medium font-numeric dark:text-gray-200">
                  {{ row.turnoverRate !== null ? `${row.turnoverRate.toFixed(2)}%` : '-' }}
                </div>
                <div class="text-[10px] font-numeric mt-0.5" :class="getDiffColorClass(row.diffTurnoverRate)">
                  {{ row.diffTurnoverRate > 0 ? '▲' : (row.diffTurnoverRate < 0 ? '▼' : '') }}
                  {{ Math.abs(row.diffTurnoverRate).toFixed(2) }}%
                </div>
              </td>
              <!-- 成交额占比 -->
              <td class="p-4 text-right">
                <div class="text-gray-800 font-medium font-numeric dark:text-gray-200">
                  {{ row.volumeRatio !== null ? `${row.volumeRatio.toFixed(2)}%` : '-' }}
                </div>
                <div class="text-[10px] font-numeric mt-0.5" :class="getDiffColorClass(row.diffVolumeRatio)">
                  {{ row.diffVolumeRatio > 0 ? '▲' : (row.diffVolumeRatio < 0 ? '▼' : '') }}
                  {{ Math.abs(row.diffVolumeRatio).toFixed(2) }}%
                </div>
              </td>

              <!-- 决策信号 -->
              <td class="p-4 text-center">
                <div class="inline-flex flex-col items-center">
                  <span
                    class="text-xs font-bold mb-1 px-2 py-0.5 border rounded"
                    :class="getSignalClass(row.signalCode)"
                  >
                    {{ row.signal }}
                  </span>
                  <span class="text-[10px] text-gray-500 font-bold dark:text-gray-400">{{ row.action }}</span>
                </div>
              </td>

              <td class="text-gray-600 font-numeric p-4 text-right dark:text-gray-300">
                {{ formatMarketCap(row.totalMarketCap) }}
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

    <!-- 决策系统说明模态框 -->
    <Modal v-model="isHelpModalOpen" title="量化决策系统说明">
      <div class="text-sm p-2 max-w-none prose dark:prose-invert">
        <p class="text-gray-500 mb-4">
          本系统通过结合<b>成交额占比</b>、<b>换手率</b>以及<b>量价配合</b>，构建三维交叉判定的风控模型。
        </p>
        <table class="text-xs text-left w-full border-collapse sm:text-sm">
          <thead>
            <tr class="bg-gray-100 dark:bg-gray-700">
              <th class="p-2 border dark:border-gray-600">
                状态信号
              </th>
              <th class="p-2 border dark:border-gray-600">
                指标特征
              </th>
              <th class="p-2 border dark:border-gray-600">
                市场含义
              </th>
              <th class="p-2 border dark:border-gray-600">
                指令
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-red-600 font-bold p-2 border bg-red-50 dark:border-gray-600 dark:bg-red-900/20">
                主升浪
              </td>
              <td class="p-2 border dark:border-gray-600">
                收涨 且 水位健康(3~8%)<br>换手率 > 2% 且 稳步放大
              </td>
              <td class="p-2 border dark:border-gray-600">
                量价齐升，资金持续流入
              </td>
              <td class="font-bold p-2 border dark:border-gray-600">
                持仓 / 加仓
              </td>
            </tr>
            <tr>
              <td class="text-purple-600 font-bold p-2 border bg-purple-50 dark:border-gray-600 dark:bg-purple-900/20">
                极度拥挤 / 高位震荡
              </td>
              <td class="p-2 border dark:border-gray-600">
                成交额占比 > 10%<br>无论涨跌
              </td>
              <td class="p-2 border dark:border-gray-600">
                板块严重吸血，随时瓦解
              </td>
              <td class="font-bold p-2 border dark:border-gray-600">
                减仓防守 / 停止买入
              </td>
            </tr>
            <tr>
              <td class="text-green-600 font-bold p-2 border bg-green-50 dark:border-gray-600 dark:bg-green-900/20">
                放量大跌 / 无量阴跌
              </td>
              <td class="p-2 border dark:border-gray-600">
                跌幅 > 2%<br>伴随 换手急剧放大 或 极度萎缩
              </td>
              <td class="p-2 border dark:border-gray-600">
                恐慌性出逃 或 多头躺平
              </td>
              <td class="font-bold p-2 border dark:border-gray-600">
                坚决清仓 / 空仓观望
              </td>
            </tr>
            <tr>
              <td class="text-blue-600 font-bold p-2 border bg-blue-50 dark:border-gray-600 dark:bg-blue-900/20">
                冰点筑底
              </td>
              <td v-pre class="p-2 border dark:border-gray-600">
                <!-- eslint-disable-next-line vue/no-parsing-error -->
                换手率 < 1%
              </td>
              <td class="p-2 border dark:border-gray-600">
                抛压枯竭，无人问津
              </td>
              <td class="font-bold p-2 border dark:border-gray-600">
                左侧建仓
              </td>
            </tr>
          </tbody>
        </table>
        <div class="text-xs text-gray-400 mt-4">
          * 注：若未满足上述条件，则显示为“震荡/分歧”，建议观望。
        </div>
      </div>
    </Modal>
  </div>
</template>
