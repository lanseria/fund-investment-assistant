<script setup lang="ts">
import { formatCurrency } from '~/utils/format'

const props = defineProps<{
  userId: number
}>()

const dayjs = useDayjs()
const todayStr = dayjs().format('YYYY-MM-DD')

const { data, pending, error, refresh } = useAsyncData(
  `today-txs-${props.userId}-${todayStr}`,
  () => apiFetch<{ user: any, txs: any[] }>(`/api/transactions/daily/${todayStr}/${props.userId}`),
)

// 暴露 refresh 给父组件以便在交易后主动更新
defineExpose({ refresh })

// --- 辅助显示函数 ---
function getActionStyle(type: string) {
  switch (type) {
    case 'buy': return 'text-red-600 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'
    case 'sell': return 'text-green-600 bg-green-50 border-green-100 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800'
    case 'convert_in': return 'text-purple-600 bg-purple-50 border-purple-100 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-800'
    case 'convert_out': return 'text-blue-600 bg-blue-50 border-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800'
    default: return 'text-gray-600 bg-gray-50 border-gray-100'
  }
}

function getActionLabel(type: string) {
  const map: Record<string, string> = {
    buy: '买入',
    sell: '卖出',
    convert_in: '转入',
    convert_out: '转出',
  }
  return map[type] || type
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-700/50">
      <h3 class="text-gray-800 font-bold dark:text-gray-200">
        今日操作 <span v-if="data" class="text-sm text-gray-500 font-normal">({{ data.txs.length }}笔)</span>
      </h3>
    </div>

    <div v-if="pending" class="py-8 flex justify-center">
      <div class="i-carbon-circle-dash text-3xl text-primary animate-spin" />
    </div>

    <div v-else-if="error" class="text-red-500 py-8 text-center">
      加载失败: {{ error.message }}
    </div>

    <div v-else-if="data && data.txs.length === 0" class="text-sm text-gray-400 p-8 text-center">
      今日暂无任何操作记录
    </div>

    <div v-else-if="data" class="max-h-[350px] overflow-y-auto divide-y dark:divide-gray-700">
      <div
        v-for="tx in data.txs"
        :key="tx.id"
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

        <!-- 3.  基金名称、代码 -->
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
      </div>
    </div>
  </div>
</template>
