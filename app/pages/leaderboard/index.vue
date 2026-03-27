<script setup lang="ts">
import type { LeaderboardPeriod, LeaderboardUser } from '~/types/leaderboard'
import { appName } from '~/constants'
import { formatCurrency as formatCurrencyUtil } from '~/utils/format'

useHead({
  title: `收益率排行榜 - ${appName}`,
})

const periods: { label: string, value: LeaderboardPeriod }[] = [
  { label: '日榜 (Today)', value: '1d' },
  { label: '周榜 (Week)', value: '1w' },
  { label: '月榜 (Month)', value: '1m' },
  { label: '年榜 (Year)', value: '1y' },
]

const route = useRoute()
const router = useRouter()

// 使用 computed 实现双向绑定同步到 URL Query
const activePeriod = computed<LeaderboardPeriod>({
  get: () => (route.query.period as LeaderboardPeriod) || '1d',
  set: val => router.replace({ query: { ...route.query, period: val } }),
})

// 切换周期时自动重新请求
const { data: leaderboardData, pending, error } = useAsyncData(
  'leaderboard',
  () => apiFetch<LeaderboardUser[]>('/api/leaderboard', {
    params: { period: activePeriod.value },
  }),
  {
    watch: [activePeriod],
  },
)

// --- 辅助函数 ---
function getProfitRateClass(rate: number) {
  if (rate > 0)
    return 'text-red-500 dark:text-red-400'
  if (rate < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

function getRankIcon(rank: number) {
  if (rank === 1)
    return 'i-twemoji-1st-place-medal text-3xl'
  if (rank === 2)
    return 'i-twemoji-2nd-place-medal text-3xl'
  if (rank === 3)
    return 'i-twemoji-3rd-place-medal text-3xl'
  return ''
}

function formatCurrency(value: number) {
  if (value === null || value === undefined)
    return '-'
  // 简化显示：如果是万以上，显示 x.xx万
  if (Math.abs(value) > 10000) {
    return `¥${(value / 10000).toFixed(2)}万`
  }
  return formatCurrencyUtil(value)
}

function getPeriodLabel(period: LeaderboardPeriod) {
  switch (period) {
    case '1d': return '今日'
    case '1w': return '本周'
    case '1m': return '本月'
    case '1y': return '今年'
    default: return ''
  }
}

const isStrategyModalOpen = ref(false)
const selectedStrategyUser = ref<LeaderboardUser | null>(null)

function openStrategyModal(user: LeaderboardUser) {
  selectedStrategyUser.value = user
  isStrategyModalOpen.value = true
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold sm:text-3xl">
        收益率排行榜
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        发现社区中的顶尖投资者
      </p>
    </header>

    <!-- Period Tabs -->
    <div class="mb-6 p-1 rounded-lg bg-gray-100 inline-flex dark:bg-gray-800">
      <button
        v-for="p in periods"
        :key="p.value"
        class="text-sm font-medium px-4 py-1.5 rounded-md transition-all"
        :class="activePeriod === p.value
          ? 'bg-white text-primary shadow-sm dark:bg-gray-700 dark:text-white'
          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="activePeriod = p.value"
      >
        {{ p.label }}
      </button>
    </div>

    <!-- Loading / Error -->
    <div v-if="pending" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-3xl text-primary animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div i-carbon-warning-alt class="text-5xl mx-auto mb-4" />
      <p>加载排行榜数据失败</p>
    </div>

    <!-- Data List -->
    <div v-else-if="leaderboardData && leaderboardData.length > 0" class="card overflow-hidden">
      <!-- Header Row -->
      <div class="text-xs text-gray-500 font-semibold px-4 py-3 border-b bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-700/50">
        <div class="text-center w-12">
          排名
        </div>
        <div class="pl-2 flex-grow">
          用户 / 资产分布
        </div>
        <div class="flex gap-4 w-64 justify-end md:gap-8">
          <div class="text-right w-24">
            {{ getPeriodLabel(activePeriod) }}收益额
          </div>
          <div class="text-right w-24">
            {{ getPeriodLabel(activePeriod) }}收益率
          </div>
        </div>
        <div class="w-8" /> <!-- Chevron placeholder -->
      </div>

      <!-- User Rows -->
      <div v-for="user in leaderboardData" :key="user.id" class="border-b last:border-b-0 dark:border-gray-700">
        <div
          class="px-4 py-3 flex cursor-pointer transition-colors items-center hover:bg-gray-50 dark:hover:bg-gray-700/30"
          @click="router.push(`/leaderboard/${user.id}`)"
        >
          <!-- Rank -->
          <div class="text-center flex flex-shrink-0 w-12 justify-center">
            <div v-if="getRankIcon(user.rank)" :class="getRankIcon(user.rank)" />
            <span v-else class="text-lg text-gray-500 font-bold font-mono tabular-nums">{{ user.rank }}</span>
          </div>

          <!-- User Info & Assets Breakdown -->
          <div class="pl-2 flex-grow min-w-0">
            <div class="flex flex-wrap gap-2 items-center">
              <span class="font-bold truncate">{{ user.username }}</span>
              <AiAgentBadge v-if="user.aiMode !== 'off'" :mode="user.aiMode" />
              <button
                v-if="user.aiSystemPrompt"
                class="icon-btn text-gray-400 flex-shrink-0 transition-colors dark:text-gray-500 hover:text-primary dark:hover:text-primary"
                title="查看操作策略"
                @click.stop="openStrategyModal(user)"
              >
                <div class="i-carbon-catalog" />
              </button>

              <!-- 当日交易统计 Badges -->
              <div v-if="user.todayCounts && user.todayCounts.total > 0" class="text-[10px] flex flex-wrap gap-1">
                <span v-if="user.todayCounts.buy > 0" class="text-red-600 px-1.5 py-0.5 border border-red-100 rounded-full bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20">
                  买入: {{ user.todayCounts.buy }}
                </span>
                <span v-if="user.todayCounts.sell > 0" class="text-green-600 px-1.5 py-0.5 border border-green-100 rounded-full bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-900/20">
                  卖出: {{ user.todayCounts.sell }}
                </span>
                <span v-if="user.todayCounts.convert_in > 0" class="text-purple-600 px-1.5 py-0.5 border border-purple-100 rounded-full bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-900/20">
                  转入: {{ user.todayCounts.convert_in }}
                </span>
                <span v-if="user.todayCounts.convert_out > 0" class="text-blue-600 px-1.5 py-0.5 border border-blue-100 rounded-full bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-900/20">
                  转出: {{ user.todayCounts.convert_out }}
                </span>
                <span v-if="user.todayCounts.pending > 0" class="text-yellow-600 px-1.5 py-0.5 border border-yellow-100 rounded-full bg-yellow-50 dark:text-yellow-400 dark:border-yellow-800 dark:bg-yellow-900/20">
                  待处理: {{ user.todayCounts.pending }}
                </span>
                <span v-if="user.todayCounts.draft > 0" class="text-purple-600 px-1.5 py-0.5 border border-purple-100 rounded-full bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-900/20">
                  草稿: {{ user.todayCounts.draft }}
                </span>
              </div>
            </div>

            <!-- 资产细分条 (带进度条) -->
            <div class="mt-2 max-w-md w-full">
              <!-- 进度条 -->
              <div class="rounded-full bg-gray-100 flex h-1.5 w-full overflow-hidden dark:bg-gray-700/50">
                <!-- 基金部分 -->
                <div
                  class="group/bar bg-blue-500 relative"
                  :style="{ width: user.totalAssets > 0 ? `${(user.fundValue / user.totalAssets) * 100}%` : '0%' }"
                >
                  <!-- 悬浮显示仓位 -->
                  <div class="text-[10px] text-white mb-1 px-1.5 py-0.5 rounded bg-gray-800 opacity-0 pointer-events-none whitespace-nowrap transition-opacity bottom-full left-1/2 absolute z-10 group-hover/bar:opacity-100 -translate-x-1/2">
                    仓位: {{ user.totalAssets > 0 ? ((user.fundValue / user.totalAssets) * 100).toFixed(0) : 0 }}%
                  </div>
                </div>
                <!-- 现金部分 (自动填充剩余) -->
                <div class="group/bar-cash bg-emerald-400 flex-grow relative">
                  <div class="text-[10px] text-white mb-1 px-1.5 py-0.5 rounded bg-gray-800 opacity-0 pointer-events-none whitespace-nowrap transition-opacity bottom-full left-1/2 absolute z-10 group-hover/bar-cash:opacity-100 -translate-x-1/2">
                    现金: {{ user.totalAssets > 0 ? ((user.cash / user.totalAssets) * 100).toFixed(0) : 0 }}%
                  </div>
                </div>
              </div>

              <!-- 数值详情 -->
              <div class="text-[10px] text-gray-400 font-mono mt-1 flex items-center justify-between">
                <div class="flex gap-2">
                  <span class="flex gap-1 items-center" title="基金市值">
                    <span class="rounded-full bg-blue-500 h-1.5 w-1.5" />
                    {{ formatCurrency(user.fundValue) }}
                  </span>
                  <span class="flex gap-1 items-center" title="可用现金">
                    <span class="rounded-full bg-emerald-400 h-1.5 w-1.5" />
                    {{ formatCurrency(user.cash) }}
                  </span>
                </div>
                <div class="text-gray-600 font-bold dark:text-gray-300" title="总资产">
                  Total: {{ formatCurrency(user.totalAssets) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Stats -->
          <div class="flex flex-shrink-0 gap-4 w-64 justify-end md:gap-8">
            <div class="flex flex-col w-24 items-end justify-center">
              <span class="font-mono font-semibold tabular-nums" :class="getProfitRateClass(user.periodProfit)">
                {{ formatCurrency(user.periodProfit) }}
              </span>
            </div>
            <div class="flex flex-col w-24 items-end justify-center">
              <span class="text-lg font-bold font-mono tabular-nums" :class="getProfitRateClass(user.periodProfitRate)">
                {{ user.periodProfitRate > 0 ? '+' : '' }}{{ user.periodProfitRate.toFixed(2) }}%
              </span>
            </div>
          </div>

          <!-- Chevron -->
          <div class="text-right flex-shrink-0 w-8">
            <div class="i-carbon-chevron-right text-gray-400 transition-transform duration-200" />
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-gray-400 py-20 text-center card">
      <div i-carbon-trophy class="text-5xl mx-auto mb-4 opacity-30" />
      <p>暂无排行数据</p>
    </div>

    <!-- 操作策略展示模态框 -->
    <Modal v-model="isStrategyModalOpen" :title="`${selectedStrategyUser?.username} 的操作策略`">
      <div class="pr-2 max-h-[60vh] overflow-y-auto">
        <pre class="text-sm text-gray-700 font-mono p-4 rounded-md bg-gray-50 whitespace-pre-wrap dark:text-gray-300 dark:bg-gray-800">{{ selectedStrategyUser?.aiSystemPrompt }}</pre>
      </div>
      <div class="mt-6 flex justify-end">
        <button class="btn" @click="isStrategyModalOpen = false">
          关闭
        </button>
      </div>
    </Modal>
  </div>
</template>
