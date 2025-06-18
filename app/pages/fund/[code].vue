<!-- app/pages/fund/[code].vue -->
<script setup lang="ts">
import type { Dayjs } from 'dayjs'
import type { HoldingHistoryPoint } from '~/types/holding'
import { computed, ref, watch } from 'vue'
import { appName } from '~/constants'

// 1. 引入 dayjs composable
const dayjs = useDayjs()
const route = useRoute<'fund-code'>()
const router = useRouter()
const code = route.params.code as string

const startDate = ref<string | null>(route.query.start_date as string || null)
const endDate = ref<string | null>(route.query.end_date as string || null)

const activeFilter = ref<string | null>(null)
const dateFilters = [
  { label: '近1个月', value: '1m' },
  { label: '近3个月', value: '3m' },
  { label: '近6个月', value: '6m' },
  { label: '近1年', value: '1y' },
  { label: '近2年', value: '2y' },
  { label: '近5年', value: '5y' },
  { label: '全部', value: 'all' },
]

// 2. 使用 dayjs 重构 setDateRange 函数
function setDateRange(period: string) {
  activeFilter.value = period
  const end = dayjs()

  if (period === 'all') {
    startDate.value = null
    endDate.value = null
    return
  }

  let start: Dayjs

  switch (period) {
    case '1m':
      start = end.subtract(1, 'month')
      break
    case '3m':
      start = end.subtract(3, 'months')
      break
    case '6m':
      start = end.subtract(6, 'months')
      break
    case '1y':
      start = end.subtract(1, 'year')
      break
    case '2y':
      start = end.subtract(2, 'years')
      break
    case '5y':
      start = end.subtract(5, 'years')
      break
    default:
      // 默认情况，以防万一
      start = end.subtract(1, 'month')
      break
  }

  startDate.value = start.format('YYYY-MM-DD')
  endDate.value = end.format('YYYY-MM-DD')
}
// 移除了旧的 formatDate 函数，因为 dayjs().format() 已经替代了它

if (!route.query.start_date && !route.query.end_date)
  setDateRange('1m')

const queryParams = computed(() => {
  return {
    ma: [5, 10, 20],
    start_date: startDate.value || undefined,
    end_date: endDate.value || undefined,
  }
})

const { data: history, pending, error } = await useAsyncData(
  `fund-history-${code}`,
  () => $fetch<HoldingHistoryPoint[]>(`/api/fund/holdings/${code}/history`, {
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

useHead({
  title: () => `详情: ${fundName.value} (${code}) - ${appName}`,
})

watch([startDate, endDate], ([newStart, newEnd]) => {
  router.replace({
    query: {
      ...route.query,
      start_date: newStart || undefined,
      end_date: newEnd || undefined,
    },
  })
  if (activeFilter.value)
    activeFilter.value = null
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8">
      <NuxtLink to="/" class="text-sm text-gray-500 inline-flex gap-2 transition-colors items-center hover:text-teal-500">
        <div i-carbon-arrow-left />
        返回持仓列表
      </NuxtLink>
    </header>

    <div class="mb-8 p-4 space-y-4 card">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="filter in dateFilters"
          :key="filter.value"
          class="text-sm px-3 py-1.5 rounded-md transition-colors" :class="[
            activeFilter === filter.value
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600',
          ]"
          @click="setDateRange(filter.value)"
        >
          {{ filter.label }}
        </button>
      </div>

      <div class="gap-4 grid grid-cols-1 sm:grid-cols-2">
        <div>
          <label for="start-date" class="text-sm font-medium mb-1 block">开始日期</label>
          <input
            id="start-date"
            v-model="startDate"
            type="date"
            class="input-base"
          >
        </div>
        <div>
          <label for="end-date" class="text-sm font-medium mb-1 block">结束日期</label>
          <input
            id="end-date"
            v-model="endDate"
            type="date"
            class="input-base"
          >
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
    <div v-else-if="history && history.length > 0" class="p-4 card">
      <FundChart :history="history" :title="`基金 ${fundName} 历史走势`" />
    </div>
    <div v-else class="text-gray-500 py-20 text-center card">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>在指定的时间范围内没有找到数据。</p>
    </div>
  </div>
</template>
