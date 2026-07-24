<script setup lang="ts">
import type { ProfitMetrics } from '~/composables/useProfitMetrics'

/**
 * 收益风险指标卡：展示最大回撤、年化波动率、夏普比率、年化收益等风险维度。
 * 填补原收益分析页"只看收益不看风险"的空白。
 */
defineProps<{
  metrics: ProfitMetrics
}>()

function drawdownColor(val: number): string {
  if (val <= 0)
    return 'text-gray-500'
  if (val < 10)
    return 'text-green-500 dark:text-green-400'
  if (val < 20)
    return 'text-amber-500 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}

function sharpeColor(val: number): string {
  if (val >= 1)
    return 'text-red-500 dark:text-red-400'
  if (val >= 0.5)
    return 'text-amber-500 dark:text-amber-400'
  return 'text-gray-500'
}
</script>

<template>
  <div class="card">
    <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-700/50">
      <h3 class="text-gray-800 font-bold dark:text-gray-200">
        风险指标
      </h3>
      <span class="text-xs text-gray-400">{{ metrics.profitableDays }}盈 / {{ metrics.losingDays }}亏</span>
    </div>
    <div class="p-4 gap-4 grid grid-cols-2 md:grid-cols-4">
      <StatCard
        label="最大回撤"
        :value="`-${metrics.maxDrawdown.toFixed(2)}%`"
        :value-class="drawdownColor(metrics.maxDrawdown)"
        hint="峰值到谷值最大跌幅"
      />
      <StatCard
        label="年化波动率"
        :value="`${metrics.annualizedVolatility.toFixed(2)}%`"
        hint="收益波动幅度"
      />
      <StatCard
        label="夏普比率"
        :value="metrics.sharpeRatio.toFixed(2)"
        :value-class="sharpeColor(metrics.sharpeRatio)"
        hint="越高越好，>1优秀"
      />
      <StatCard
        label="年化收益"
        :value="`${metrics.annualizedReturn > 0 ? '+' : ''}${metrics.annualizedReturn.toFixed(2)}%`"
        :colored="true"
        hint="折算年化"
      />
    </div>
  </div>
</template>
