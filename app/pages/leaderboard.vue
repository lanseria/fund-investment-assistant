<!-- app/pages/leaderboard.vue -->
<script setup lang="ts">
import type { LeaderboardUser } from '~/types/leaderboard'
import { appName } from '~/constants'

useHead({
  title: `收益率排行榜 - ${appName}`,
})

const { data: leaderboardData, pending, error } = useAsyncData(
  'leaderboard',
  () => apiFetch<LeaderboardUser[]>('/api/leaderboard'),
)

// 根据收益率获取文本颜色 (此函数可复用)
function getProfitRateClass(rate: number) {
  if (rate > 0)
    return 'text-red-500 dark:text-red-400'
  if (rate < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

// 获取排名对应的奖牌图标 (此函数不变)
function getRankIcon(rank: number) {
  if (rank === 1)
    return 'i-twemoji-1st-place-medal text-2xl'
  if (rank === 2)
    return 'i-twemoji-2nd-place-medal text-2xl'
  if (rank === 3)
    return 'i-twemoji-3rd-place-medal text-2xl'
  return ''
}

// [新增] 格式化货币的辅助函数
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

    <!-- 加载、错误、空状态 (保持不变) -->
    <div v-if="pending" class="card flex h-64 items-center justify-center">
      ...
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      ...
    </div>

    <!-- [重大修改] 重新设计数据展示部分以容纳更多信息 -->
    <div v-else-if="leaderboardData && leaderboardData.length > 0" class="p-4 card space-y-2">
      <div
        v-for="user in leaderboardData"
        :key="user.rank"
        class="p-3 rounded-md flex transition-colors items-center hover:bg-gray-100 dark:hover:bg-gray-700/50"
      >
        <!-- 排名 (保持不变) -->
        <div class="text-lg font-bold text-center flex-shrink-0 w-12" :class="getRankIcon(user.rank) || 'text-gray-400'">
          <span v-if="!getRankIcon(user.rank)">{{ user.rank }}</span>
        </div>

        <!-- 用户名和持仓数 (保持不变) -->
        <div class="flex-grow">
          <p class="font-semibold">
            {{ user.username }}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            持有 {{ user.holdingCount }} 只基金
          </p>
        </div>

        <!-- [新布局] 右侧数据区，分为两列 -->
        <div class="flex flex-shrink-0 gap-6 items-start justify-end">
          <!-- 今日数据列 -->
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
          <!-- 累计数据列 -->
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
      </div>
    </div>

    <!-- 空状态 (保持不变) -->
    <div v-else class="text-gray-500 py-20 text-center card">
      ...
    </div>
  </div>
</template>
