<script setup lang="ts">
import { appName } from '~/constants'

const route = useRoute<'fund-code'>()
const dayjs = useDayjs()
const code = route.params.code as string

const holdingStore = useHoldingStore()
const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : `基金 ${code}`
})

const activeFilter = ref<string | null>(null)
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

const { data, pending, error } = await useAsyncData(
  `rsi-chart-data-full-${code}`,
  () => apiFetch(`/api/charts/rsi/${code}`),
)

function setDateRange(period: string) {
  activeFilter.value = period
  const allDates = data.value?.dates
  if (!allDates || allDates.length === 0)
    return

  const totalPoints = allDates.length
  if (period === 'all') {
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
    return
  }

  const filter = dateFilters.find(f => f.value === period)
  if (!filter || !filter.unit)
    return

  const targetDate = dayjs(allDates[totalPoints - 1]).subtract(filter.amount, filter.unit as any)
  const startIndex = allDates.findIndex(d => dayjs(d).isAfter(targetDate))

  if (startIndex !== -1) {
    dataZoomStart.value = (startIndex / totalPoints) * 100
    dataZoomEnd.value = 100
  }
  else {
    dataZoomStart.value = 0
    dataZoomEnd.value = 100
  }
}

watch(data, (newData) => {
  if (newData)
    setDateRange('3m') // 默认显示近3个月
}, { immediate: true })

useHead({
  title: () => `${fundName.value} - RSI 策略分析 - ${appName}`,
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <!-- [修改] 重新设计的 Header -->
    <header class="mb-8 flex items-center justify-between">
      <div class="flex gap-4 items-center">
        <!-- 1. 返回按钮：更清晰的图标按钮样式 -->
        <button
          class="text-2xl icon-btn"
          title="返回策略概览"
          @click="$router.back()"
        >
          <div i-carbon-arrow-left />
        </button>

        <!-- 2. 标题组：更清晰的层级关系 -->
        <div>
          <h1 class="text-xl text-gray-800 font-bold sm:text-2xl dark:text-gray-100">
            RSI 策略详情
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ fundName }} - {{ code }}
          </p>
        </div>
      </div>
      <!-- 这里可以为未来右侧的操作按钮留出位置 -->
    </header>

    <div class="mb-8 p-4 card">
      <div class="flex flex-wrap gap-2">
        <button v-for="filter in dateFilters" :key="filter.value" class="text-sm px-3 py-1.5 rounded-md transition-colors" :class="[activeFilter === filter.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']" @click="setDateRange(filter.value)">
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div class="p-4 card">
      <div v-if="pending" class="flex h-150 items-center justify-center">
        <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
      </div>
      <div v-else-if="error" class="text-red-500 py-20 text-center">
        <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
        <p>加载图表数据失败: {{ error.message }}</p>
      </div>
      <RsiDetailChart
        v-else-if="data"
        :data="data"
        :title="`${fundName} (RSI 策略分析)`"
        :data-zoom-start="dataZoomStart"
        :data-zoom-end="dataZoomEnd"
      />
    </div>
  </div>
</template>
