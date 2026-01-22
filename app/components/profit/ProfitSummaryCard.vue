<script setup lang="ts">
import { formatCurrency } from '~/utils/format'

defineProps<{
  yesterdayProfit: number
  yearProfit: number
  totalProfitRate: number
  totalAssets: number
}>()

function getColor(val: number) {
  if (val > 0)
    return 'text-red-500 dark:text-red-400'
  if (val < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}
</script>

<template>
  <div class="mb-6 p-4 card gap-4 grid grid-cols-2 md:grid-cols-4">
    <!-- 总资产 -->
    <div class="p-2 flex flex-col gap-1">
      <span class="text-xs text-gray-500 dark:text-gray-400">当前总资产</span>
      <span class="text-xl font-bold font-numeric">{{ formatCurrency(totalAssets) }}</span>
    </div>

    <!-- 昨日收益 -->
    <div class="p-2 flex flex-col gap-1">
      <span class="text-xs text-gray-500 dark:text-gray-400">昨日收益</span>
      <span class="text-xl font-bold font-numeric" :class="getColor(yesterdayProfit)">
        {{ yesterdayProfit > 0 ? '+' : '' }}{{ formatCurrency(yesterdayProfit) }}
      </span>
    </div>

    <!-- 本年收益 -->
    <div class="p-2 flex flex-col gap-1">
      <span class="text-xs text-gray-500 dark:text-gray-400">本年收益</span>
      <span class="text-xl font-bold font-numeric" :class="getColor(yearProfit)">
        {{ yearProfit > 0 ? '+' : '' }}{{ formatCurrency(yearProfit) }}
      </span>
    </div>

    <!-- 累计收益率 -->
    <div class="p-2 flex flex-col gap-1">
      <span class="text-xs text-gray-500 dark:text-gray-400">累计收益率</span>
      <span class="text-xl font-bold font-numeric" :class="getColor(totalProfitRate)">
        {{ totalProfitRate > 0 ? '+' : '' }}{{ totalProfitRate.toFixed(2) }}%
      </span>
    </div>
  </div>
</template>
