<script setup lang="ts">
import { formatCurrency } from '~/utils/format'

definePageMeta({
  layout: 'account',
})

const authStore = useAuthStore()
const holdingStore = useHoldingStore()
const { summary } = storeToRefs(holdingStore)

// 快捷入口
const quickLinks = [
  { to: '/profit-analysis', label: '收益分析', icon: 'i-carbon-chart-line-data', desc: '查看收益与风险', external: true },
  { to: '/account/personal-info', label: '个人信息', icon: 'i-carbon-user-avatar', desc: '账户与 AI 设置' },
  { to: '/', label: '我的持仓', icon: 'i-carbon-portfolio', desc: '管理基金组合', external: true },
]

// 管理员快捷入口（仅 admin 可见）
const adminLinks = [
  { to: '/account/users', label: '用户管理', icon: 'i-carbon-group-account', desc: '管理所有用户' },
  { to: '/account/funds', label: '基金管理', icon: 'i-carbon-currency', desc: '管理基金库' },
  { to: '/account/dictionaries', label: '字典管理', icon: 'i-carbon-book', desc: '配置字典数据' },
]
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold">
        账户总览
      </h1>
      <p v-if="authStore.user" class="text-sm text-gray-500 mt-1 dark:text-gray-400">
        你好，{{ authStore.user.username }}
        <span
          class="text-xs ml-2 px-2 py-0.5 rounded-full"
          :class="authStore.isAdmin ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'"
        >
          {{ authStore.user.role }}
        </span>
        <span v-if="authStore.user.aiMode !== 'off'" class="ml-2">
          <AiAgentBadge :mode="authStore.user.aiMode" />
        </span>
      </p>
    </div>

    <!-- 投资概览 -->
    <div class="mb-6 p-5 border rounded-lg bg-white dark:border-gray-700 dark:bg-gray-800">
      <h2 class="text-sm text-gray-500 font-semibold mb-4 dark:text-gray-400">
        投资概览
      </h2>
      <div v-if="summary" class="gap-4 grid grid-cols-2 md:grid-cols-4">
        <StatCard label="总资产" :value="formatCurrency(summary.totalAssets)" hint="现金 + 持仓" />
        <StatCard label="持仓市值" :value="formatCurrency(summary.totalEstimateAmount)" :hint="`持仓 ${summary.count} 只`" />
        <StatCard label="累计盈亏" :value="formatCurrency(summary.totalProfitLoss)" :colored="true" :hint="`${summary.totalPercentageChange > 0 ? '+' : ''}${summary.totalPercentageChange.toFixed(2)}%`" />
        <StatCard label="可用现金" :value="formatCurrency(authStore.user?.availableCash)" />
      </div>
      <EmptyState
        v-else
        icon="i-carbon-chart-bar"
        message="暂无持仓数据"
        description="添加基金后将在此展示投资概览"
      >
        <NuxtLink to="/" class="text-sm btn mt-2">
          去添加基金
        </NuxtLink>
      </EmptyState>
    </div>

    <!-- 快捷入口 -->
    <div class="mb-6">
      <h2 class="text-sm text-gray-500 font-semibold mb-3 dark:text-gray-400">
        快捷入口
      </h2>
      <div class="gap-3 grid grid-cols-1 md:grid-cols-3 sm:grid-cols-2">
        <component
          :is="link.external ? 'NuxtLink' : 'NuxtLink'"
          v-for="link in quickLinks"
          :key="link.to"
          :to="link.to"
          class="p-4 border rounded-lg bg-white flex gap-3 transition-all items-center dark:border-gray-700 hover:border-primary/30 dark:bg-gray-800 hover:shadow-md"
        >
          <div :class="link.icon" class="text-2xl text-primary flex-shrink-0" />
          <div>
            <p class="text-sm font-medium">
              {{ link.label }}
            </p>
            <p class="text-xs text-gray-400 mt-0.5">
              {{ link.desc }}
            </p>
          </div>
        </component>
      </div>
    </div>

    <!-- 管理员入口 -->
    <div v-if="authStore.isAdmin">
      <h2 class="text-sm text-gray-500 font-semibold mb-3 dark:text-gray-400">
        管理功能
      </h2>
      <div class="gap-3 grid grid-cols-1 md:grid-cols-3 sm:grid-cols-2">
        <NuxtLink
          v-for="link in adminLinks"
          :key="link.to"
          :to="link.to"
          class="p-4 border rounded-lg bg-white flex gap-3 transition-all items-center dark:border-gray-700 hover:border-primary/30 dark:bg-gray-800 hover:shadow-md"
        >
          <div :class="link.icon" class="text-2xl text-amber-500 flex-shrink-0" />
          <div>
            <p class="text-sm font-medium">
              {{ link.label }}
            </p>
            <p class="text-xs text-gray-400 mt-0.5">
              {{ link.desc }}
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
