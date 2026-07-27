<script setup lang="ts">
import type { FundRealtimeDetail } from '~/types/realtime'
import { appName } from '~/constants'

useHead({
  title: `盘中估值 - ${appName}`,
})

const toast = useToast()

const route = useRoute()
const router = useRouter()

// URL query 同步 code(参考 leaderboard/index.vue 的 activePeriod 模式)
const queryCode = computed<string>({
  get: () => (route.query.code as string) || '',
  set: val => router.replace({ query: { ...route.query, code: val } }),
})

// 输入框本地值,提交查询时同步到 URL
const inputCode = ref(queryCode.value)
watch(queryCode, (val) => {
  inputCode.value = val
})

// 6 位数字代码校验
function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim())
}

// 仅在代码合法时发起请求(参考 Nuxt useAsyncData 的 lazy 模式)
const { data, pending, error } = await useAsyncData(
  () => `realtime-${queryCode.value}`,
  () => {
    const code = queryCode.value.trim()
    if (!isValidCode(code))
      return Promise.resolve(null)
    return apiFetch<FundRealtimeDetail>(`/api/fund/realtime/${code}`)
  },
  {
    watch: [queryCode],
    default: () => null,
  },
)

function handleQuery() {
  const code = inputCode.value.trim()
  if (!isValidCode(code)) {
    toast.warning('请输入 6 位数字基金代码')
    return
  }
  queryCode.value = code
}

function handleEnter(event: KeyboardEvent) {
  if (event.key === 'Enter')
    handleQuery()
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold sm:text-3xl">
        盘中实时估值
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        输入任意开放式基金代码,查询盘中实时估算净值与分时走势
      </p>
    </header>

    <!-- 查询输入区 -->
    <div class="mb-6 p-4 card">
      <div class="flex flex-wrap gap-3 items-center">
        <div class="flex flex-1 gap-2 min-w-64 items-center">
          <div class="i-carbon-search text-gray-400" />
          <input
            v-model="inputCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="请输入 6 位基金代码,如 110011"
            class="input-base flex-1"
            @keydown="handleEnter"
          >
        </div>
        <button class="btn-primary btn flex items-center" :disabled="pending" @click="handleQuery">
          <div v-if="pending" class="i-carbon-circle-dash mr-1 animate-spin" />
          {{ pending ? '查询中...' : '查询' }}
        </button>
      </div>
      <p class="text-xs text-gray-400 mt-2">
        提示:QDII、货币型基金无盘中估算,会自动回退到最近净值
      </p>
    </div>

    <!-- Loading -->
    <div v-if="pending && !data" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-3xl text-primary animate-spin" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p class="font-semibold">
        查询失败
      </p>
      <p class="text-sm mt-1">
        {{ error.statusCode === 404
          ? '未找到该基金,或数据源暂时不可用'
          : error.statusCode === 400
            ? '基金代码格式错误,需为 6 位数字'
            : `加载失败: ${error.message || '服务异常'}` }}
      </p>
    </div>

    <!-- 数据展示 -->
    <RealtimeEstimatePanel v-else-if="data" :data="data" />

    <!-- 初始空状态 -->
    <div v-else class="text-gray-400 py-20 text-center card">
      <div i-carbon-dashboard class="text-5xl mx-auto mb-4 opacity-30" />
      <p>输入基金代码开始查询</p>
    </div>
  </div>
</template>
