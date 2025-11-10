<script setup lang="ts">
import type { Holding } from '~/types/holding'
import type { LeaderboardUser } from '~/types/leaderboard'
import HoldingList from '~/components/HoldingList.vue'
import { appName } from '~/constants'

useHead({
  title: `收益率排行榜 - ${appName}`,
})

const { data: leaderboardData, pending, error } = useAsyncData(
  'leaderboard',
  () => apiFetch<LeaderboardUser[]>('/api/leaderboard'),
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
  { watch: [expandedUserId] }, // 监听 expandedUserId 的变化
)

// 样式和格式化函数 (保持不变)
function getProfitRateClass(rate: number) {
  if (rate > 0)
    return 'text-red-500 dark:text-red-400'
  if (rate < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}
function getRankIcon(rank: number) {
  if (rank === 1)
    return 'i-twemoji-1st-place-medal text-2xl'
  if (rank === 2)
    return 'i-twemoji-2nd-place-medal text-2xl'
  if (rank === 3)
    return 'i-twemoji-3rd-place-medal text-2xl'
  return ''
}
function formatCurrency(value: number) {
  if (value === null || value === undefined)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-8">
      <h1 class="text-2xl font-bold sm:text-3xl">
        收益率排行榜
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        看看投资大神们的表现 (Top 20)
      </p>
    </header>

    <!-- 加载、错误、空状态  -->
    <div v-if="pending" class="card flex h-64 items-center justify-center">
      ...
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      ...
    </div>

    <!-- 数据展示区域 -->
    <div v-else-if="leaderboardData && leaderboardData.length > 0" class="card overflow-hidden">
      <div v-for="user in leaderboardData" :key="user.id" class="border-b last:border-b-0 dark:border-gray-700">
        <!-- 可点击的用户信息行 -->
        <div class="p-3 flex cursor-pointer transition-colors items-center hover:bg-gray-100 dark:hover:bg-gray-700/50" @click="toggleDetails(user.id)">
          <!-- ... (用户信息内容保持不变) ... -->
          <div class="text-lg font-bold text-center flex-shrink-0 w-12" :class="getRankIcon(user.rank) || 'text-gray-400'">
            <span v-if="!getRankIcon(user.rank)">{{ user.rank }}</span>
          </div>
          <div class="flex-grow">
            <p class="font-semibold">
              {{ user.username }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              持有 {{ user.holdingCount }} 只基金
            </p>
          </div>
          <div class="flex flex-shrink-0 gap-6 items-start justify-end">
            <div class="flex flex-col w-32 items-end">
              <p class="text-sm font-numeric font-semibold" :class="getProfitRateClass(user.todayProfitLoss)">
                {{ formatCurrency(user.todayProfitLoss) }}
              </p>
              <p class="text-xs font-numeric" :class="getProfitRateClass(user.todayProfitRate)">
                {{ user.todayProfitRate > 0 ? '+' : '' }}{{ user.todayProfitRate.toFixed(2) }}%
              </p>
              <p class="text-xs text-gray-400 mt-1">
                今日盈亏
              </p>
            </div>
            <div class="flex flex-col w-32 items-end">
              <p class="text-sm font-numeric font-semibold" :class="getProfitRateClass(user.profitRate)">
                {{ user.profitRate.toFixed(2) }}%
              </p>
              <p class="text-xs text-gray-500 font-numeric">
                {{ formatCurrency(user.totalCost) }}
              </p>
              <p class="text-xs text-gray-400 mt-1">
                总收益率 / 成本
              </p>
            </div>
          </div>
          <!-- 展开/折叠图标 -->
          <div
            class="i-carbon-chevron-down text-lg ml-4 transition-transform duration-300"
            :class="{ 'rotate-180': expandedUserId === user.id }"
          />
        </div>

        <!-- 展开的持仓详情区域 -->
        <Transition name="slide-fade">
          <div v-if="expandedUserId === user.id" class="bg-gray-50/50 dark:bg-black/20">
            <div v-if="holdingsPending" class="p-8 flex items-center justify-center">
              <div i-carbon-circle-dash class="text-2xl text-primary animate-spin" />
              <span class="ml-2">正在加载持仓详情...</span>
            </div>
            <div v-else-if="holdingsError" class="text-red-500 p-8 text-center">
              加载持仓失败: {{ holdingsError.message }}
            </div>
            <HoldingList v-else-if="userHoldings" :data="userHoldings" :is-grouped="false" :sort-key="null" sort-order="desc" :show-actions="false" class="!rounded-none !shadow-none" />
          </div>
        </Transition>
      </div>
    </div>

    <!-- 空状态  -->
    <div v-else class="text-gray-500 py-20 text-center card">
      ...
    </div>
  </div>
</template>

<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(1, 0.5, 0.8, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
