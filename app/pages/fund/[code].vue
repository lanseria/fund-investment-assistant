<!-- File: app/pages/fund/[code].vue -->
<script setup lang="ts">
import type { Dayjs } from 'dayjs'
import type { HoldingHistoryPoint } from '~/types/holding'
import { computed, ref, watch } from 'vue'
import { appName } from '~/constants'

const dayjs = useDayjs()
const route = useRoute<'fund-code'>()
const router = useRouter()
const code = route.params.code as string

const startDate = ref<string | null>(route.query.start_date as string || null)
const endDate = ref<string | null>(route.query.end_date as string || null)
const activeFilter = ref<string | null>(null)

// [新增] 策略选择
const availableStrategies = [
  { label: '不显示策略', value: '' },
  { label: 'RSI 策略', value: 'rsi' },
  { label: '布林带策略', value: 'bollinger_bands' },
]
const selectedStrategy = ref(route.query.strategy as string || '')

// [新增] 策略详情模态框状态
const isStrategyModalOpen = ref(false)
const selectedSignal = ref<Record<string, any> | null>(null)

function openSignalDetails(signal: Record<string, any>) {
  selectedSignal.value = signal
  isStrategyModalOpen.value = true
}

// ... (setDateRange 等函数保持不变) ...
const dateFilters = [
  { label: '近1个月', value: '1m' },
  { label: '近3个月', value: '3m' },
  { label: '近6个月', value: '6m' },
  { label: '近1年', value: '1y' },
  { label: '近2年', value: '2y' },
  { label: '近5年', value: '5y' },
  { label: '全部', value: 'all' },
]
let skipReset = false
function setDateRange(period: string) {
  skipReset = true
  activeFilter.value = period
  const end = dayjs()
  if (period === 'all') {
    startDate.value = null
    endDate.value = null
    return
  }
  let start: Dayjs
  switch (period) {
    case '1m': start = end.subtract(1, 'month'); break
    case '3m': start = end.subtract(3, 'months'); break
    case '6m': start = end.subtract(6, 'months'); break
    case '1y': start = end.subtract(1, 'year'); break
    case '2y': start = end.subtract(2, 'years'); break
    case '5y': start = end.subtract(5, 'years'); break
    default: start = end.subtract(1, 'month'); break
  }
  startDate.value = start.format('YYYY-MM-DD')
  endDate.value = end.format('YYYY-MM-DD')
  nextTick(() => (skipReset = false))
}

if (!route.query.start_date && !route.query.end_date)
  setDateRange('1y')

const queryParams = computed(() => {
  return {
    ma: [5, 10, 20],
    start_date: startDate.value || undefined,
    end_date: endDate.value || undefined,
    strategy: selectedStrategy.value || undefined, // [修改] 添加策略参数
  }
})

// [修改] 解构出 refresh 方法，用于刷新图表数据
const { data, pending, error, refresh } = await useAsyncData(
  `fund-data-${code}`,
  () => $fetch<{ history: HoldingHistoryPoint[], signals: any[] }>(`/api/fund/holdings/${code}/history`, {
    params: queryParams.value,
  }),
  {
    watch: [queryParams],
  },
)

const holdingStore = useHoldingStore()
const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : code
})

// [新增] 手动同步逻辑
const isSyncing = ref(false)
async function handleSyncHistory() {
  isSyncing.value = true
  try {
    await holdingStore.syncHistory(code)
    // 同步成功后，调用 refresh 方法重新获取图表数据
    await refresh()
  }
  finally {
    isSyncing.value = false
  }
}

useHead({
  title: () => `详情: ${fundName.value} (${code}) - ${appName}`,
})

// [修改] 监听 selectedStrategy 的变化
watch([startDate, endDate, selectedStrategy], ([newStart, newEnd, newStrategy]) => {
  router.replace({
    query: {
      ...route.query,
      start_date: newStart || undefined,
      end_date: newEnd || undefined,
      strategy: newStrategy || undefined,
    },
  })

  if (skipReset)
    return
  activeFilter.value = null
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <!-- [修改] 头部布局 -->
    <header class="mb-8 flex items-center justify-between">
      <NuxtLink to="/" class="text-sm text-gray-500 inline-flex gap-2 transition-colors items-center hover:text-teal-500">
        <div i-carbon-arrow-left />
        返回持仓列表
      </NuxtLink>
      <!-- [新增] 手动同步按钮 -->
      <button class="flex items-center btn" :disabled="isSyncing" @click="handleSyncHistory">
        <div i-carbon-update-now :class="{ 'animate-spin': isSyncing }" mr-1 />
        {{ isSyncing ? '同步中...' : '同步历史数据' }}
      </button>
    </header>

    <div class="mb-8 p-4 space-y-4 card">
      <!-- ... (日期筛选按钮) ... -->
      <div class="flex flex-wrap gap-2">
        <button v-for="filter in dateFilters" :key="filter.value" class="text-sm px-3 py-1.5 rounded-md transition-colors" :class="[activeFilter === filter.value ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']" @click="setDateRange(filter.value)">
          {{ filter.label }}
        </button>
      </div>
      <!-- [新增] 策略选择器 -->
      <div class="gap-4 grid grid-cols-1 sm:grid-cols-3">
        <div>
          <label for="start-date" class="text-sm font-medium mb-1 block">开始日期</label>
          <input id="start-date" v-model="startDate" type="date" class="input-base">
        </div>
        <div>
          <label for="end-date" class="text-sm font-medium mb-1 block">结束日期</label>
          <input id="end-date" v-model="endDate" type="date" class="input-base">
        </div>
        <div>
          <label for="strategy-select" class="text-sm font-medium mb-1 block">叠加策略</label>
          <select id="strategy-select" v-model="selectedStrategy" class="input-base">
            <option v-for="s in availableStrategies" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="pending" class="flex h-100 items-center justify-center card">
      <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.message }}</p>
    </div>
    <!-- [修改] 将 data.history 和 data.signals 传递给 FundChart -->
    <div v-else-if="data && data.history.length > 0" class="p-4 card">
      <FundChart :history="data.history" :signals="data.signals" :title="`基金 ${fundName} 历史走势`" @signal-click="openSignalDetails" />
    </div>
    <div v-else class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>在指定的时间范围内没有找到数据。</p>
    </div>

    <!-- [新增] 策略详情模态框 -->
    <Modal v-model="isStrategyModalOpen" :title="`策略信号详情 (ID: ${selectedSignal?.id})`">
      <StrategyDetailModal :signal="selectedSignal" />
    </Modal>
  </div>
</template>
