<script setup lang="ts">
import type { Holding, SortableKey } from '~/types/holding'

const props = defineProps<{
  holdings: Holding[]
  sortKey: SortableKey | null
  sortOrder: 'asc' | 'desc'
}>()

const emit = defineEmits(['edit', 'delete', 'set-sort', 'clear-position'])

function setSort(key: SortableKey) {
  emit('set-sort', key)
}

const sortedHoldings = computed(() => {
  if (!props.sortKey)
    return props.holdings

  return [...props.holdings].sort((a, b) => {
    const key = props.sortKey!
    const valA = a[key] ?? -Infinity
    const valB = b[key] ?? -Infinity

    if (props.sortOrder === 'asc')
      return Number(valA) - Number(valB)
    else
      return Number(valB) - Number(valA)
  })
})

function getProfitClass(holding: Holding) {
  if (holding.holdingProfitAmount === null || holding.holdingProfitAmount === undefined)
    return 'text-gray-500'
  if (holding.holdingProfitAmount > 0)
    return 'text-red-500 dark:text-red-400'
  if (holding.holdingProfitAmount < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

function getChangeClass(holding: Holding) {
  if (holding.percentageChange === null || holding.percentageChange === undefined)
    return 'text-gray-500'
  if (holding.percentageChange > 0)
    return 'text-red-500 dark:text-red-400'
  if (holding.percentageChange < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}

// 获取信号标签样式的辅助函数
function getSignalTagClass(signal: string) {
  if (signal.includes('买入'))
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  if (signal.includes('卖出'))
    return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
  // 默认为持有/观望/平仓等中性信号
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300'
}

// 定义要显示的策略及其简称
const strategiesForTags = {
  rsi: 'RSI',
  macd: 'MACD',
  ma_cross: '均线',
  bollinger_bands: '布林',
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="text-left w-full table-fixed">
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="text-sm text-gray-600 font-semibold p-4 w-260px dark:text-gray-300">
              基金名称 / 策略信号
            </th>

            <!-- 合并 "持有金额" 和 "持有份额" 的表头，排序按 holdingAmount -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('holdingAmount')">
              持有市值 / 份额
              <span v-if="sortKey === 'holdingAmount'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('holdingProfitRate')">
              持有收益 / 收益率
              <span v-if="sortKey === 'holdingProfitRate'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up /><div v-else i-carbon-arrow-down />
              </span>
            </th>

            <!-- 合并 "估算涨跌" 和 "估算金额" 的表头，排序按 percentageChange -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('percentageChange')">
              估算涨跌 / 收益
              <span v-if="sortKey === 'percentageChange'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-24 dark:text-gray-300">
              更新时间
            </th>
            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-20 dark:text-gray-300">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in sortedHoldings" :key="h.code" class="border-b transition-colors dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <!-- 基金名称 -->
            <td class="font-semibold p-4">
              <NuxtLink :to="`/fund/${h.code}`" class="transition-colors hover:text-primary-hover">
                {{ h.name }}
                <div class="text-xs text-gray-400 font-normal font-numeric dark:text-gray-500">
                  {{ h.code }}
                </div>
              </NuxtLink>
              <!-- 策略信号标签容器 -->
              <div v-if="h.signals" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="(name, key) in strategiesForTags"
                  :key="key"
                  class="text-xs font-medium px-2 py-0.5 rounded-full"
                  :class="getSignalTagClass(h.signals[key] || '无信号')"
                >
                  {{ name }}: {{ h.signals[key] ? h.signals[key].slice(0, 1) : '-' }}
                </span>
              </div>
            </td>

            <!-- 持有市值和份额合并在一个单元格 -->
            <td class="font-mono p-4 text-right">
              <!-- 处理关注状态 -->
              <template v-if="h.holdingAmount !== null">
                <div class="font-numeric font-semibold">
                  {{ formatCurrency(h.holdingAmount) }}
                </div>
                <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                  {{ h.shares?.toFixed(2) }} 份
                </div>
                <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                  {{ h.yesterdayNav }}
                </div>
              </template>
              <template v-else>
                <span class="text-sm text-gray-400">仅关注</span>
              </template>
            </td>

            <!-- 持有收益和收益率 -->
            <td class="font-mono p-4 text-right" :class="getProfitClass(h)">
              <!-- 处理关注状态 -->
              <template v-if="h.holdingProfitRate !== null">
                <div class="font-numeric font-semibold">
                  {{ formatCurrency(h.holdingProfitAmount) }}
                </div>
                <div class="text-xs font-numeric">
                  {{ `${h.holdingProfitRate > 0 ? '+' : ''}${h.holdingProfitRate.toFixed(2)}%` }}
                </div>
                <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                  {{ h.costPrice }}
                </div>
              </template>
              <template v-else>
                <span class="text-gray-400">-</span>
              </template>
            </td>

            <!-- 估算涨跌和收益 -->
            <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
              <div class="font-numeric font-semibold">
                {{ h.percentageChange !== null ? `${h.percentageChange > 0 ? '+' : ''}${h.percentageChange.toFixed(2)}%` : '-' }}
              </div>
              <!-- 处理关注状态 -->
              <div v-if="h.todayEstimateAmount !== null && h.holdingAmount !== null" class="text-xs font-numeric">
                {{ formatCurrency(h.todayEstimateAmount - h.holdingAmount) }}
              </div>
              <div v-else class="text-xs font-numeric">
                -
              </div>
              <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                {{ h.todayEstimateNav !== null ? h.todayEstimateNav : '-' }}
              </div>
            </td>

            <!-- 更新时间 -->
            <td class="text-sm text-gray-500 font-numeric p-4 text-right">
              {{ h.todayEstimateUpdateTime ? useDayjs()(h.todayEstimateUpdateTime).format('HH:mm:ss') : '-' }}
            </td>

            <!-- 操作 -->
            <td class="p-4 text-right">
              <div class="flex gap-2 justify-end">
                <button class="icon-btn" title="修改" @click="emit('edit', h)">
                  <div i-carbon-edit />
                </button>
                <button
                  v-if="h.holdingAmount !== null"
                  class="icon-btn hover:text-orange-500"
                  title="清仓 (转为仅关注)"
                  @click="emit('clear-position', h)"
                >
                  <div i-carbon-shopping-cart-clear />
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
