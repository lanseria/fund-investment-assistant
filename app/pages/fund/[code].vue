<!-- File: app/pages/fund/[code].vue -->
<script setup lang="ts">
import type { HoldingHistoryPoint } from '~/types/holding'
import { appName } from '~/constants'

const dayjs = useDayjs()
const route = useRoute<'fund-code'>()
const router = useRouter()
const code = route.params.code as string

const activeFilter = ref<string | null>(null)

const availableStrategies = [
  { label: '不显示策略', value: '' },
  { label: 'RSI 策略', value: 'rsi' },
  { label: '布林带策略', value: 'bollinger_bands' },
  { label: '双均线交叉策略', value: 'ma_cross' },
  { label: '双重确认策略', value: 'dual_confirmation' },
]
const selectedStrategy = ref(route.query.strategy as string || '')

const isStrategyModalOpen = ref(false)
const selectedSignal = ref<Record<string, any> | null>(null)

function openSignalDetails(signal: Record<string, any>) {
  selectedSignal.value = signal
  isStrategyModalOpen.value = true
}

// [新增] 用于控制图表缩放的状态
const dataZoomStart = ref(50)
const dataZoomEnd = ref(100)

const dateFilters = [
  { label: '近1个月', value: '1m', amount: 1, unit: 'month' },
  { label: '近3个月', value: '3m', amount: 3, unit: 'months' },
  { label: '近6个月', value: '6m', amount: 6, unit: 'months' },
  { label: '近1年', value: '1y', amount: 1, unit: 'year' },
  { label: '近2年', value: '2y', amount: 2, unit: 'years' },
  { label: '近5年', value: '5y', amount: 5, unit: 'years' },
  { label: '全部', value: 'all' },
]

// [修改] 简化 queryParams，只包含策略和MA
const queryParams = computed(() => ({
  ma: [5, 10, 20],
  // 移除 start_date 和 end_date
  strategy: selectedStrategy.value || undefined,
}))

// [修改] useAsyncData 不再监听 queryParams 的 start/end date 变化
const { data, pending, error, refresh } = await useAsyncData(
  `fund-data-${code}-${selectedStrategy.value}`, // key 中包含 strategy 以便在切换策略时刷新
  () => $fetch<{ history: HoldingHistoryPoint[], signals: any[] }>(`/api/fund/holdings/${code}/history`, {
    params: queryParams.value, // 只传递 ma 和 strategy
  }),
  {
    // [重要] 移除 watch，因为 selectedStrategy 已经包含在 key 中，切换时会自动触发刷新
  },
)

const holdingStore = useHoldingStore()
const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : code
})

const isSyncing = ref(false)
async function handleSyncHistory() {
  isSyncing.value = true
  try {
    await holdingStore.syncHistory(code)
    await refresh()
  }
  finally {
    isSyncing.value = false
  }
}

useHead({
  title: () => `详情: ${fundName.value} (${code}) - ${appName}`,
})

// [修改] 简化 watcher，只用于同步 URL
watch(selectedStrategy, (newStrategy) => {
  router.replace({
    query: {
      ...route.query,
      strategy: newStrategy || undefined,
    },
  })
})

// [新增] 页面加载或数据获取完成后，设置一个默认的缩放范围
watch(data, (newData) => {
  if (newData && newData.history.length > 0)
    setDateRange('1y') // 默认显示近1年
}, { immediate: true })

// [修改] 重写 setDateRange 函数，使其控制 dataZoom 而不是重新获取数据
function setDateRange(period: string) {
  activeFilter.value = period
  const historyData = data.value?.history
  if (!historyData || historyData.length === 0)
    return

  const totalPoints = historyData.length
  if (period === 'all') {
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
    return
  }

  const filter = dateFilters.find(f => f.value === period)
  if (!filter || !filter.unit)
    return

  // 从最后一天（今天）开始计算目标日期
  const targetDate = dayjs(historyData[totalPoints - 1]!.date).subtract(filter.amount, filter.unit as any)

  // 找到离目标日期最近的数据点索引 (数据是升序的)
  const startIndex = historyData.findIndex(p => dayjs(p.date).isAfter(targetDate))

  if (startIndex !== -1) {
    // 将索引转换为百分比
    dataZoomStart.value = (startIndex / totalPoints) * 100
    dataZoomEnd.value = 100
  }
  else {
    // 如果找不到（例如数据不足1年），则显示全部
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
  }
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8 flex items-center justify-between">
      <NuxtLink to="/" class="text-sm text-gray-500 inline-flex gap-2 transition-colors items-center hover:text-teal-500">
        <div i-carbon-arrow-left />
        返回持仓列表
      </NuxtLink>
      <button class="btn flex items-center" :disabled="isSyncing" @click="handleSyncHistory">
        <div i-carbon-update-now :class="{ 'animate-spin': isSyncing }" mr-1 />
        {{ isSyncing ? '同步中...' : '同步历史数据' }}
      </button>
    </header>

    <div class="mb-8 p-4 card space-y-4">
      <!-- 时间范围筛选按钮 (功能已在 script 中重写) -->
      <div class="flex flex-wrap gap-2">
        <button v-for="filter in dateFilters" :key="filter.value" class="text-sm px-3 py-1.5 rounded-md transition-colors" :class="[activeFilter === filter.value ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']" @click="setDateRange(filter.value)">
          {{ filter.label }}
        </button>
      </div>
      <!-- 策略选择器 (保持不变) -->
      <div class="gap-4 grid">
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

    <div v-if="pending" class="card flex h-100 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.message }}</p>
    </div>
    <!-- [修改] 将 dataZoomStart 和 dataZoomEnd 传递给 FundChart -->
    <div v-else-if="data && data.history.length > 0" class="p-4 card">
      <FundChart
        :history="data.history"
        :signals="data.signals"
        :title="`基金 ${fundName} 历史走势`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
        @signal-click="openSignalDetails"
      />
    </div>
    <div v-else class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>没有找到该基金的历史数据。</p>
    </div>

    <Modal v-model="isStrategyModalOpen" :title="`策略信号详情 (ID: ${selectedSignal?.id})`">
      <StrategyDetailModal :signal="selectedSignal" />
    </Modal>
  </div>
</template>
