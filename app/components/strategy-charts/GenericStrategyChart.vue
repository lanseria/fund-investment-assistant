<script setup lang="ts">
import type { HoldingHistoryPoint } from '~/types/holding'

defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  transactions?: any[] // 接收交易记录
  title: string
  dataZoomStart: number
  dataZoomEnd: number
}>()

const emit = defineEmits(['signal-click', 'transaction-click'])

function handleSignalClick(signal: any) {
  emit('signal-click', signal)
}
function handleTransactionClick(tx: any) {
  emit('transaction-click', tx)
}
</script>

<template>
  <div class="p-4 card">
    <FundChart
      :history="history"
      :signals="signals"
      :transactions="transactions"
      :title="title"
      :data-zoom-start="dataZoomStart"
      :data-zoom-end="dataZoomEnd"
      @signal-click="handleSignalClick"
      @transaction-click="handleTransactionClick"
    />
  </div>
</template>
