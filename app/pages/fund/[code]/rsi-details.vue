<script setup lang="ts">
import { appName } from '~/constants'

const route = useRoute()
const dayjs = useDayjs()
const code = route.params.code as string

const holdingStore = useHoldingStore()
const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : `基金 ${code}`
})

// [新增] 引入与详情页相同的交互状态
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
  () => $fetch(`/api/charts/rsi/${code}`),
)

// [新增] setDateRange 函数，用于控制 dataZoom
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

// [新增] 页面加载或数据获取完成后，设置一个默认的缩放范围
watch(data, (newData) => {
  if (newData)
    setDateRange('3m') // 默认显示近1年
}, { immediate: true })

useHead({
  title: () => `${fundName.value} - RSI 策略分析 - ${appName}`,
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8 flex flex-col gap-4 items-start justify-between sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-bold sm:text-3xl">
          {{ fundName }} - RSI 策略详情
        </h1>
        <NuxtLink :to="`/fund/${code}`" class="text-sm text-teal-500 mt-1 inline-flex gap-1 items-center hover:underline">
          <div i-carbon-arrow-left />
          返回策略概览
        </NuxtLink>
      </div>
    </header>

    <!-- [修改] 移除日期选择器，替换为快速筛选按钮 -->
    <div class="mb-8 p-4 card">
      <div class="flex flex-wrap gap-2">
        <button v-for="filter in dateFilters" :key="filter.value" class="text-sm px-3 py-1.5 rounded-md transition-colors" :class="[activeFilter === filter.value ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600']" @click="setDateRange(filter.value)">
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div class="p-4 card">
      <div v-if="pending" class="flex h-150 items-center justify-center">
        <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
      </div>
      <div v-else-if="error" class="text-red-500 py-20 text-center">
        <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
        <p>加载图表数据失败: {{ error.message }}</p>
      </div>
      <!-- [修改] 传递 dataZoom props -->
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
