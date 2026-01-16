<script setup lang="ts">
import type { Holding } from '~/types/holding'
import type { LeaderboardPeriod, LeaderboardUser } from '~/types/leaderboard'
import HoldingList from '~/components/HoldingList.vue'
import { appName } from '~/constants'

useHead({
  title: `收益率排行榜 - ${appName}`,
})

const periods: { label: string, value: LeaderboardPeriod }[] = [
  { label: '日榜 (Today)', value: '1d' },
  { label: '周榜 (Week)', value: '1w' },
  { label: '月榜 (Month)', value: '1m' },
  { label: '年榜 (Year)', value: '1y' },
]

const activePeriod = ref<LeaderboardPeriod>('1d')

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

// --- 展开/折叠逻辑 ---
const expandedUserId = ref<number | null>(null)
function toggleDetails(userId: number) {
  expandedUserId.value = expandedUserId.value === userId ? null : userId
}

// --- 异步获取持仓详情 ---
const { data: userHoldings, pending: holdingsPending, error: holdingsError } = useAsyncData(
  'leaderboard-details',
  () => {
    if (expandedUserId.value === null)
      return Promise.resolve(null)
    return apiFetch<Holding[]>(`/api/leaderboard/${expandedUserId.value}`)
  },
  { watch: [expandedUserId] },
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
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
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
          :class="{ 'bg-blue-50/30 dark:bg-blue-900/10': expandedUserId === user.id }"
          @click="toggleDetails(user.id)"
        >
          <!-- Rank -->
          <div class="text-center flex flex-shrink-0 w-12 justify-center">
            <div v-if="getRankIcon(user.rank)" :class="getRankIcon(user.rank)" />
            <span v-else class="text-lg text-gray-500 font-bold font-numeric">{{ user.rank }}</span>
          </div>

          <!-- User Info & Assets Breakdown -->
          <div class="pl-2 flex-grow min-w-0">
            <div class="flex gap-2 items-center">
              <span class="font-bold truncate">{{ user.username }}</span>
              <span v-if="user.isAiAgent" class="i-carbon-bot text-sm text-primary" title="AI 自动交易账户" />
            </div>

            <!-- 资产细分条 -->
            <div class="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span class="text-gray-800 font-medium dark:text-gray-300">
                总资产: {{ formatCurrency(user.totalAssets) }}
              </span>
              <span class="flex gap-1 items-center" title="持仓市值">
                <div class="rounded-full bg-blue-400 h-2 w-2" />
                {{ formatCurrency(user.fundValue) }}
              </span>
              <span class="flex gap-1 items-center" title="剩余资金">
                <div class="rounded-full bg-gray-300 h-2 w-2 dark:bg-gray-600" />
                {{ formatCurrency(user.cash) }}
              </span>
            </div>
          </div>

          <!-- Stats -->
          <div class="flex flex-shrink-0 gap-4 w-64 justify-end md:gap-8">
            <div class="flex flex-col w-24 items-end justify-center">
              <span class="font-numeric font-semibold" :class="getProfitRateClass(user.periodProfit)">
                {{ formatCurrency(user.periodProfit) }}
              </span>
            </div>
            <div class="flex flex-col w-24 items-end justify-center">
              <span class="text-lg font-bold font-numeric" :class="getProfitRateClass(user.periodProfitRate)">
                {{ user.periodProfitRate > 0 ? '+' : '' }}{{ user.periodProfitRate.toFixed(2) }}%
              </span>
            </div>
          </div>

          <!-- Chevron -->
          <div class="text-right flex-shrink-0 w-8">
            <div
              class="i-carbon-chevron-down text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': expandedUserId === user.id }"
            />
          </div>
        </div>

        <!-- Expanded Details (保持不变) -->
        <Transition name="slide">
          <div v-if="expandedUserId === user.id" class="border-t bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
            <div v-if="holdingsPending" class="text-primary py-6 flex justify-center">
              <div i-carbon-circle-dash class="text-xl animate-spin" />
            </div>
            <div v-else-if="holdingsError" class="text-sm text-red-500 py-6 text-center">
              无法加载持仓详情
            </div>
            <div v-else-if="userHoldings" class="p-0">
              <HoldingList
                :data="userHoldings"
                :is-grouped="false"
                :sort-key="null"
                sort-order="desc"
                :show-actions="false"
                class="bg-transparent !border-0 !rounded-none !shadow-none"
              />
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-gray-400 py-20 text-center card">
      <div i-carbon-trophy class="text-5xl mx-auto mb-4 opacity-30" />
      <p>暂无排行数据</p>
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition:
    max-height 0.3s ease-out,
    opacity 0.3s ease-out;
  max-height: 500px;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
