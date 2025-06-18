<script setup lang="ts">
import type { Holding } from '~/types/holding'

defineProps<{
  holdings: Holding[]
}>()

const emit = defineEmits(['edit', 'delete'])

function getChangeClass(holding: Holding) {
  // 使用新的 percentage_change 字段
  if (holding.percentage_change === null || holding.percentage_change === undefined)
    return 'text-gray'
  if (holding.percentage_change > 0)
    return 'text-red-500 dark:text-red-400'
  if (holding.percentage_change < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}
</script>

<template>
  <!-- 使用 card shortcut -->
  <div class="overflow-hidden card">
    <!-- 在小屏幕上，表格可以水平滚动 -->
    <div class="overflow-x-auto">
      <table class="text-left w-full table-auto">
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="text-sm text-gray-600 font-semibold p-4 dark:text-gray-300">
              基金名称
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              持有份额
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              持有金额
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              估算金额
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              估算涨跌
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in holdings" :key="h.code" class="border-b transition-colors dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <!-- 优化基金名称显示 -->
            <td class="font-semibold p-4">
              <NuxtLink :to="`/fund/${h.code}`" class="transition-colors hover:text-teal-500">
                {{ h.name }}
                <div class="text-xs text-gray-400 font-normal dark:text-gray-500">
                  {{ h.code }}
                </div>
              </NuxtLink>
            </td>
            <!-- 持有份额 -->
            <td class="text-sm font-mono p-4 text-right">
              {{ h.shares.toFixed(2) }}
            </td>
            <!-- 持有金额 -->
            <td class="font-mono p-4 text-right">
              {{ formatCurrency(h.holding_amount) }}
            </td>
            <!-- 估算金额 -->
            <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
              {{ h.today_estimate_amount ? formatCurrency(h.today_estimate_amount) : '-' }}
            </td>
            <!-- 估算涨跌幅 -->
            <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
              {{ h.percentage_change !== null ? `${h.percentage_change.toFixed(2)}%` : '-' }}
            </td>
            <td class="p-4 text-right space-x-2">
              <button class="icon-btn" title="修改" @click="emit('edit', h)">
                <div i-carbon-edit />
              </button>
              <button class="hover:text-red-500 icon-btn" title="删除" @click="emit('delete', h)">
                <div i-carbon-trash-can />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
