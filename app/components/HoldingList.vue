<!-- File: app/components/HoldingList.vue -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'

const props = defineProps<{
  holdings: Holding[]
}>()

const emit = defineEmits(['edit', 'delete'])

// --- [新增] 排序功能 ---
// 1. 定义可排序的字段类型，增强类型安全
type SortableKey = 'shares' | 'holdingAmount' | 'todayEstimateAmount' | 'percentageChange'

// 2. 创建管理排序状态的 ref
const sortKey = ref<SortableKey | null>(null)
const sortOrder = ref<'asc' | 'desc'>('desc') // 默认降序

// 3. 点击表头时调用的排序方法
function setSort(key: SortableKey) {
  // 如果点击的是当前已排序的列，则切换排序顺序
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  // 如果点击的是新的一列，则设置新的排序列，并重置为默认的降序
  else {
    sortKey.value = key
    sortOrder.value = 'desc'
  }
}

// 4. 创建计算属性，用于返回排序后的数组
const sortedHoldings = computed(() => {
  // 如果没有设置排序列，直接返回原始数组的副本
  if (!sortKey.value) {
    return props.holdings
  }

  // 创建一个数组副本进行排序，以避免直接修改 props
  return [...props.holdings].sort((a, b) => {
    const key = sortKey.value!
    // 对于可能为 null 的值（如估算金额），我们给一个极小值，确保排序时它们总是在一端
    const valA = a[key] ?? -Infinity
    const valB = b[key] ?? -Infinity

    if (sortOrder.value === 'asc') {
      return Number(valA) - Number(valB)
    }
    else {
      return Number(valB) - Number(valA)
    }
  })
})
// --- 排序功能结束 ---

function getChangeClass(holding: Holding) {
  if (holding.percentageChange === null || holding.percentageChange === undefined)
    return 'text-gray'
  if (holding.percentageChange > 0)
    return 'text-red-500 dark:text-red-400'
  if (holding.percentageChange < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="text-left w-full table-auto">
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="text-sm text-gray-600 font-semibold p-4 dark:text-gray-300">
              基金名称
            </th>

            <!-- [修改] 添加点击事件和动态类名 -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('shares')">
              持有份额
              <!-- 排序指示器 -->
              <span v-if="sortKey === 'shares'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <!-- [修改] 添加点击事件和动态类名 -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('holdingAmount')">
              持有金额
              <span v-if="sortKey === 'holdingAmount'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <!-- [修改] 添加点击事件和动态类名 -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('todayEstimateAmount')">
              估算金额
              <span v-if="sortKey === 'todayEstimateAmount'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <!-- [修改] 添加点击事件和动态类名 -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('percentageChange')">
              估算涨跌
              <span v-if="sortKey === 'percentageChange'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              更新时间
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right dark:text-gray-300">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- [修改] v-for 循环现在遍历 sortedHoldings -->
          <tr v-for="h in sortedHoldings" :key="h.code" class="border-b transition-colors dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="font-semibold p-4">
              <NuxtLink :to="`/fund/${h.code}`" class="transition-colors hover:text-teal-500">
                {{ h.name }}
                <div class="text-xs text-gray-400 font-normal dark:text-gray-500">
                  {{ h.code }}
                </div>
              </NuxtLink>
            </td>
            <td class="font-mono p-4 text-right">
              {{ h.shares.toFixed(2) }}
            </td>
            <td class="font-mono p-4 text-right">
              {{ formatCurrency(h.holdingAmount) }}
            </td>
            <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
              {{ h.todayEstimateAmount ? formatCurrency(h.todayEstimateAmount) : '-' }}
            </td>
            <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
              {{ h.percentageChange !== null ? `${h.percentageChange.toFixed(2)}%` : '-' }}
            </td>
            <td class="p-4 text-right">
              {{ useDayjs()(h.todayEstimateUpdateTime).format('MM-DD HH:mm') }}
            </td>
            <td class="p-4 text-right">
              <div class="flex gap-2 justify-end">
                <button class="icon-btn" title="修改" @click="emit('edit', h)">
                  <div i-carbon-edit />
                </button>
                <button class="icon-btn hover:text-red-500" title="删除" @click="emit('delete', h)">
                  <div i-carbon-trash-can />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
