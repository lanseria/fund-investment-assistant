<script setup lang="ts">
// app/pages/fund/[code].vue
import type { HoldingHistoryPoint } from '~/types/holding'
import { computed, ref, watch } from 'vue' // 1. 导入 ref, watch, computed
import { appName } from '~/constants'

const route = useRoute<'fund-code'>()
const router = useRouter() // 2. 获取 router 实例，用于更新 URL
const code = route.params.code as string

// 3. 创建响应式 ref 来管理日期范围
// 从 URL 查询参数初始化，如果不存在则为 null
const startDate = ref<string | null>(route.query.start_date as string || null)
const endDate = ref<string | null>(route.query.end_date as string || null)

// 4. 创建一个计算属性，用于 useFetch 的 params
const queryParams = computed(() => {
  return {
    ma: [5, 10, 20], // 始终请求均线
    start_date: startDate.value || undefined, // 如果为 null，则为 undefined，useFetch会忽略它
    end_date: endDate.value || undefined,
  }
})

// 5. 使用 useFetch，并将其 key 和 params 设为响应式的
const { data: history, pending, error, refresh } = await useAsyncData(
  `fund-history-${code}`, // 创建一个唯一的 key
  () => $fetch<HoldingHistoryPoint[]>(`/api/fund/holdings/${code}/history`, {
    params: queryParams.value, // 使用计算属性作为参数
  }),
  {
    watch: [queryParams], // 告诉 useAsyncData 监听 queryParams 的变化
  },
)

// --- 动态标题和名称逻辑 (保持不变，但可以优化) ---
const holdingStore = useHoldingStore()
// 从 store 中查找基金名称，比占位符更好
const fundName = computed(() => {
  const holding = holdingStore.holdings.find(h => h.code === code)
  return holding ? holding.name : code
})

useHead({
  title: () => `详情: ${fundName.value} (${code}) - ${appName}`,
})

// 6. 监听日期变化，并更新 URL，但不触发导航
watch([startDate, endDate], () => {
  router.replace({
    query: {
      ...route.query, // 保留其他可能的查询参数
      start_date: startDate.value || undefined,
      end_date: endDate.value || undefined,
    },
  })
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

    <!-- 日期选择器区域 -->
    <div class="card mb-8 p-4">
      <div class="gap-4 grid grid-cols-1 sm:grid-cols-3">
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
        <!-- 占位符，让清除按钮在右边 -->
        <div class="hidden sm:flex sm:items-end sm:justify-end" />
      </div>
    </div>

    <!-- 图表和状态显示区域 -->
    <div v-if="pending" class="card flex h-100 items-center justify-center">
      <div i-carbon-circle-dash class="text-4xl text-teal-500 animate-spin" />
    </div>
    <div v-else-if="error" class="card text-red-500 py-20 text-center">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.data?.detail || error.message }}</p>
    </div>
    <div v-else-if="history && history.length > 0" class="card p-4">
      <FundChart :history="history" :title="`基金 ${fundName} 历史走势`" />
    </div>
    <div v-else class="card text-gray-500 py-20 text-center">
      <div i-carbon-search class="text-5xl mx-auto mb-4" />
      <p>在指定的时间范围内没有找到数据。</p>
    </div>
  </div>
</template>
