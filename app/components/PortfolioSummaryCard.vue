<!-- app/components/PortfolioSummaryCard.vue -->
<script setup lang="ts">
import type { HoldingSummary } from '~/types/holding'

// 定义组件接收的 props
const props = defineProps<{
  summary: HoldingSummary | null
  sseStatus: 'OPEN' | 'CONNECTING' | 'CLOSED' | string
}>()

// SSE 连接状态的文本显示
const sseStatusText = computed(() => {
  switch (props.sseStatus) {
    case 'OPEN':
      return '实时更新中'
    case 'CONNECTING':
      return '连接中...'
    case 'CLOSED':
      return '已断开'
    default:
      return '未知状态'
  }
})

// 格式化货币
function formatCurrency(value: number | undefined) {
  if (value === undefined)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}

// 根据数值正负返回不同的文本颜色类
function getChangeClass(value: number | undefined) {
  if (value === undefined || value === null)
    return 'text-gray'
  if (value > 0)
    return 'text-red-500 dark:text-red-400'
  if (value < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray'
}
</script>

<template>
  <div v-if="summary && summary.count > 0" class="mb-8 p-4 card relative">
    <!-- 状态指示器，放置在右上角 -->
    <div class="flex gap-2 items-center right-4 top-4 absolute">
      <span
        class="rounded-full h-2 w-2"
        :class="{
          'bg-green-500 animate-pulse': sseStatus === 'OPEN',
          'bg-yellow-500': sseStatus === 'CONNECTING',
          'bg-gray-400': sseStatus === 'CLOSED',
        }"
      />
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {{ sseStatusText }}
      </span>
    </div>
    <div class="gap-4 grid grid-cols-2 md:grid-cols-4">
      <!-- 持仓总成本 -->
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          持仓总成本
        </p>
        <p class="text-lg font-numeric font-semibold sm:text-xl">
          {{ formatCurrency(summary.totalHoldingAmount) }}
        </p>
      </div>
      <!-- 预估总市值 -->
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          预估总市值
        </p>
        <p class="text-lg font-numeric font-semibold sm:text-xl">
          {{ formatCurrency(summary.totalEstimateAmount) }}
        </p>
      </div>
      <!-- 预估总盈亏 -->
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          预估总盈亏
        </p>
        <p class="text-lg font-numeric font-semibold sm:text-xl" :class="getChangeClass(summary.totalProfitLoss)">
          {{ summary.totalProfitLoss.toFixed(2) }}
        </p>
      </div>
      <!-- 预估涨跌幅 -->
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          预估涨跌幅
        </p>
        <p class="text-lg font-numeric font-semibold sm:text-xl" :class="getChangeClass(summary.totalPercentageChange)">
          {{ summary.totalPercentageChange.toFixed(2) }}%
        </p>
      </div>
    </div>
  </div>
</template>
