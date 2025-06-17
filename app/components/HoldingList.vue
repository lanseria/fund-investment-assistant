<script setup lang="ts">
import type { Holding } from '~/types/holding'

defineProps<{
  holdings: Holding[]
}>()

const emit = defineEmits(['edit', 'delete'])

function getChangeClass(holding: Holding) {
  if (!holding.today_estimate_nav)
    return 'text-gray'
  const change = holding.today_estimate_nav - holding.yesterday_nav
  if (change > 0)
    return 'text-red-500'
  if (change < 0)
    return 'text-green-500'
  return 'text-gray'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}
</script>

<template>
  <!-- 使用 card shortcut -->
  <div class="card overflow-hidden">
    <!-- 在小屏幕上，表格可以水平滚动 -->
    <div class="overflow-x-auto">
      <table class="text-left w-full table-auto">
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <!-- 增加内边距和字体样式 -->
            <th class="text-sm text-gray-600 font-semibold p-4 dark:text-gray-300">
              基金名称
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              持有金额
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right hidden dark:text-gray-300 sm:table-cell">
              昨日净值
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              今日估值
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
            <td class="font-mono p-4 text-right">
              {{ formatCurrency(h.holding_amount) }}
            </td>
            <!-- sm:table-cell: 在小屏幕 (sm) 以下隐藏 -->
            <td class="font-mono p-4 text-right hidden sm:table-cell">
              {{ h.yesterday_nav.toFixed(4) }}
            </td>
            <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
              {{ h.today_estimate_nav?.toFixed(4) || '-' }}
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
