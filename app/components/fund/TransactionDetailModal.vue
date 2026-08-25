<script setup lang="ts">
import { formatCurrency } from '~/utils/format'

/**
 * 交易详情模态框：展示图表交易标注点点击后的交易列表
 * （确认金额 / 确认份额 / 确认净值）。
 */
const props = defineProps<{
  /** 模态框开关（v-model） */
  modelValue: boolean
  /** 交易记录列表 */
  transactions: any[]
}>()

const emit = defineEmits<{
  (e: 'update:model-value', value: boolean): void
}>()

// 交易类型 → 文案与文字配色（页面展示用；图表内的 ECharts 配色见 strategy-charts/marks.ts）
function getTransactionTypeInfo(type: string) {
  switch (type) {
    case 'buy': return { label: '买入', color: 'text-red-500' }
    case 'sell': return { label: '卖出', color: 'text-green-500' }
    case 'convert_in': return { label: '转换转入', color: 'text-purple-500' }
    case 'convert_out': return { label: '转换转出', color: 'text-blue-500' }
    default: return { label: type, color: 'text-gray-500' }
  }
}
</script>

<template>
  <Modal :model-value="props.modelValue" :title="`交易详情 (${props.transactions.length}笔)`" @update:model-value="emit('update:model-value', $event)">
    <div v-if="props.transactions.length > 0" class="pr-1 max-h-[60vh] overflow-y-auto space-y-4">
      <!-- 遍历交易列表 -->
      <div v-for="tx in props.transactions" :key="tx.id" class="p-4 rounded-md bg-gray-100 dark:bg-gray-700">
        <div class="mb-2 flex items-baseline justify-between">
          <span class="text-lg font-bold" :class="getTransactionTypeInfo(tx.type).color">
            {{ getTransactionTypeInfo(tx.type).label }}
          </span>
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ tx.orderDate }}
          </span>
        </div>

        <div class="text-sm pt-2 border-t gap-2 grid dark:border-gray-600">
          <div class="flex justify-between">
            <span class="text-gray-500">确认金额</span>
            <span class="font-mono">{{ tx.confirmedAmount ? formatCurrency(tx.confirmedAmount) : '-' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">确认份额</span>
            <span class="font-mono">{{ tx.confirmedShares ? `${Number(tx.confirmedShares).toFixed(2)} 份` : '-' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">确认净值</span>
            <span class="font-mono">{{ tx.confirmedNav ? Number(tx.confirmedNav).toFixed(4) : '-' }}</span>
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>
