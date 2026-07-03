<script setup lang="ts">
import type { HoldingSummary } from '~/types/holding'
import { formatCurrency } from '~/utils/format'

const props = defineProps<{
  summary: HoldingSummary | null
  sseStatus: 'OPEN' | 'CONNECTING' | 'CLOSED' | string
}>()

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
    <!-- 状态指示器 -->
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

    <!-- 第一行：总资产 + 现金 + 持仓总成本 + 预估总市值 -->
    <div class="gap-4 grid grid-cols-2 md:grid-cols-4">
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          总资产
        </p>
        <p class="text-lg font-mono font-semibold tabular-nums sm:text-xl">
          {{ formatCurrency(summary.totalAssets) }}
        </p>
      </div>
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          现金
        </p>
        <p class="text-lg font-mono font-semibold tabular-nums sm:text-xl">
          {{ formatCurrency(summary.cash) }}
        </p>
      </div>
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          持仓总成本
        </p>
        <p class="text-lg font-mono font-semibold tabular-nums sm:text-xl">
          {{ formatCurrency(summary.totalHoldingAmount) }}
        </p>
      </div>
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          预估总市值
        </p>
        <p class="text-lg font-mono font-semibold tabular-nums sm:text-xl">
          {{ formatCurrency(summary.totalEstimateAmount) }}
        </p>
      </div>
    </div>

    <!-- 第二行：预估总盈亏 + 预估涨跌幅 -->
    <div class="mt-2 pt-3 border-t border-gray-100 gap-4 grid grid-cols-2 dark:border-gray-700">
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          预估总盈亏
          <span v-if="summary.staleCount > 0" class="text-xs text-amber-500 dark:text-amber-400">
            (已排除 {{ summary.staleCount }} 只过期基金)
          </span>
        </p>
        <p class="text-lg font-mono font-semibold tabular-nums sm:text-xl" :class="getChangeClass(summary.totalProfitLoss)">
          {{ summary.totalProfitLoss.toFixed(2) }}
        </p>
      </div>
      <div class="p-2">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          预估涨跌幅
          <span v-if="summary.staleCount > 0" class="text-xs text-amber-500 dark:text-amber-400">
            (已排除 {{ summary.staleCount }} 只过期基金)
          </span>
        </p>
        <p class="text-lg font-mono font-semibold tabular-nums sm:text-xl" :class="getChangeClass(summary.totalPercentageChange)">
          {{ summary.totalPercentageChange.toFixed(2) }}%
        </p>
      </div>
    </div>
  </div>
</template>
