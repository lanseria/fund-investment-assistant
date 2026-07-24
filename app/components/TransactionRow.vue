<script setup lang="ts">
import { formatCurrency } from '~/utils/format'

/**
 * 交易记录行组件。
 * 抽取自 TodayTransactionsCard / daily-ops 列表页 / daily-ops 详情页三处重复的交易行渲染。
 */
withDefaults(defineProps<{
  /** 单笔交易记录 */
  tx: any
  /** 是否显示"操作"列（如撤销按钮），默认不显示 */
  showActions?: boolean
}>(), {
  showActions: false,
})

const emit = defineEmits<{
  /** 撤销交易（点击撤销按钮时触发） */
  (e: 'delete', tx: any): void
}>()

const dayjs = useDayjs()

// --- 类型与状态样式映射（全站统一）---
const ACTION_STYLES: Record<string, string> = {
  buy: 'text-red-600 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800',
  sell: 'text-green-600 bg-green-50 border-green-100 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800',
  convert_in: 'text-purple-600 bg-purple-50 border-purple-100 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-800',
  convert_out: 'text-blue-600 bg-blue-50 border-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800',
}

const ACTION_LABELS: Record<string, string> = {
  buy: '买入',
  sell: '卖出',
  convert_in: '转入',
  convert_out: '转出',
}

function getActionStyle(type: string) {
  return ACTION_STYLES[type] || 'text-gray-600 bg-gray-50 border-gray-100'
}

function getActionLabel(type: string) {
  return ACTION_LABELS[type] || type
}
</script>

<template>
  <div
    class="group text-sm px-6 py-3 flex flex-col gap-3 transition-colors hover:bg-blue-50/30 sm:flex-row sm:gap-6 sm:items-center dark:hover:bg-gray-700/30"
    :class="{ 'opacity-60 grayscale': tx.status === 'failed' }"
  >
    <!-- 1. 时间 & 状态图标 -->
    <div class="text-xs text-gray-400 font-mono flex flex-shrink-0 gap-2 w-24 items-center">
      <span>{{ dayjs(tx.createdAt).format('HH:mm:ss') }}</span>
      <div v-if="tx.status === 'draft'" class="i-carbon-edit text-purple-500" title="预操作(草稿)" />
      <div v-else-if="tx.status === 'pending'" class="i-carbon-hourglass text-yellow-500" title="待确认" />
      <div v-else-if="tx.status === 'failed'" class="i-carbon-close-filled text-red-500" title="失败" />
      <div v-else class="i-carbon-checkmark-filled text-green-500" title="已确认" />
    </div>

    <!-- 2. 类型标签 -->
    <div class="flex-shrink-0 w-16">
      <span class="text-xs font-medium px-2 py-0.5 border rounded whitespace-nowrap" :class="getActionStyle(tx.type)">
        {{ getActionLabel(tx.type) }}
      </span>
    </div>

    <!-- 3. 基金名称、代码 -->
    <div class="flex flex-grow flex-col gap-1 min-w-0 sm:flex-row sm:gap-2 sm:items-center">
      <div class="flex gap-2 truncate items-baseline">
        <span class="text-gray-900 font-medium truncate dark:text-gray-100" :title="tx.fundName">
          {{ tx.fundName || '未知基金' }}
        </span>
        <span class="text-xs text-gray-500 font-mono flex-shrink-0">
          {{ tx.fundCode }}
        </span>
      </div>
    </div>

    <!-- 4. 申报详情 -->
    <div class="flex flex-shrink-0 gap-1 items-center sm:text-right sm:w-32 sm:justify-end">
      <span class="text-xs text-gray-400 sm:hidden">申报:</span>
      <span class="text-gray-700 font-medium font-mono dark:text-gray-300">
        <span v-if="tx.orderAmount">{{ formatCurrency(tx.orderAmount) }}</span>
        <span v-else>{{ Number(tx.orderShares).toFixed(4) }} 份</span>
      </span>
    </div>

    <!-- 5. 确认详情 / 备注 -->
    <div class="flex flex-shrink-0 gap-1 min-h-[20px] items-center sm:text-right sm:w-48 sm:justify-end">
      <template v-if="tx.status === 'confirmed'">
        <span class="text-xs text-gray-400 sm:hidden">成交:</span>
        <span class="text-gray-900 font-mono font-semibold dark:text-gray-100">
          <span v-if="tx.confirmedAmount">{{ formatCurrency(tx.confirmedAmount) }}</span>
          <span v-else>-</span>
        </span>
      </template>
      <template v-else-if="tx.note">
        <span class="text-xs text-gray-400 text-right w-full truncate italic" :title="tx.note">
          {{ tx.note }}
        </span>
      </template>
      <span v-else class="text-gray-300">-</span>
    </div>

    <!-- 6. 操作列（可选：撤销） -->
    <div v-if="showActions" class="flex-shrink-0 sm:text-right sm:w-16">
      <button
        v-if="tx.status === 'pending' || tx.status === 'draft'"
        class="text-xs text-red-500 hover:text-red-600 hover:underline"
        title="撤销此交易"
        @click="emit('delete', tx)"
      >
        撤销
      </button>
    </div>
  </div>
</template>
