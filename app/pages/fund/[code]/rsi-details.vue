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

// 设置一个默认的开始日期（一年前），并允许用户修改
const startDate = ref(dayjs().subtract(1, 'year').format('YYYY-MM-DD'))

// 使用 useAsyncData 获取图表数据
const { data, pending, error, refresh } = await useAsyncData(
  `rsi-chart-data-${code}-${startDate.value}`,
  () => $fetch(`/api/charts/rsi/${code}`, {
    params: { start_date: startDate.value },
  }),
  { watch: [startDate] }, // 当 startDate 变化时，自动重新获取数据
)

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
      <!-- 日期选择器 -->
      <div class="flex gap-2 items-center">
        <label for="start-date" class="text-sm font-medium">开始日期:</label>
        <input id="start-date" v-model="startDate" type="date" class="input-base w-40">
      </div>
    </header>

    <div class="p-4 card">
      <div v-if="pending" class="flex h-150 items-center justify-center">
        <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
      </div>
      <div v-else-if="error" class="text-red-500 py-20 text-center">
        <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
        <p>加载图表数据失败: {{ error.message }}</p>
      </div>
      <RsiDetailChart v-else-if="data" :data="data" :title="`${fundName} (RSI 策略分析)`" />
    </div>
  </div>
</template>
